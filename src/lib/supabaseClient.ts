import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env = ((import.meta as unknown as { env?: Record<string, string> }).env) || {};

let client: SupabaseClient | null = null;

/**
 * Единый Supabase-клиент на все приложение.
 * Важно иметь ровно один экземпляр: несколько createClient() на одних и тех же
 * ключах приводят к рассинхронизации auth-сессии между модулями (db.ts мог
 * создавать свой клиент, а providers/* — ходить в Edge Functions без сессии).
 */
export const getSupabaseClient = (): SupabaseClient | null => {
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return null;
  if (!client) client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  return client;
};

/**
 * Заголовки для вызова Supabase Edge Functions.
 * - apikey нужен Supabase API Gateway всегда.
 * - Authorization должен быть валидным JWT: используем access_token текущей
 *   сессии пользователя (чтобы backend мог проверить auth.uid() и применить
 *   rate-limit на пользователя), а если сессии нет — anon key (он тоже валидный
 *   JWT и проходит verify_jwt, но backend в этом случае должен отдельно требовать
 *   авторизованного пользователя там, где это важно, см. get-vtb-cny-rate/analyze-car-plate).
 */
export const getEdgeAuthHeaders = async (): Promise<Record<string, string>> => {
  const anon = env.VITE_SUPABASE_ANON_KEY ?? "";
  const sb = getSupabaseClient();
  let token = anon;
  if (sb) {
    const { data } = await sb.auth.getSession();
    if (data.session?.access_token) token = data.session.access_token;
  }
  return { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${token}` };
};
