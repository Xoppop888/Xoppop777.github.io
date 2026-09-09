// Общие утилиты Edge Functions: CORS, JSON-ответы, сервисный клиент Supabase.
// SERVICE_ROLE key хранится только в секретах Supabase — никогда в frontend.

import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export const readJson = async (req: Request) => {
  try {
    return await req.json();
  } catch {
    return {};
  }
};

export const supabaseAdmin = () =>
  createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });

/**
 * Проверяет Authorization: Bearer <access_token> запроса и возвращает id пользователя.
 * Anon key НЕ проходит эту проверку (у него нет "sub") — то есть требует реального логина.
 * Используется в функциях, которые дергают платный Gemini (get-vtb-cny-rate, analyze-car-plate),
 * чтобы анонимный трафик не мог жечь бюджет GEMINI_API_KEY.
 */
export const requireUser = async (req: Request): Promise<{ id: string } | null> => {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  // сервисный вызов (например, cron-функция refresh-exchange-rates) — тоже допустимый вызывающий
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return { id: "service" };
  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
};

/**
 * Простой rate-limit по пользователю и эндпоинту через таблицу api_rate_limits.
 * Возвращает true, если лимит превышен (запрос нужно отклонить с 429).
 */
export const isRateLimited = async (
  userId: string,
  endpoint: string,
  limit: number,
  windowMinutes: number
): Promise<boolean> => {
  const sb = supabaseAdmin();
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { count } = await sb
    .from("api_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .gte("created_at", since);
  if ((count ?? 0) >= limit) return true;
  await sb.from("api_rate_limits").insert({ user_id: userId, endpoint });
  return false;
};
