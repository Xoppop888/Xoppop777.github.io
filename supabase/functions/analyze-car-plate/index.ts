// Edge Function: get-vtb-cny-rate
//
// Провайдер выбирается автоматически по тому, какой ключ настроен (по приоритету):
//   1) ZAI_API_KEY  → Z.AI (GLM-4.6V-Flash/GLM-4.7-Flash), постоянный бесплатный тариф.
//   2) GROQ_API_KEY → Groq.
//   3) GEMINI_API_KEY → Gemini, использует встроенный url_context (сам открывает страницу ВТБ).
//
// У Z.AI и Groq нет инструмента "открыть страницу в интернете" — поэтому для них
// страница ВТБ скачивается ЗДЕСЬ, на бэкенде (обычным fetch), очищается от тегов
// и передаётся модели уже как текст для извлечения курса. Gemini использует
// собственный url_context и получает страницу самостоятельно.
//
// Секреты (Supabase Secrets):
//   ZAI_API_KEY=...             ZAI_MODEL=glm-4.6v-flash        ZAI_API_BASE_URL=... (опц., напр. open.bigmodel.cn)
//   GROQ_API_KEY=...            GROQ_MODEL=qwen/qwen3.6-27b
//   GEMINI_API_KEY=...          GEMINI_VTB_MODEL=gemini-3.7-flash   GEMINI_API_BASE_URL=... (опц., напр. qcode.cc)
//
// Deploy:
//   supabase functions deploy get-vtb-cny-rate

import { corsHeaders, jsonResponse, supabaseAdmin, requireUser, isRateLimited } from "../_shared/http.ts";

const CACHE_MINUTES = 10;
const RATE_LIMIT = 3;
const RATE_LIMIT_WINDOW_MIN = 10;
const VTB_URL = "https://www.vtb.ru/personal/platezhi-i-perevody/obmen-valjuty/yuan/";

const ZAI_DEFAULT_MODEL = "glm-4.6v-flash";
const GROQ_DEFAULT_MODEL = "qwen/qwen3.6-27b";
const GEMINI_DEFAULT_MODEL = "gemini-3.7-flash";
const ZAI_API_BASE_URL = Deno.env.get("ZAI_API_BASE_URL") || "https://api.z.ai/api/paas/v4/chat/completions";
const GEMINI_API_BASE =
  Deno.env.get("GEMINI_API_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta/models";

interface RateAnswer {
  rate: number | null;
  direction: "sell" | "buy" | "mid" | null;
  date: string | null;
  confidence: number;
  source_note: string;
}

const fetchCbrCny = async (): Promise<number | null> => {
  try {
    const url = Deno.env.get("CBR_API_URL") ?? "https://www.cbr.ru/scripts/XML_daily.asp";
    const res = await fetch(url, { headers: { Accept: "application/xml, text/xml, */*" } });
    if (!res.ok) return null;
    const xml = await res.text();
    const block = xml.match(/<Valute[^>]*>\s*<NumCode>156<\/NumCode>[\s\S]*?<Nominal>(\d+)<\/Nominal>[\s\S]*?<Value>([\d.,]+)<\/Value>/);
    if (!block) return null;
    const nominal = Number(block[1]);
    const value = Number(block[2].replace(",", "."));
    if (!nominal || !Number.isFinite(value)) return null;
    return value / nominal;
  } catch {
    return null;
  }
};

/** Скачивает страницу ВТБ и грубо очищает от разметки — для провайдеров без своего браузера. */
async function fetchVtbPageText(): Promise<string> {
  const res = await fetch(VTB_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AutoChinaCalculator/1.0)" },
  });
  if (!res.ok) throw new Error(`Не удалось загрузить страницу ВТБ (HTTP ${res.status})`);
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) throw new Error("Страница ВТБ загрузилась пустой");
  return text.slice(0, 20000);
}

function extractJsonFromText(text: string): RateAnswer | null {
  try {
    return JSON.parse(text) as RateAnswer;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as RateAnswer;
    } catch {
      return null;
    }
  }
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status !== 503) return res;
    last = res;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return last!;
}

/** Общий текстовый промпт для провайдеров без браузера (Z.AI, Groq) — страница уже передана текстом. */
function buildTextPrompt(pageText: string, today: string): string {
  return `Ты извлекаешь банковский курс из текста официальной страницы ВТБ (обмен валюты, юань).
Сегодня: ${today}.

Ниже — очищенный от разметки текст страницы ${VTB_URL}:
"""
${pageText}
"""

Твоя задача — найти АКТУАЛЬНЫЙ курс CNY/RUB. Для калькулятора автомобиля клиент ПОКУПАЕТ юани за рубли,
поэтому нужен именно курс ПРОДАЖИ CNY банком ВТБ.

Правила:
1. Не придумывай курс — используй только то, что реально есть в переданном тексте.
2. Не используй курс ЦБ РФ как замену курсу ВТБ.
3. Если в тексте есть покупка и продажа — выбери ПРОДАЖУ.
4. Если курс указан за 10 или 100 CNY, пересчитай в рубли за 1 CNY.
5. Если в переданном тексте нет подтверждаемого актуального курса ВТБ — верни rate=null.
6. Верни только JSON, без markdown и пояснений.

Формат ответа (строго один JSON-объект):
{
  "rate": число или null,
  "direction": "sell" | "buy" | "mid" | null,
  "date": "YYYY-MM-DD" | null,
  "confidence": число от 0 до 1,
  "source_note": "краткое описание того, где найден курс в тексте"
}`;
}

/** Z.AI — GLM-4.6V-Flash/GLM-4.7-Flash, текстовый режим (страница передана нами). */
async function callZai(apiKey: string, pageText: string, today: string) {
  const model = Deno.env.get("ZAI_MODEL") || ZAI_DEFAULT_MODEL;
  const res = await fetchWithRetry(ZAI_API_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: buildTextPrompt(pageText, today) }],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = payload?.error?.message || `Z.AI HTTP ${res.status}`;
    if (res.status === 429 || res.status === 503) {
      throw { userMessage: "Z.AI сейчас перегружен или превышен лимит запросов. Подождите минуту.", code: "ZAI_OVERLOADED" };
    }
    throw { userMessage: `Z.AI: ${msg}`, code: "ZAI_API_ERROR" };
  }
  const message = payload?.choices?.[0]?.message;
  const text = typeof message?.content === "string" ? message.content : (message?.reasoning_content ?? "");
  const answer = extractJsonFromText(text);
  if (!answer) throw { userMessage: "Z.AI вернул некорректный JSON", code: "ZAI_INVALID_JSON" };
  return { answer, provider: "Z.AI", model };
}

/** Groq — текстовый режим (страница передана нами). */
async function callGroq(apiKey: string, pageText: string, today: string) {
  const model = Deno.env.get("GROQ_MODEL") || GROQ_DEFAULT_MODEL;
  const res = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: buildTextPrompt(pageText, today) }],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = payload?.error?.message || `Groq HTTP ${res.status}`;
    if (res.status === 429 || res.status === 503) {
      throw { userMessage: "Groq сейчас перегружен или превышен лимит запросов. Подождите минуту.", code: "GROQ_OVERLOADED" };
    }
    throw { userMessage: `Groq: ${msg}`, code: "GROQ_API_ERROR" };
  }
  const message = payload?.choices?.[0]?.message;
  const text = typeof message?.content === "string" ? message.content : (message?.reasoning ?? "");
  const answer = extractJsonFromText(text);
  if (!answer) throw { userMessage: "Groq вернул некорректный JSON", code: "GROQ_INVALID_JSON" };
  return { answer, provider: "Groq", model };
}

/** Gemini — использует собственный url_context, страницу сам не получает от нас. */
async function callGemini(apiKey: string, today: string) {
  const model = Deno.env.get("GEMINI_VTB_MODEL") ?? GEMINI_DEFAULT_MODEL;
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

  const prompt = `Ты извлекаешь банковский курс из официальной страницы ВТБ.
Сегодня: ${today}.

Источник данных — ТОЛЬКО официальная публичная страница ВТБ:
${VTB_URL}

Открой её через URL Context и найди АКТУАЛЬНЫЙ курс CNY/RUB.
Для калькулятора автомобиля клиент ПОКУПАЕТ юани за рубли, поэтому нужен именно курс ПРОДАЖИ CNY банком ВТБ.

Правила:
1. Не придумывай курс.
2. Не используй курс ЦБ РФ как замену курсу ВТБ.
3. Если на странице есть покупка и продажа — выбери ПРОДАЖУ.
4. Если курс указан за 10 или 100 CNY, пересчитай в рубли за 1 CNY.
5. Если на странице нет подтверждаемого актуального курса ВТБ — верни rate=null.
6. Не используй другие сайты и не используй Google Search grounding.
7. Ответь СТРОГО одним JSON-объектом, без markdown, без пояснений:
{
  "rate": число или null,
  "direction": "sell" | "buy" | "mid" | null,
  "date": "YYYY-MM-DD" | null,
  "confidence": число от 0 до 1,
  "source_note": "краткое описание того, где найден курс"
}`;

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ url_context: {} }],
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = payload?.error?.message || `Gemini HTTP ${res.status}`;
    if (res.status === 429 || res.status === 503) {
      throw { userMessage: "Gemini (бесплатный тариф) сейчас перегружен или превышен лимит запросов. Подождите минуту.", code: "GEMINI_OVERLOADED" };
    }
    throw { userMessage: `Gemini: ${msg}`, code: "GEMINI_API_ERROR" };
  }
  const parts = payload?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("\n").trim() : "";
  const answer = extractJsonFromText(text);
  if (!answer) throw { userMessage: "Gemini вернул некорректный JSON", code: "GEMINI_INVALID_JSON" };
  return { answer, provider: "Gemini", model };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Требуется авторизация" }, 401);

    const sb = supabaseAdmin();

    // Кэш — не дёргаем провайдера чаще раза в 10 минут.
    const cacheSince = new Date(Date.now() - CACHE_MINUTES * 60_000).toISOString();
    const { data: cached } = await sb
      .from("exchange_rates")
      .select("rate, fetched_at")
      .eq("currency", "CNY")
      .eq("source", "VTB")
      .gte("fetched_at", cacheSince)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      return jsonResponse({
        rate: String(cached.rate),
        source: "VTB",
        fetched_at: cached.fetched_at,
        note: "Курс ВТБ (кэш, обновляется не чаще раза в 10 минут)",
        source_url: VTB_URL,
        cache: true,
      });
    }

    if (await isRateLimited(user.id, "get-vtb-cny-rate", RATE_LIMIT, RATE_LIMIT_WINDOW_MIN)) {
      return jsonResponse({ error: "Слишком много запросов курса ВТБ. Попробуйте через несколько минут." }, 429);
    }

    const zaiKey = Deno.env.get("ZAI_API_KEY");
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!zaiKey && !groqKey && !geminiKey) {
      return jsonResponse({
        error: "Не настроен ни один из ключей (ZAI_API_KEY / GROQ_API_KEY / GEMINI_API_KEY) в Supabase Secrets",
        code: "NO_PROVIDER_CONFIGURED",
      }, 503);
    }

    const today = new Date().toISOString().slice(0, 10);

    let result: { answer: RateAnswer; provider: string; model: string };
    try {
      if (zaiKey) {
        result = await callZai(zaiKey, await fetchVtbPageText(), today);
      } else if (groqKey) {
        result = await callGroq(groqKey, await fetchVtbPageText(), today);
      } else {
        result = await callGemini(geminiKey!, today);
      }
    } catch (e: any) {
      console.error("get-vtb-cny-rate provider error", e);
      return jsonResponse({
        error: e?.userMessage ?? "Не удалось получить курс ВТБ",
        code: e?.code ?? "PROVIDER_ERROR",
      }, 502);
    }

    const { answer, provider, model } = result;
    const rate = Number(answer.rate);
    if (answer.rate == null || !Number.isFinite(rate) || rate <= 0) {
      return jsonResponse({
        error: "На официальной странице ВТБ не найден подтверждаемый курс продажи CNY. Введите курс вручную или повторите попытку позже.",
        code: "VTB_RATE_NOT_FOUND",
        note: answer.source_note,
        source_url: VTB_URL,
        provider,
        model,
      }, 502);
    }

    // Проверка по курсу ЦБ РФ — страховка от галлюцинации/масштабирования (10/100 юаней вместо 1).
    const cbr = await fetchCbrCny();
    if (cbr && Math.abs(rate - cbr) / cbr > 0.15) {
      return jsonResponse({
        error: `Найденный курс ${rate} ₽ отклоняется от курса ЦБ РФ (${cbr} ₽) более чем на 15% — значение отклонено.`,
        code: "VTB_RATE_VALIDATION_FAILED",
        found_rate: rate,
        cbr_rate: cbr,
        note: answer.source_note,
        source_url: VTB_URL,
        provider,
      }, 502);
    }

    const fetched_at = new Date().toISOString();
    await sb.from("exchange_rates").insert({ currency: "CNY", rate, source: "VTB", fetched_at, is_manual: false });

    return jsonResponse({
      rate: String(rate),
      source: "VTB",
      fetched_at,
      note: `ВТБ → ${provider} (${answer.direction ?? "unknown"}, уверенность ${(Math.max(0, Math.min(1, Number(answer.confidence) || 0)) * 100).toFixed(0)}%): ${answer.source_note}`,
      source_url: VTB_URL,
      cbr_rate: cbr,
      provider,
      model,
      cache: false,
    });
  } catch (e) {
    return jsonResponse({
      error: "Не удалось получить курс ВТБ. Введите курс вручную или повторите попытку.",
      code: "VTB_UNEXPECTED_ERROR",
      detail: String(e),
      source_url: VTB_URL,
    }, 500);
  }
});
