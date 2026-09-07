// Edge Function: get-vtb-cny-rate
//
// Gemini + Google Search grounding ищет актуальный курс CNY/RUB банка ВТБ.
// Приоритет: КУРС ПРОДАЖИ юаня банком, т.к. клиент покупает CNY для оплаты автомобиля.
//
// Secrets (только Supabase, НИКОГДА не VITE_*):
//   supabase secrets set GEMINI_API_KEY=...
//   supabase secrets set GEMINI_VTB_MODEL=gemini-3.8-flash   # optional
//   supabase functions deploy get-vtb-cny-rate

import { corsHeaders, jsonResponse, supabaseAdmin, requireUser, isRateLimited } from "../_shared/http.ts";

const CACHE_MINUTES = 10;
const RATE_LIMIT = 3;
const RATE_LIMIT_WINDOW_MIN = 10;

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

    // 0. Cache — Gemini/Search не вызывается чаще раза в 10 минут.
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
        note: "Курс ВТБ (кэш, Gemini + Google Search обновляется не чаще раза в 10 минут)",
      });
    }

    if (await isRateLimited(user.id, "get-vtb-cny-rate", RATE_LIMIT, RATE_LIMIT_WINDOW_MIN)) {
      return jsonResponse({ error: "Слишком много запросов курса ВТБ. Попробуйте через несколько минут." }, 429);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "GEMINI_API_KEY не настроен. Настройте Gemini в Supabase Secrets." }, 503);
    }

    const model = Deno.env.get("GEMINI_VTB_MODEL") ?? "gemini-3.8-flash";
    const today = new Date().toISOString().slice(0, 10);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    // Gemini сам выполняет Google Search и возвращает groundingMetadata.
    // Это принципиально лучше старой схемы, где backend просто скачивал HTML ВТБ,
    // потому что актуальный курс может находиться в динамически загружаемых данных.
    const prompt = `Ты — финансовый агент. Сегодня ${today}.
Найди АКТУАЛЬНЫЙ курс китайского юаня CNY к российскому рублю RUB именно банка ВТБ.

ОБЯЗАТЕЛЬНО используй Google Search и ищи свежие данные в интернете.
Приоритет источника — официальный сайт ВТБ (vtb.ru) и его страницы/котировки.
Не используй курс ЦБ РФ вместо курса ВТБ.

Для расчёта оплаты автомобиля клиент ПОКУПАЕТ юани у банка, поэтому нужен курс ПРОДАЖИ CNY банком ВТБ (sell / "продажа").
Если официальный источник ВТБ показывает несколько значений или разные направления, выбери именно продажу CNY за RUB.
Если на официальном сайте ВТБ курс не удалось подтвердить, ищи свежие страницы/публикации, явно указывающие курс ВТБ, и понизь confidence.
Не выдумывай число. Если актуальный курс ВТБ не найден или источник нельзя подтвердить — rate должен быть null.

Верни ТОЛЬКО JSON:
{
  "rate": число или null,
  "direction": "sell" | "buy" | "mid" | null,
  "date": "YYYY-MM-DD" | null,
  "confidence": число от 0 до 1,
  "source_note": "краткое описание найденного источника"
}

Важно: rate — это РУБЛЕЙ ЗА 1 CNY, а не за 10/100 юаней. Если источник показывает курс за 10 или 100 CNY, пересчитай на 1 CNY.`;

    const ai = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              rate: { type: ["number", "null"] },
              direction: { type: ["string", "null"], enum: ["sell", "buy", "mid", null] },
              date: { type: ["string", "null"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              source_note: { type: "string" },
            },
            required: ["rate", "direction", "date", "confidence", "source_note"],
          },
        },
      }),
    });

    const raw = await ai.text();
    if (!ai.ok) {
      return jsonResponse({
        error: "Gemini не смог выполнить поиск курса ВТБ.",
        code: "GEMINI_VTB_API_ERROR",
        detail: raw.slice(0, 1500),
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
        raw: content.slice(0, 1200),
      }, 502);
    }

    const rate = Number(answer.rate);
    if (answer.rate == null || !Number.isFinite(rate) || rate <= 0) {
      return jsonResponse({
        error: "Gemini не смог подтвердить актуальный курс ВТБ. Введите курс вручную или повторите попытку.",
        code: "VTB_RATE_NOT_FOUND",
        note: answer.source_note,
      }, 502);
    }

    // Защита от ошибок масштаба (10/100 CNY) и галлюцинаций.
    const cbr = await fetchCbrCny();
    if (cbr && Math.abs(rate - cbr) / cbr > 0.15) {
      return jsonResponse({
        error: `Найденный курс ${rate} ₽ отклоняется от курса ЦБ РФ (${cbr} ₽) более чем на 15% — значение отклонено.`,
        code: "VTB_RATE_VALIDATION_FAILED",
        gemini_rate: rate,
        cbr_rate: cbr,
        note: answer.source_note,
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

    const grounding = response?.candidates?.[0]?.groundingMetadata;
    const searchQueries = grounding?.webSearchQueries ?? [];
    const webSources = (grounding?.groundingChunks ?? [])
      .map((chunk: any) => chunk?.web)
      .filter((web: any) => web?.uri)
      .slice(0, 5)
      .map((web: any) => ({ title: web.title ?? "Источник", uri: web.uri }));

    return jsonResponse({
      rate: String(rate),
      source: "VTB",
      fetched_at,
      note: `Gemini + Google Search: ${answer.source_note} (${answer.direction ?? "unknown"}, уверенность ${(Math.max(0, Math.min(1, Number(answer.confidence) || 0)) * 100).toFixed(0)}%)`,
      cbr_rate: cbr,
      gemini_model: model,
      search_queries: searchQueries,
      web_sources: webSources,
    });
  } catch (e) {
    return jsonResponse({
      error: "Не удалось получить курс ВТБ через Gemini. Введите курс вручную или повторите попытку.",
      code: "VTB_GEMINI_UNEXPECTED_ERROR",
      detail: String(e),
    }, 500);
  }
});
