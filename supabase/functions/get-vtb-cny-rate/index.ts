// Edge Function: get-vtb-cny-rate
//
// FREE Gemini-compatible VTB rate flow:
// 1) Gemini URL Context retrieves the official public VTB CNY page.
// 2) Gemini reads that page and extracts the current CNY/RUB SELL rate.
//
// This deliberately does NOT use Google Search grounding. URL Context is free on
// the Gemini API Free Tier and can retrieve a URL supplied explicitly by us.
// Gemini itself remains the only AI provider.
//
// Secrets (Supabase only):
//   GEMINI_API_KEY=...
//   GEMINI_VTB_MODEL=gemini-3.7-flash (optional)
//
// Deploy:
//   supabase functions deploy get-vtb-cny-rate

import { corsHeaders, jsonResponse, supabaseAdmin, requireUser, isRateLimited } from "../_shared/http.ts";

const CACHE_MINUTES = 10;
const RATE_LIMIT = 3;
const RATE_LIMIT_WINDOW_MIN = 10;
const VTB_URL = "https://www.vtb.ru/personal/platezhi-i-perevody/obmen-valjuty/yuan/";

interface GeminiRateAnswer {
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

const extractText = (response: any): string => {
  return (response?.candidates?.[0]?.content?.parts ?? [])
    .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
    .join("\n")
    .trim();
};

const extractJson = (text: string): GeminiRateAnswer | null => {
  try {
    return JSON.parse(text) as GeminiRateAnswer;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as GeminiRateAnswer;
    } catch {
      return null;
    }
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Требуется авторизация" }, 401);

    const sb = supabaseAdmin();

    // Cache — do not call VTB/Gemini more often than every 10 minutes.
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
        note: "Курс ВТБ (кэш; бесплатный Gemini-парсер обновляется не чаще 1 раза в 10 минут)",
        source_url: VTB_URL,
        gemini_used: false,
        cache: true,
      });
    }

    if (await isRateLimited(user.id, "get-vtb-cny-rate", RATE_LIMIT, RATE_LIMIT_WINDOW_MIN)) {
      return jsonResponse({ error: "Слишком много запросов курса ВТБ. Попробуйте через несколько минут." }, 429);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "GEMINI_API_KEY не настроен. Настройте Gemini в Supabase Secrets." }, 503);
    }

    // Gemini URL Context directly retrieves the official VTB page.
    // URL Context is free on the Gemini API Free Tier and does not require
    // Google Search grounding. It is a better fit than scraping the VTB HTML
    // ourselves because the visible rate can be loaded dynamically.

    const model = Deno.env.get("GEMINI_VTB_MODEL") ?? "gemini-3.7-flash";
    const today = new Date().toISOString().slice(0, 10);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const prompt = `Ты извлекаешь банковский курс из официальной страницы ВТБ.
Сегодня: ${today}.

Источник данных — ТОЛЬКО официальная публичная страница ВТБ:
${VTB_URL}

Ниже приведено содержимое страницы ВТБ. Твоя задача — найти АКТУАЛЬНЫЙ курс CNY/RUB.
Для калькулятора автомобиля клиент ПОКУПАЕТ юани за рубли, поэтому нужен именно курс ПРОДАЖИ CNY банком ВТБ.

Правила:
1. Не придумывай курс.
2. Не используй курс ЦБ РФ как замену курсу ВТБ.
3. Если на странице есть покупка и продажа — выбери ПРОДАЖУ.
4. Если курс указан за 10 или 100 CNY, пересчитай в рубли за 1 CNY.
5. Если на переданных данных нет подтверждаемого актуального курса ВТБ — верни rate=null.
6. Не используй внешние сайты и не выполняй поиск: анализируй только переданные данные страницы ВТБ.
7. Верни только JSON.

Формат:
{
  "rate": число или null,
  "direction": "sell" | "buy" | "mid" | null,
  "date": "YYYY-MM-DD" | null,
  "confidence": число от 0 до 1,
  "source_note": "краткое описание того, где найден курс"
}

Официальная страница ВТБ, которую Gemini должен открыть через URL Context:
${VTB_URL}

Не используй другие сайты и не используй Google Search grounding.
Ответь СТРОГО одним JSON-объектом в указанном формате, без markdown-разметки, без \`\`\`json, без пояснений до или после.`;

    const ai = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ url_context: {} }],
        // ВАЖНО: responseSchema/responseMimeType намеренно НЕ используются вместе
        // с tools — Gemini не гарантирует соблюдение строгой JSON-схемы, когда
        // задействован инструмент (url_context/google_search), и часть запросов
        // может тихо возвращать пустой/некорректный ответ. Просим JSON текстом
        // в промпте и разбираем его ниже через extractJson() с regex-фолбэком.
      }),
    });

    const raw = await ai.text();
    if (!ai.ok) {
      return jsonResponse({
        error: "Gemini не смог обработать данные ВТБ.",
        code: "GEMINI_VTB_API_ERROR",
        detail: raw.slice(0, 1500),
        source_url: VTB_URL,
      }, 502);
    }

    let response: any;
    try {
      response = JSON.parse(raw);
    } catch {
      return jsonResponse({ error: "Gemini вернул некорректный ответ.", code: "GEMINI_INVALID_RESPONSE" }, 502);
    }

    const content = extractText(response);
    const answer = extractJson(content);
    if (!answer) {
      return jsonResponse({
        error: "Gemini не вернул структурированный курс ВТБ.",
        code: "GEMINI_INVALID_JSON",
      }, 502);
    }

    const rate = Number(answer.rate);
    if (answer.rate == null || !Number.isFinite(rate) || rate <= 0) {
      return jsonResponse({
        error: "На официальной странице ВТБ не найден подтверждаемый курс продажи CNY. Введите курс вручную или повторите попытку позже.",
        code: "VTB_RATE_NOT_FOUND",
        note: answer.source_note,
        source_url: VTB_URL,
        gemini_model: model,
        gemini_used: true,
      }, 502);
    }

    // Sanity check against CBR only as a guard against 10/100-CNY scaling or hallucination.
    const cbr = await fetchCbrCny();
    if (cbr && Math.abs(rate - cbr) / cbr > 0.15) {
      return jsonResponse({
        error: `Найденный курс ${rate} ₽ отклоняется от курса ЦБ РФ (${cbr} ₽) более чем на 15% — значение отклонено.`,
        code: "VTB_RATE_VALIDATION_FAILED",
        gemini_rate: rate,
        cbr_rate: cbr,
        note: answer.source_note,
        source_url: VTB_URL,
      }, 502);
    }

    const fetched_at = new Date().toISOString();
    await sb.from("exchange_rates").insert({
      currency: "CNY",
      rate,
      source: "VTB",
      fetched_at,
      is_manual: false,
    });

    return jsonResponse({
      rate: String(rate),
      source: "VTB",
      fetched_at,
      note: `ВТБ → Gemini (${answer.direction ?? "unknown"}, уверенность ${(Math.max(0, Math.min(1, Number(answer.confidence) || 0)) * 100).toFixed(0)}%): ${answer.source_note}`,
      source_url: VTB_URL,
      cbr_rate: cbr,
      gemini_model: model,
      gemini_used: true,
      cache: false,
      search_grounding: false,
    });
  } catch (e) {
    return jsonResponse({
      error: "Не удалось получить курс ВТБ. Введите курс вручную или повторите попытку.",
      code: "VTB_GEMINI_UNEXPECTED_ERROR",
      detail: String(e),
      source_url: VTB_URL,
    }, 500);
  }
});
