// Edge Function: get-vtb-cny-rate
//
// У банка ВТБ НЕТ публичного API курсов, поэтому курс получает LLM-агент:
//   1) backend скачивает публичные источники (страница котировок ВТБ и др.);
//   2) LLM извлекает актуальный курс CNY/RUB (предпочтительно курс ПРОДАЖИ юаня —
//      по нему клиент покупает валюту для отправки в Китай) и оценивает уверенность;
//   3) backend проверяет адекватность: курс должен попасть в ±15% от официального
//      курса ЦБ РФ (защита от галлюцинаций LLM и устаревших данных);
//   4) курс сохраняется в exchange_rates с источником "VTB" и timestamp.
//
// НИКОГДА не вызывается из браузера напрямую. Секреты — только в Supabase Secrets:
//   supabase secrets set AI_API_KEY=...            # ключ LLM-провайдера
//   supabase secrets set AI_API_URL=...            # (опц.) OpenAI-совместимый endpoint
//   supabase secrets set AI_MODEL=...              # (опц.) модель, по умолчанию gpt-4o-mini
//   supabase secrets set VTB_RATES_URL=...         # (опц.) страница котировок ВТБ
//   supabase functions deploy get-vtb-cny-rate

import { corsHeaders, jsonResponse, supabaseAdmin, requireUser, isRateLimited } from "../_shared/http.ts";

const CACHE_MINUTES = 10; // не дергаем LLM чаще одного раза в 10 минут — отдаем недавний курс из БД
const RATE_LIMIT = 3; // не более 3 запросов
const RATE_LIMIT_WINDOW_MIN = 10; // за 10 минут, на пользователя

const fetchText = async (url: string, maxChars = 8000): Promise<string> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text.slice(0, maxChars);
  } finally {
    clearTimeout(t);
  }
};

/** Официальный курс ЦБ РФ по CNY (тот же источник, что get-cbr-eur-rate) — для валидации ответа LLM */
const fetchCbrCny = async (): Promise<number | null> => {
  try {
    const url = Deno.env.get("CBR_API_URL") ?? "https://www.cbr.ru/scripts/XML_daily.asp";
    const res = await fetch(url, { headers: { Accept: "application/xml, text/xml, */*" } });
    if (!res.ok) return null;
    const xml = await res.text();
    const cnyBlock = xml.match(/<Valute[^>]*>\s*<NumCode>156<\/NumCode>[\s\S]*?<Nominal>(\d+)<\/Nominal>[\s\S]*?<Value>([\d.,]+)<\/Value>/);
    if (!cnyBlock) return null;
    const nominal = parseFloat(cnyBlock[1]);
    const value = parseFloat(cnyBlock[2].replace(",", "."));
    if (!nominal || isNaN(value)) return null;
    return value / nominal;
  } catch {
    return null;
  }
};

interface LlmAnswer {
  rate: number | null;
  direction: "sell" | "buy" | "mid";
  date: string | null;
  confidence: number;
  source_note: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Требуется авторизация" }, 401);

    const sb = supabaseAdmin();

    // ---- 0. Кэш: если курс ВТБ уже запрашивался недавно, не дергаем LLM повторно ----
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
      });
    }

    if (await isRateLimited(user.id, "get-vtb-cny-rate", RATE_LIMIT, RATE_LIMIT_WINDOW_MIN)) {
      return jsonResponse({ error: "Слишком много запросов курса ВТБ. Попробуйте через несколько минут." }, 429);
    }

    const aiKey = Deno.env.get("AI_API_KEY");
    if (!aiKey) {
      return jsonResponse(
        { error: "AI_API_KEY не настроен: LLM-поиск курса ВТБ недоступен. Введите курс вручную в интерфейсе." },
        503
      );
    }

    // ---- 1. Источники ----
    const sources: { url: string; label: string }[] = [
      { url: Deno.env.get("VTB_RATES_URL") ?? "https://www.vtb.ru/personal/kotirovki", label: "Котировки ВТБ" },
    ];
    const extra = Deno.env.get("VTB_RATES_URL_2");
    if (extra) sources.push({ url: extra, label: "Дополнительный источник" });

    const collected: string[] = [];
    for (const s of sources) {
      try {
        const html = await fetchText(s.url);
        // вырезаем скрипты/стили, оставляем видимый текст
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text.length > 200) collected.push(`=== ${s.label} (${s.url}) ===\n${text}`);
      } catch {
        /* источник недоступен — пробуем следующий */
      }
    }

    const cbr = await fetchCbrCny();
    if (collected.length === 0) {
      return jsonResponse(
        { error: "Не удалось получить актуальный курс ВТБ: источники недоступны. Введите курс вручную или повторите попытку.", cbr_rate: cbr },
        502
      );
    }

    // ---- 2. LLM-извлечение ----
    const aiUrl = Deno.env.get("AI_API_URL") ?? "https://api.openai.com/v1/chat/completions";
    const model = Deno.env.get("AI_MODEL") ?? "gpt-4o-mini";
    const today = new Date().toISOString().slice(0, 10);

    const prompt = `Ты — финансовый агент, ищущий актуальный курс китайского юаня (CNY) к рублю (RUB) банка ВТБ. Сегодня ${today}.
Ниже — содержимое веб-страниц. Найди курс ВТБ по паре CNY/RUB.
Для отправки денег в Китай клиент покупает юани у банка, поэтому приоритет — курс ПРОДАЖИ юаня банком (sell / "продажа"). Если есть только один курс — используй его.
Ответь СТРОГО JSON без пояснений:
{"rate": <число, рубли за 1 юань, или null если курс ВТБ не найден>, "direction": "sell|buy|mid", "date": "YYYY-MM-DD или null", "confidence": <0..1>, "source_note": "<кратко: откуда значение>"}
Если на страницах нет курса именно ВТБ — верни rate: null.`;

    const ai = await fetch(aiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: collected.join("\n\n").slice(0, 24000) },
        ],
      }),
    });
    if (!ai.ok) return jsonResponse({ error: "LLM-провайдер недоступен. Введите курс вручную." }, 502);

    const j = await ai.json();
    const content: string = j?.choices?.[0]?.message?.content ?? "{}";
    let ans: LlmAnswer;
    try {
      ans = JSON.parse(content) as LlmAnswer;
    } catch {
      return jsonResponse({ error: "LLM вернул некорректный ответ. Введите курс вручную." }, 502);
    }

    const rate = Number(ans.rate);
    if (!ans.rate || isNaN(rate) || rate <= 0) {
      return jsonResponse(
        { error: "LLM не нашла актуальный курс ВТБ на странице котировок. Введите курс вручную.", note: ans.source_note },
        502
      );
    }

    // ---- 3. Валидация по ЦБ (±15%) ----
    if (cbr && Math.abs(rate - cbr) / cbr > 0.15) {
      return jsonResponse(
        {
          error: `Найденный курс ${rate} ₽ отклоняется от курса ЦБ РФ (${cbr} ₽) более чем на 15% — значение отклонено. Введите курс вручную.`,
          llm_answer: ans,
          cbr_rate: cbr,
        },
        502
      );
    }

    // ---- 4. Сохранение ----
    const fetched_at = new Date().toISOString();
    await sb.from("exchange_rates").insert({ currency: "CNY", rate, source: "VTB", fetched_at, is_manual: false });

    return jsonResponse({
      rate: String(rate),
      source: "VTB",
      fetched_at,
      note: `AI-поиск: ${ans.source_note} (${ans.direction}, уверенность ${(Number(ans.confidence) * 100).toFixed(0)}%)`,
      cbr_rate: cbr,
    });
  } catch (e) {
    return jsonResponse({ error: "Не удалось получить курс ВТБ. Введите курс вручную или повторите попытку.", detail: String(e) }, 500);
  }
});
