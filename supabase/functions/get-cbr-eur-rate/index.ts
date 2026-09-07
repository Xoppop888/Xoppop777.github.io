// Edge Function: get-cbr-eur-rate
// Официальный курс EUR/RUB Центрального банка РФ (XML-сервис ЦБ).
// Сохраняет курс в exchange_rates. Публичный источник, ключ не требуется.
//
//   supabase functions deploy get-cbr-eur-rate

import { corsHeaders, jsonResponse, supabaseAdmin, requireUser } from "../_shared/http.ts";

const CBR_URL = Deno.env.get("CBR_API_URL") ?? "https://www.cbr.ru/scripts/XML_daily.asp";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Требуется авторизация" }, 401);

    const res = await fetch(CBR_URL, { headers: { Accept: "application/xml, text/xml, */*" } });
    if (!res.ok) return jsonResponse({ error: "ЦБ РФ недоступен" }, 502);

    const xml = await res.text();
    // <Valute ID="R01239"><CharCode>EUR</CharCode><Nominal>1</Nominal><Value>96,5200</Value>...
    const dateMatch = xml.match(/Date="([^"]+)"/);
    const eurBlock = xml.match(/<Valute[^>]*>\s*<NumCode>978<\/NumCode>[\s\S]*?<Value>([\d.,]+)<\/Value>/);
    if (!eurBlock) return jsonResponse({ error: "Курс EUR не найден в ответе ЦБ" }, 502);

    const rate = parseFloat(eurBlock[1].replace(",", "."));
    if (isNaN(rate)) return jsonResponse({ error: "Некорректный курс EUR" }, 502);

    const date = dateMatch ? dateMatch[1].split(".").reverse().join("-") : new Date().toISOString().slice(0, 10);
    const fetched_at = new Date(`${date}T12:00:00Z`).toISOString();

    const sb = supabaseAdmin();
    await sb.from("exchange_rates").insert({ currency: "EUR", rate, source: "CBR", fetched_at, is_manual: false });

    return jsonResponse({ rate: String(rate), source: "CBR", date: fetched_at });
  } catch (e) {
    return jsonResponse({ error: "Не удалось получить курс EUR ЦБ РФ", detail: String(e) }, 500);
  }
});
