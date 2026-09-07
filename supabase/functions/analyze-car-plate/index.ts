// Supabase Edge Function: analyze-car-plate
// Gemini Vision is called ONLY from the backend. The Gemini API key must be
// stored in Supabase Secrets as GEMINI_API_KEY.
//
// Required secrets:
//   GEMINI_API_KEY=...
// Optional:
//   GEMINI_MODEL=gemini-3.8-flash
//
// Deploy:
//   supabase functions deploy analyze-car-plate --project-ref <PROJECT_REF>

import { corsHeaders, jsonResponse, readJson, requireUser, isRateLimited } from "../_shared/http.ts";

const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MIN = 10;
const DEFAULT_MODEL = "gemini-3.8-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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

const responseSchema = {
  type: "object",
  properties: {
    brand: { type: "string" },
    model: { type: "string" },
    modification: { type: "string" },
    vin: { type: "string" },
    production_year: { type: ["integer", "null"] },
    engine_volume_cc: { type: ["integer", "null"] },
    power_hp: { type: ["integer", "null"] },
    power_kw: { type: ["integer", "null"] },
    fuel_type: { type: "string" },
    engine_type: { type: "string", enum: ["petrol", "diesel", "hybrid", "phev", "electric"] },
    transmission: { type: "string" },
    drive_type: { type: "string", enum: ["fwd", "rwd", "awd"] },
    confidence: {
      type: "object",
      properties: {
        brand: { type: "number", minimum: 0, maximum: 1 },
        model: { type: "number", minimum: 0, maximum: 1 },
        production_year: { type: "number", minimum: 0, maximum: 1 },
        engine_volume_cc: { type: "number", minimum: 0, maximum: 1 },
        power_hp: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["brand", "model", "production_year", "engine_volume_cc", "power_hp"],
    },
  },
  required: [
    "brand", "model", "modification", "vin", "production_year", "engine_volume_cc",
    "power_hp", "power_kw", "fuel_type", "engine_type", "transmission", "drive_type", "confidence",
  ],
};

function parseDataUrl(image: string): { mimeType: string; data: string } {
  const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) throw new Error("Некорректный формат изображения. Ожидается data:image/...;base64,...");
  const mimeType = match[1].toLowerCase();
  const data = match[2];
  if (!mimeType.startsWith("image/")) throw new Error("Поддерживаются только изображения");
  if (!data) throw new Error("Пустое изображение");
  // Gemini inline image input has a request-size limit. The frontend already
  // compresses images to 1280px, but keep a backend guard as well.
  if (data.length > 18_000_000) throw new Error("Изображение слишком большое после сжатия");
  return { mimeType, data };
}

function extractText(payload: any): string {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeModelOutput(value: any): OcrResponse {
  const empty = (v: any) => (typeof v === "string" ? v : "");
  const numOrNull = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const confidence = value?.confidence ?? {};
  const clamp = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  };
  const engineType = ["petrol", "diesel", "hybrid", "phev", "electric"].includes(value?.engine_type)
    ? value.engine_type
    : "petrol";
  const driveType = ["fwd", "rwd", "awd"].includes(value?.drive_type) ? value.drive_type : "awd";

  return {
    brand: empty(value?.brand),
    model: empty(value?.model),
    modification: empty(value?.modification),
    vin: empty(value?.vin).toUpperCase().slice(0, 17),
    production_year: numOrNull(value?.production_year),
    engine_volume_cc: numOrNull(value?.engine_volume_cc),
    power_hp: numOrNull(value?.power_hp),
    power_kw: numOrNull(value?.power_kw),
    fuel_type: empty(value?.fuel_type),
    engine_type: engineType,
    transmission: empty(value?.transmission),
    drive_type: driveType,
    confidence: {
      brand: clamp(confidence.brand),
      model: clamp(confidence.model),
      production_year: clamp(confidence.production_year),
      engine_volume_cc: clamp(confidence.engine_volume_cc),
      power_hp: clamp(confidence.power_hp),
    },
  };
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

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return jsonResponse({
        error: "GEMINI_API_KEY не настроен в Supabase Secrets",
        code: "GEMINI_API_KEY_MISSING",
      }, 503);
    }

    const model = Deno.env.get("GEMINI_MODEL") || DEFAULT_MODEL;
    const { mimeType, data } = parseDataUrl(image);

    const prompt = `Ты — экспертная система распознавания автомобильных заводских шильдиков и VIN-табличек.
Проанализируй ИЗОБРАЖЕНИЕ, а не угадывай автомобиль по типичным значениям.

Извлеки только то, что действительно видно или однозначно следует из шильдика.
Особенно внимательно прочитай китайские и латинские символы.

Правила:
- Не придумывай VIN, год, объем, мощность или модель.
- Если значение не видно или не удается надежно определить — верни null для числового поля или пустую строку для текстового.
- VIN возвращай без пробелов, максимум 17 символов.
- Для мощности в kW и hp используй значение, явно указанное на табличке; если указана только одна единица, вторую можно вычислить.
- engine_type: petrol, diesel, hybrid, phev или electric.
- drive_type: fwd, rwd или awd. Если привод не указан, выбери awd только если это однозначно следует из таблички; иначе используй fwd как технический placeholder и confidence 0.
- confidence — твоя уверенность именно в распознавании каждого ключевого поля, от 0 до 1.

Верни строго JSON по заданной схеме.`;

    const response = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { inline_data: { mime_type: mimeType, data } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const providerMessage = payload?.error?.message || `Gemini HTTP ${response.status}`;
      console.error("Gemini API error", { status: response.status, model, message: providerMessage });
      return jsonResponse({
        error: `Gemini: ${providerMessage}`,
        code: "GEMINI_API_ERROR",
        model,
      }, 502);
    }

    const text = extractText(payload);
    if (!text) {
      console.error("Gemini returned no text", JSON.stringify(payload).slice(0, 4000));
      return jsonResponse({ error: "Gemini не вернул результат распознавания", code: "GEMINI_EMPTY_RESPONSE", model }, 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("Gemini returned invalid JSON", text.slice(0, 4000));
      return jsonResponse({ error: "Gemini вернул некорректный JSON", code: "GEMINI_INVALID_JSON", model }, 502);
    }

    return jsonResponse({ ...normalizeModelOutput(parsed), provider: "Gemini", model });
  } catch (e) {
    console.error("analyze-car-plate error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Не удалось распознать данные", code: "OCR_INTERNAL_ERROR" }, 500);
  }
});
