// Supabase Edge Function: analyze-car-plate
//
// Провайдер выбирается автоматически по тому, какой ключ настроен (по приоритету):
//   1) ZAI_API_KEY задан → Z.AI (GLM-4.6V-Flash, vision). Модель официально
//      бесплатна (не preview/experimental, а постоянный free-tier продукт),
//      регистрация принимает зарубежные номера телефона на api.z.ai.
//   2) Иначе GROQ_API_KEY → Groq. Внимание: единственная vision-модель Groq
//      на данный момент (qwen/qwen3.6-27b) имеет статус "preview" — лимиты
//      могут быть заметно ниже заявленных для стабильных моделей.
//   3) Иначе GEMINI_API_KEY → Gemini, с поддержкой google_search для
//      доопределения модели по VIN/коду кузова.
//
// Секреты (Supabase Secrets):
//   ZAI_API_KEY=...                   (получить на z.ai, регистрация с любым номером)
//   ZAI_MODEL=glm-4.6v-flash          (опционально)
//   GROQ_API_KEY=gsk_...              (опционально)
//   GROQ_MODEL=qwen/qwen3.6-27b       (опционально)
//   GEMINI_API_KEY=...                (опционально, фолбэк)
//   GEMINI_MODEL=gemini-3.7-flash     (опционально)
//   GEMINI_API_BASE_URL=...           (опционально, напр. qcode.cc)
//
// Deploy:
//   supabase functions deploy analyze-car-plate

import { corsHeaders, jsonResponse, readJson, requireUser, isRateLimited } from "../_shared/http.ts";

const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MIN = 10;

const ZAI_DEFAULT_MODEL = "glm-4.6v-flash";
// По умолчанию — международная площадка. Если регистрировались на китайской
// (open.bigmodel.cn, например с китайским номером телефона) — переключите:
//   supabase secrets set ZAI_API_BASE_URL=https://open.bigmodel.cn/api/paas/v4/chat/completions
const ZAI_API_BASE_URL =
  Deno.env.get("ZAI_API_BASE_URL") || "https://api.z.ai/api/paas/v4/chat/completions";
const GROQ_DEFAULT_MODEL = "qwen/qwen3.6-27b";
const GEMINI_DEFAULT_MODEL = "gemini-3.7-flash";
const GEMINI_API_BASE =
  Deno.env.get("GEMINI_API_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta/models";

const DEPRECATED_GROQ_MODELS = new Set([
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "qwen/qwen3-32b",
]);

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

function parseDataUrl(image: string): { mimeType: string; data: string } {
  const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) throw new Error("Некорректный формат изображения. Ожидается data:image/...;base64,...");
  const mimeType = match[1].toLowerCase();
  const data = match[2];
  if (!mimeType.startsWith("image/")) throw new Error("Поддерживаются только изображения");
  if (!data) throw new Error("Пустое изображение");
  if (data.length > 18_000_000) throw new Error("Изображение слишком большое после сжатия");
  return { mimeType, data };
}

/**
 * Достаём JSON из ответа модели. Модель может вернуть:
 *   - чистый JSON,
 *   - JSON в обёртке ```json ... ```,
 *   - JSON с текстом до/после.
 */
function extractJsonFromText(text: string): unknown | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // убираем markdown-обёртку, если есть
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    try {
      return JSON.parse(cleaned);
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
}

function normalizeModelOutput(value: any): OcrResponse {
  const empty = (v: any) => (typeof v === "string" ? v : "");
  const AI_NAME_PATTERN = /gemini|gpt-?\d|chatgpt|claude|llama|qwen|deepseek|mistral|copilot|groq|glm-?\d|zhipu|z\.ai/i;
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

function buildPrompt(withSearchHint: boolean): string {
  return `Ты — экспертная система распознавания автомобильных заводских шильдиков и VIN-табличек.
Проанализируй ИЗОБРАЖЕНИЕ, а не угадывай автомобиль по типичным значениям.

Извлеки только то, что действительно видно или однозначно следует из шильдика.
Особенно внимательно прочитай китайские и латинские символы.

Правила:
- Не придумывай VIN, год, объем, мощность или модель.
- Марку и модель возвращай на английском/латиницей (например "Zeekr", "Geely", "Toyota"), даже если на шильдике они написаны иероглифами — переведи или транслитерируй по общепринятому написанию бренда.
- Поле "model" — это МАРКЕТИНГОВОЕ название модели автомобиля (например "Camry", "Zeekr 001", "RAV4"), а НЕ технический код кузова/двигателя/платформы и НЕ название какой-либо AI-системы или языковой модели. Категорически не подставляй ничего похожего на "gemini", "gpt", "llama", "groq", версию модели ИИ или другой технический код вместо названия автомобиля.
${withSearchHint ? `- Если потребительское название модели явно не написано на шильдике (частая ситуация для китайских табличек — там часто только внутризаводской индекс кузова вида "整车型号", код двигателя и VIN) — используй инструмент поиска (google_search), чтобы определить настоящую модель по VIN (первые символы — WMI+VDS), по коду кузова/платформы или по производителю. Ищи по VIN, по коду типа "整车型号" вместе с названием завода-изготовителя.\n` : ""}- Если название модели определить не удалось однозначно — верни пустую строку "", не гадай и не оставляй технический код вместо названия.
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
  * confidence.engine_type — отдельная уверенность именно в типе привода (не путай с confidence по мощности/объему). Если на табличке одновременно есть противоречивые/неполные признаки — ставь confidence.engine_type не выше 0.6, даже если ты всё же выбрал конкретное значение, чтобы пользователь обязательно перепроверил вручную.
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
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status !== 503) return res;
    last = res;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return last!;
}

/** Z.AI — GLM-4.6V-Flash, vision. Постоянный бесплатный тариф (не preview). */
async function callZai(apiKey: string, mimeType: string, data: string) {
  const model = Deno.env.get("ZAI_MODEL") || ZAI_DEFAULT_MODEL;
  const prompt = buildPrompt(false); // нет встроенного инструмента поиска

  const res = await fetchWithRetry(ZAI_API_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${data}` } },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 2500,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = payload?.error?.message || `Z.AI HTTP ${res.status}`;
    if (res.status === 429 || res.status === 503) {
      throw {
        userMessage: "Z.AI сейчас перегружен или превышен лимит запросов. Подождите минуту и попробуйте ещё раз.",
        code: "ZAI_OVERLOADED",
        model,
      };
    }
    if (payload?.error?.failed_generation) {
      console.error("Z.AI failed_generation", String(payload.error.failed_generation).slice(0, 2000));
    }
    throw { userMessage: `Z.AI: ${msg}`, code: "ZAI_API_ERROR", model };
  }

  const message = payload?.choices?.[0]?.message;
  const finishReason = payload?.choices?.[0]?.finish_reason;
  let text: string | undefined = typeof message?.content === "string" ? message.content : undefined;
  if ((!text || !text.trim()) && typeof message?.reasoning_content === "string") {
    text = message.reasoning_content;
  }
  if (!text || !text.trim()) {
    console.error("Z.AI empty content", JSON.stringify(payload).slice(0, 2000));
    throw { userMessage: "Z.AI не вернул результат распознавания", code: "ZAI_EMPTY_RESPONSE", model };
  }

  const parsed = extractJsonFromText(text);
  if (!parsed) {
    console.error("Z.AI returned invalid JSON", { finishReason, text: text.slice(0, 4000) });
    const truncatedHint = finishReason === "length" ? " (ответ обрезан лимитом длины)" : "";
    throw { userMessage: `Z.AI вернул некорректный JSON${truncatedHint}`, code: "ZAI_INVALID_JSON", model };
  }
  return { parsed, provider: "Z.AI", model };
}

/** Groq — Qwen 3.6 27B, vision. */
async function callGroq(apiKey: string, mimeType: string, data: string) {
  const model = Deno.env.get("GROQ_MODEL") || GROQ_DEFAULT_MODEL;

  if (DEPRECATED_GROQ_MODELS.has(model)) {
    throw {
      userMessage: `Модель Groq "${model}" удалена из бесплатного тарифа. Обновите секрет GROQ_MODEL на "qwen/qwen3.6-27b".`,
      code: "GROQ_MODEL_DEPRECATED",
      model,
    };
  }

  const prompt = buildPrompt(false);

  const res = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${data}` } },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = payload?.error?.message || `Groq HTTP ${res.status}`;
    if (res.status === 429 || res.status === 503) {
      throw {
        userMessage: "Groq сейчас перегружен или превышен лимит запросов. Подождите минуту и попробуйте ещё раз.",
        code: "GROQ_OVERLOADED",
        model,
      };
    }
    if (res.status === 404 || /does not exist|do not have access/i.test(msg)) {
      throw {
        userMessage: `Groq: модель "${model}" недоступна. Обновите секрет GROQ_MODEL на "qwen/qwen3.6-27b".`,
        code: "GROQ_MODEL_NOT_FOUND",
        model,
      };
    }
    if (payload?.error?.failed_generation) {
      console.error("Groq failed_generation", String(payload.error.failed_generation).slice(0, 2000));
    }
    throw { userMessage: `Groq: ${msg}`, code: "GROQ_API_ERROR", model };
  }

  const message = payload?.choices?.[0]?.message;
  // Reasoning-модели могут положить ответ в reasoning, а content оставить пустым.
  let text: string | undefined = typeof message?.content === "string" ? message.content : undefined;
  if ((!text || !text.trim()) && typeof message?.reasoning === "string") {
    text = message.reasoning;
  }
  if (!text || !text.trim()) {
    console.error("Groq empty content", JSON.stringify(payload).slice(0, 2000));
    throw { userMessage: "Groq не вернул результат распознавания", code: "GROQ_EMPTY_RESPONSE", model };
  }

  const parsed = extractJsonFromText(text);
  if (!parsed) {
    console.error("Groq returned invalid JSON", text.slice(0, 4000));
    throw { userMessage: "Groq вернул некорректный JSON", code: "GROQ_INVALID_JSON", model };
  }
  return { parsed, provider: "Groq", model };
}

/** Gemini — фолбэк с google_search. */
async function callGemini(apiKey: string, mimeType: string, data: string) {
  const model = Deno.env.get("GEMINI_MODEL") || GEMINI_DEFAULT_MODEL;
  const prompt = buildPrompt(true);

  const res = await fetchWithRetry(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inline_data: { mime_type: mimeType, data } }, { text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = payload?.error?.message || `Gemini HTTP ${res.status}`;
    if (res.status === 429 || res.status === 503) {
      throw {
        userMessage: "Gemini (бесплатный тариф) сейчас перегружен или превышен лимит запросов. Подождите минуту и попробуйте ещё раз.",
        code: "GEMINI_OVERLOADED",
        model,
      };
    }
    throw { userMessage: `Gemini: ${msg}`, code: "GEMINI_API_ERROR", model };
  }

  const parts = payload?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("\n").trim()
    : "";
  if (!text) {
    throw { userMessage: "Gemini не вернул результат распознавания", code: "GEMINI_EMPTY_RESPONSE", model };
  }
  const parsed = extractJsonFromText(text);
  if (!parsed) {
    console.error("Gemini returned invalid JSON", text.slice(0, 4000));
    throw { userMessage: "Gemini вернул некорректный JSON", code: "GEMINI_INVALID_JSON", model };
  }
  return { parsed, provider: "Gemini", model };
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

    const zaiKey = Deno.env.get("ZAI_API_KEY");
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!zaiKey && !groqKey && !geminiKey) {
      return jsonResponse(
        {
          error: "Не настроен ни один из ключей (ZAI_API_KEY / GROQ_API_KEY / GEMINI_API_KEY) в Supabase Secrets",
          code: "NO_PROVIDER_CONFIGURED",
        },
        503,
      );
    }

    const { mimeType, data } = parseDataUrl(image);

    let result: { parsed: unknown; provider: string; model: string };
    try {
      result = zaiKey
        ? await callZai(zaiKey, mimeType, data)
        : groqKey
          ? await callGroq(groqKey, mimeType, data)
          : await callGemini(geminiKey!, mimeType, data);
    } catch (e: any) {
      console.error("analyze-car-plate provider error", e);
      return jsonResponse(
        {
          error: e?.userMessage ?? "Ошибка распознавания",
          code: e?.code ?? "PROVIDER_ERROR",
          model: e?.model,
        },
        502,
      );
    }

    return jsonResponse({ ...normalizeModelOutput(result.parsed), provider: result.provider, model: result.model, _debug_build: "2026-09-12-filter-v2" });
  } catch (e) {
    console.error("analyze-car-plate error", e);
    return jsonResponse(
      {
        error: e instanceof Error ? e.message : "Не удалось распознать данные",
        code: "OCR_INTERNAL_ERROR",
      },
      500,
    );
  }
});