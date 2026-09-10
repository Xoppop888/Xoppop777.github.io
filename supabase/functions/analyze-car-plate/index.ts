// Supabase Edge Function: analyze-car-plate
// Gemini Vision is called ONLY from the backend. The Gemini API key must be
// stored in Supabase Secrets as GEMINI_API_KEY.
//
// Required secrets:
//   GEMINI_API_KEY=...
// Optional:
//   GEMINI_MODEL=gemini-3.7-flash
//
// Deploy:
//   supabase functions deploy analyze-car-plate --project-ref <PROJECT_REF>

import { corsHeaders, jsonResponse, readJson, requireUser, isRateLimited } from "../_shared/http.ts";

const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MIN = 10;
const DEFAULT_MODEL = "gemini-3.7-flash";
// По умолчанию — официальный Gemini API. Если у Gemini закончилась квота/лимиты
// или карта не проходит для прямого биллинга Google, можно направить запросы
// через совместимый прокси (например, qcode.cc, путь /gemini повторяет
// нативный протокол Google 1:1) — просто задайте:
//   supabase secrets set GEMINI_API_BASE_URL=https://api.qcode.cc/gemini/v1beta/models
// Код и авторизация (x-goog-api-key) не меняются.
const GEMINI_API_BASE = Deno.env.get("GEMINI_API_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta/models";

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

// Не отправляется в Gemini API (responseSchema несовместим с tools/google_search) —
// оставлено как документация ожидаемой формы ответа для normalizeModelOutput().
const responseSchema = {
  type: "object",
  properties: {
    brand: { type: "string" },
    model: { type: "string" },
    modification: { type: "string" },
    vin: { type: "string" },
    production_year: { type: "integer", nullable: true },
    engine_volume_cc: { type: "integer", nullable: true },
    power_hp: { type: "integer", nullable: true },
    power_kw: { type: "integer", nullable: true },
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
        engine_type: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["brand", "model", "production_year", "engine_volume_cc", "power_hp", "engine_type"],
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
  // Подстраховка помимо промпта: если модель "распозналась" как имя ИИ-системы —
  // это стопроцентная галлюцинация, а не марка автомобиля.
  const AI_NAME_PATTERN = /gemini|gpt-?\d|chatgpt|claude|llama|qwen|deepseek|mistral|copilot/i;
  const carModel = (v: any) => {
    const s = empty(v).trim();
    return AI_NAME_PATTERN.test(s) ? "" : s;
  };
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
    model: carModel(value?.model),
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
      engine_type: clamp(confidence.engine_type),
    },
  };
}

function extractJsonFromText(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Free-tier Gemini регулярно отвечает 429 (rate limit) или 503 (модель
 * перегружена) — это временные сбои на стороне Google, не ошибка запроса.
 * Повторяем 1-2 раза с небольшой паузой перед тем, как сдаться.
 */
async function fetchGeminiWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status !== 503) return res;
    last = res;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return last!;
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
- Марку и модель возвращай на английском/латиницей (например "Zeekr", "Geely", "Toyota"), даже если на шильдике они написаны иероглифами — переведи или транслитерируй по общепринятому написанию бренда.
- Поле "model" — это МАРКЕТИНГОВОЕ название модели автомобиля (например "Camry", "Zeekr 001", "RAV4"), а НЕ технический код кузова/двигателя/платформы и НЕ название какой-либо AI-системы или языковой модели. Категорически не подставляй ничего похожего на "gemini", "gpt", версию модели ИИ или другой технический код вместо названия автомобиля.
- Если потребительское название модели явно не написано на шильдике (частая ситуация для китайских табличек — там часто только внутризаводской индекс кузова вида "整车型号", код двигателя и VIN) — используй инструмент поиска (google_search), чтобы определить настоящую модель по VIN (первые символы — WMI+VDS), по коду кузова/платформы или по производителю (например "浙江吉利汽车有限公司" = Zhejiang Geely Automobile — модели могут продаваться под брендом Geely или Zeekr). Ищи по VIN, по коду типа "整车型号"/"WR6511..." вместе с названием завода-изготовителя.
- Если после попытки поиска модель всё равно определить не удалось однозначно — верни пустую строку "", не гадай и не оставляй технический код вместо названия.
- Если значение не видно или не удается надежно определить — верни null для числового поля или пустую строку для текстового.
- VIN возвращай без пробелов, максимум 17 символов.
- Для мощности в kW и hp используй значение, явно указанное на табличке; если указана только одна единица, вторую можно вычислить. Для гибридов/электромобилей с раздельно указанной мощностью ДВС и электромотора(ов) — используй суммарную (системную) мощность автомобиля, если она указана отдельно, иначе используй мощность двигателя внутреннего сгорания (не мощность одного из электромоторов) как основную.
- engine_type — определи МАКСИМАЛЬНО ВНИМАТЕЛЬНО: от этого зависит, по какой формуле считается таможенная пошлина и утильсбор (гибриды/электро считаются иначе, чем обычный ДВС), ошибка здесь стоит реальных денег клиенту. Возможные значения: petrol, diesel, hybrid, phev, electric.
  Ищи на шильдике одновременно ВСЕ из следующих типов полей (китайские таблички почти всегда содержат несколько из них построчно):
  * признаки ДВС: "发动机型号" (модель двигателя), "发动机排量" (рабочий объем, см³), "发动机最大净功率" (макс. мощность двигателя), "燃料种类"/"燃油" (вид топлива).
  * признаки электропривода: "驱动电机型号" (модель тягового электромотора), "驱动电机峰值功率"/"驱动电机额定功率" (мощность электромотора), "动力电池系统额定电压" (напряжение тяговой батареи), "动力电池系统额定容量" (ёмкость батареи, Ah или kWh).
  Правила определения:
  * Только признаки ДВС, батарея НЕ упомянута нигде → "petrol" (или "diesel", если явно указано дизельное топливо).
  * Присутствуют ОДНОВРЕМЕННО и признаки ДВС, и признаки электромотора/батареи на одной табличке → это гибрид или plug-in гибрид, НЕ "electric" и НЕ обычный ДВС. Различай:
    - "插电式混合动力"/"插电混动"/PHEV в названии модели/модификации, или ёмкость батареи заметно больше (~10+ kWh / указано "可充电") → "phev".
    - "油电混合"/"混合动力"/HEV без явного указания plug-in, небольшая батарея → "hybrid".
    - Если явного маркера plug-in/HEV нет, но признаки ДВС и батареи присутствуют одновременно — по умолчанию выбирай "phev" (это чаще встречается на новых китайских премиальных моделях) и снижай confidence.engine_type, а не угадывай молча.
  * Только признаки электромотора/батареи, "发动机" (двигатель внутреннего сгорания) и объем ДВС полностью ОТСУТСТВУЮТ на табличке → "electric".
  * confidence.engine_type — отдельная уверенность именно в типе привода (не путай с confidence по мощности/объему). Если на табличке одновременно есть противоречивые/неполные признаки (например, есть электромотор, но неясно, plug-in это или обычный гибрид) — ставь confidence.engine_type не выше 0.6, даже если ты всё же выбрал конкретное значение, чтобы пользователь обязательно перепроверил вручную.
- drive_type: fwd, rwd или awd. Если привод не указан, выбери awd только если это однозначно следует из таблички; иначе используй fwd как технический placeholder и confidence 0.
- confidence — твоя уверенность именно в распознавании каждого ключевого поля, от 0 до 1. Если поле оставлено пустым/null из-за неуверенности — confidence для него должен быть низким (ближе к 0), а не высоким.

Ответь СТРОГО одним JSON-объектом в следующем формате, без markdown-разметки, без \`\`\`json, без пояснений до или после:
{
  "brand": string, "model": string, "modification": string, "vin": string,
  "production_year": number|null, "engine_volume_cc": number|null,
  "power_hp": number|null, "power_kw": number|null,
  "fuel_type": string, "engine_type": string, "transmission": string, "drive_type": string,
  "confidence": { "brand": number, "model": number, "production_year": number, "engine_volume_cc": number, "power_hp": number, "engine_type": number }
}`;

    const response = await fetchGeminiWithRetry(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
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
        tools: [{ google_search: {} }],
        // ВАЖНО: responseSchema/responseMimeType намеренно НЕ используются вместе
        // с tools — Gemini не гарантирует строгий JSON-режим, когда задействован
        // инструмент (google_search), часть запросов может тихо вернуть пустой/
        // некорректный ответ. Просим JSON текстом в промпте и разбираем его ниже
        // через extractJsonFromText() с regex-фолбэком на случай markdown-обёртки.
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const providerMessage = payload?.error?.message || `Gemini HTTP ${response.status}`;
      console.error("Gemini API error", { status: response.status, model, message: providerMessage });
      if (response.status === 429 || response.status === 503) {
        return jsonResponse({
          error: "Gemini (бесплатный тариф) сейчас перегружен или превышен лимит запросов. Подождите минуту и попробуйте ещё раз.",
          code: "GEMINI_OVERLOADED",
          model,
        }, 502);
      }
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

    const parsed = extractJsonFromText(text);
    if (!parsed) {
      console.error("Gemini returned invalid JSON", text.slice(0, 4000));
      return jsonResponse({ error: "Gemini вернул некорректный JSON", code: "GEMINI_INVALID_JSON", model }, 502);
    }

    return jsonResponse({ ...normalizeModelOutput(parsed), provider: "Gemini", model });
  } catch (e) {
    console.error("analyze-car-plate error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Не удалось распознать данные", code: "OCR_INTERNAL_ERROR" }, 500);
  }
});
