// Supabase Edge Function: get-vtb-cny-rate
// Получает курс продажи CNY напрямую с backend без AI.
// Источник по умолчанию — официальная страница ВТБ.
// При наличии официального JSON endpoint его можно указать через VTB_RATES_API_URL.

import { corsHeaders, jsonResponse, supabaseAdmin, requireUser } from "../_shared/http.ts";

const CACHE_MINUTES = 10;
const STALE_CACHE_MINUTES = 24 * 60;
const VTB_URL = "https://www.vtb.ru/personal/platezhi-i-perevody/obmen-valjuty/yuan/";
const VTB_RATES_API_URL = Deno.env.get("VTB_RATES_API_URL") ?? "";

const numberFrom = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const match = normalized.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
};

const normalizeRate = (value: unknown, nominal: unknown = 1): number | null => {
  const rate = numberFrom(value);
  const unit = numberFrom(nominal) ?? 1;
  if (!rate || !unit || rate <= 0 || unit <= 0) return null;
  const result = rate / unit;
  // Защита от ошибочного значения за 10/100 CNY и от HTML-сбоев.
  return result >= 1 && result <= 100 ? Number(result.toFixed(6)) : null;
};

const pickJsonSellRate = (payload: any): number | null => {
  if (!payload || typeof payload !== "object") return null;
  const objects = [payload, payload.data, payload.result, payload.rates, payload.data?.rates, payload.result?.rates].filter(Boolean);
  const keys = ["sell", "selling", "sale", "ask", "sellRate", "sellingRate", "saleRate", "rateSell", "courseSell"];
  for (const obj of objects) {
    if (typeof obj !== "object") continue;
    for (const key of keys) {
      const rate = normalizeRate(obj[key], obj.nominal ?? obj.unit ?? obj.amount);
      if (rate) return rate;
    }
    // Some feeds use an array of quote rows.
    if (Array.isArray(obj)) {
      for (const row of obj) {
        const rate = pickJsonSellRate(row);
        if (rate) return rate;
      }
    }
  }
  return null;
};

const htmlToText = (html: string): string => html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&amp;/gi, "&")
  .replace(/\s+/g, " ")
  .trim();

const parseSellRateFromHtml = (html: string): number | null => {
  const text = htmlToText(html);
  // На странице ВТБ курс обычно представлен строками «Покупка ... Продажа ...».
  // Берём число рядом именно с «Продажа», а не с «Покупка».
  const saleWords = /(курс\s+)?(?:продаж[аи]|продать|selling|sell|ask)/gi;
  const candidates: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = saleWords.exec(text))) {
    const window = text.slice(match.index, match.index + 220);
    const numbers = window.match(/\b\d{1,3}(?:[\s.,]\d{1,6})?\b/g) ?? [];
    for (const raw of numbers) {
      const rate = normalizeRate(raw);
      if (rate) candidates.push(rate);
    }
  }
  // JSON/HTML attributes могут содержать явные названия полей.
  const explicit = html.match(/(?:sell|selling|sale|ask|курс продажи)["'=:>\s]+([0-9]{1,3}(?:[.,][0-9]{1,6})?)/i);
  const explicitRate = explicit ? normalizeRate(explicit[1]) : null;
  if (explicitRate) return explicitRate;
  return candidates[0] ?? null;
};

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 12_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchVtbSellRate(): Promise<{ rate: number; source_url: string; transport: string }> {
  const url = VTB_RATES_API_URL || VTB_URL;
  const res = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json, text/html;q=0.9, */*;q=0.8",
      "User-Agent": "AutoChinaCalculator/1.0 (+backend rate cache)",
    },
  });
  if (!res.ok) throw new Error(`ВТБ вернул HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  let rate: number | null = null;
  if (contentType.includes("json") || raw.trim().startsWith("{") || raw.trim().startsWith("[")) {
    try { rate = pickJsonSellRate(JSON.parse(raw)); } catch { /* попробуем HTML-парсер ниже */ }
  }
  if (!rate) rate = parseSellRateFromHtml(raw);
  if (!rate) {
    throw new Error("На ответе ВТБ не найден курс продажи CNY; страница могла загрузить котировки только в браузере");
  }
  return { rate, source_url: url, transport: contentType.includes("json") ? "VTB_JSON" : "VTB_HTML" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Требуется авторизация", code: "AUTH_REQUIRED" }, 401);

    const sb = supabaseAdmin();
    const freshSince = new Date(Date.now() - CACHE_MINUTES * 60_000).toISOString();
    const staleSince = new Date(Date.now() - STALE_CACHE_MINUTES * 60_000).toISOString();
    const { data: cached } = await sb
      .from("exchange_rates")
      .select("rate, fetched_at")
      .eq("currency", "CNY")
      .eq("source", "VTB")
      .gte("fetched_at", freshSince)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      return jsonResponse({
        rate: String(cached.rate), source: "VTB", fetched_at: cached.fetched_at,
        note: "Курс ВТБ из backend-кэша; обновление не чаще 10 минут",
        source_url: VTB_URL, cache: true, transport: "SUPABASE_CACHE",
      });
    }

    let fetched: { rate: number; source_url: string; transport: string };
    try {
      fetched = await fetchVtbSellRate();
    } catch (error) {
      const { data: stale } = await sb
        .from("exchange_rates")
        .select("rate, fetched_at")
        .eq("currency", "CNY")
        .eq("source", "VTB")
        .gte("fetched_at", staleSince)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (stale) {
        return jsonResponse({
          rate: String(stale.rate), source: "VTB", fetched_at: stale.fetched_at,
          note: `ВТБ временно недоступен; использован сохранённый курс от ${stale.fetched_at}`,
          source_url: VTB_URL, cache: true, stale: true,
          code: "VTB_STALE_CACHE", detail: String(error),
        });
      }
      return jsonResponse({
        error: `Не удалось получить курс ВТБ напрямую: ${String(error)}`,
        code: "VTB_DIRECT_FETCH_FAILED", source_url: VTB_URL,
      }, 502);
    }

    const fetched_at = new Date().toISOString();
    const { error: insertError } = await sb.from("exchange_rates").insert({
      currency: "CNY", rate: fetched.rate, source: "VTB", fetched_at, is_manual: false,
    });
    if (insertError) console.error("exchange_rates insert failed", insertError);

    return jsonResponse({
      rate: String(fetched.rate), source: "VTB", fetched_at,
      note: "Курс продажи CNY получен напрямую с официального источника ВТБ",
      source_url: fetched.source_url, cache: false, transport: fetched.transport,
    });
  } catch (error) {
    console.error("get-vtb-cny-rate error", error);
    return jsonResponse({
      error: "Не удалось получить курс ВТБ. Введите курс вручную или повторите попытку.",
      code: "VTB_UNEXPECTED_ERROR", detail: String(error), source_url: VTB_URL,
    }, 500);
  }
});
