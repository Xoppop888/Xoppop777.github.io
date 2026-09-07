// Edge Function: analyze-car-plate
// Принимает изображение шильдика (base64 dataURL или путь в Storage),
// отправляет в AI/OCR-провайдер и возвращает структурированные данные.
// Секретный ключ AI хранится ТОЛЬКО в Supabase Secrets: AI_API_KEY.
//
//   supabase secrets set AI_API_KEY=...
//   supabase functions deploy analyze-car-plate

import { corsHeaders, jsonResponse, readJson, requireUser, isRateLimited } from "../_shared/http.ts";

const RATE_LIMIT = 10; // не более 10 распознаваний
const RATE_LIMIT_WINDOW_MIN = 10; // за 10 минут, на пользователя

interface OcrResponse {
  brand: string;
  model: string;
  modification: string;
  vin: string;
  production_year: number | null;
  engine_volume_cc: number | null;
  power_hp: number | null;
  power_kw: number | null;
  fuel_type: string;
  engine_type: string;
  transmission: string;
  drive_type: string;
  confidence: Record<string, number>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Требуется авторизация" }, 401);
    if (await isRateLimited(user.id, "analyze-car-plate", RATE_LIMIT, RATE_LIMIT_WINDOW_MIN)) {
      return jsonResponse({ error: "Слишком много запросов распознавания. Попробуйте через несколько минут." }, 429);
    }

    const { image } = (await readJson(req)) as { image?: string };
    if (!image) return jsonResponse({ error: "image is required" }, 400);

    const apiKey = Deno.env.get("AI_API_KEY");
    const aiUrl = Deno.env.get("AI_API_URL") ?? "https://api.openai.com/v1/chat/completions";

    if (!apiKey) {
      return jsonResponse({ error: "AI_API_KEY не настроен. Установите секрет: supabase secrets set AI_API_KEY=..." }, 503);
    }

    const prompt = `Ты — система распознавания автомобильных шильдиков (VIN-наклеек).
Извлеки данные строго в JSON без пояснений:
{"brand":"","model":"","modification":"","vin":"","production_year":null,"engine_volume_cc":null,"power_hp":null,"power_kw":null,"fuel_type":"","engine_type":"petrol|diesel|hybrid|phev|electric","transmission":"","drive_type":"fwd|rwd|awd","confidence":{"brand":0,"model":0,"production_year":0,"engine_volume_cc":0,"power_hp":0}}
confidence — число от 0 до 1. Если поле не читается — null и confidence 0.`;

    const ai = await fetch(aiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: Deno.env.get("AI_MODEL") ?? "gpt-4o",
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Распознай шильдик на фото." },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        max_tokens: 700,
        response_format: { type: "json_object" },
      }),
    });
    if (!ai.ok) return jsonResponse({ error: "AI-провайдер недоступен" }, 502);

    const j = await ai.json();
    const content: string = j?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as OcrResponse;
    return jsonResponse(parsed);
  } catch (e) {
    return jsonResponse({ error: "Не удалось распознать данные", detail: String(e) }, 500);
  }
});
