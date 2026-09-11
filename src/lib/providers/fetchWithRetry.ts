/**
 * Retry-обёртка над fetch.
 * Повторяет запрос при 502/503/504 и при сетевых ошибках.
 * Экспоненциальная задержка: 1s, 2s, 4s + случайный jitter.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
): Promise<Response> {
  let lastError: unknown = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      // 5xx — это временный сбой на стороне сервера, повторяем.
      if (res.status !== 502 && res.status !== 503 && res.status !== 504) {
        return res;
      }
      if (i === maxRetries - 1) return res;
    } catch (e) {
      // Сетевая ошибка (offline, DNS, CORS) — тоже повторяем.
      lastError = e;
      if (i === maxRetries - 1) throw e;
    }

    const delay = Math.pow(2, i) * 1000 + Math.random() * 500;
    await new Promise((r) => setTimeout(r, delay));
  }

  throw lastError ?? new Error("fetchWithRetry: exhausted retries");
}