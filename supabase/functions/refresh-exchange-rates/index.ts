// Edge Function: refresh-exchange-rates
// Обновляет оба курса (ВТБ CNY + ЦБ EUR), вызывая соответствующие функции.
// Подходит для cron: supabase functions schedule (см. config.toml).
//
//   supabase functions deploy refresh-exchange-rates

import { corsHeaders, jsonResponse, supabaseAdmin } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Только для cron/админ-вызова — требуем service role key напрямую, иначе это была бы
  // публичная дверь в платные AI-функции (get-vtb-cny-rate) в обход rate-limit по пользователю.
  const callerToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!callerToken || callerToken !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return jsonResponse({ error: "Forbidden: только для внутреннего cron-вызова" }, 403);
  }

  const base = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const results: Record<string, unknown> = {};

  // get-vtb-cny-rate и get-cbr-eur-rate требуют авторизации (обычно — сессия пользователя,
  // чтобы применялся rate-limit); для cron-вызова используем service role key, который
  // requireUser() распознает отдельно и не подвергает лимиту.
  for (const fn of ["get-vtb-cny-rate", "get-cbr-eur-rate"]) {
    try {
      const res = await fetch(`${base}/functions/v1/${fn}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
        body: "{}",
      });
      results[fn] = await res.json();
    } catch (e) {
      results[fn] = { error: String(e) };
    }
  }

  const sb = supabaseAdmin();
  const { data } = await sb.from("exchange_rates").select("currency, rate, source, fetched_at").order("fetched_at", { ascending: false }).limit(2);
  return jsonResponse({ refreshed: results, latest: data });
});
