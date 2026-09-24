// Supabase Edge Function: analyze-car-plate
// Pipeline: PaddleOCR (self-hosted HTTP) -> OpenRouter vision -> manual input.
// Secrets: PADDLEOCR_URL, OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_FALLBACK_MODELS.

import { corsHeaders, jsonResponse, readJson, requireUser, isRateLimited, supabaseAdmin } from "../_shared/http.ts";

const OCR_URL = Deno.env.get("PADDLEOCR_URL") ?? "";
const OCR_TOKEN = Deno.env.get("PADDLEOCR_SERVICE_TOKEN") ?? "";
const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const OPENROUTER_MODEL = Deno.env.get("OPENROUTER_MODEL") ?? "inclusionai/ling-3.0-flash-vl:free";
const OPENROUTER_FALLBACKS = (Deno.env.get("OPENROUTER_FALLBACK_MODELS") ?? "")
  .split(",").map((x) => x.trim()).filter(Boolean);
const CACHE_DAYS = 30;
const RATE_LIMIT = 20;
const RATE_LIMIT_WINDOW_MIN = 10;

type EngineType = "petrol" | "diesel" | "hybrid" | "phev" | "electric";
type Provider = "PaddleOCR" | "OpenRouter";

interface OcrResponse {
  brand: string; model: string; modification: string; vin: string;
  production_year: number | null; production_month: number | null;
  engine_volume_cc: number | null;
  power_hp: number | null; power_kw: number | null; fuel_type: string;
  engine_type: EngineType | null; transmission: string; drive_type: "fwd" | "rwd" | "awd" | null;
  confidence: Record<string, number>;
}

/** строка OCR с фактической уверенностью распознавания и рамкой */
interface OcrLine {
  text: string;
  confidence: number;
  /** [x_min, y_min, x_max, y_max] */
  box: [number, number, number, number] | null;
}

const jsonHeaders = { "Content-Type": "application/json" };

function parseDataUrl(image: string): { mimeType: string; data: string } {
  const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) throw new Error("Некорректный формат изображения. Ожидается data:image/...;base64,...");
  if (match[2].length > 18_000_000) throw new Error("Изображение слишком большое после сжатия");
  return { mimeType: match[1].toLowerCase(), data: match[2] };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchTimeout(url: string, init: RequestInit, ms = 25_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const m = value.replace(/\s/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function clamp(value: unknown): number {
  const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
// Поля, от которых зависят деньги, не подставляются по умолчанию:
// нераспознанное значение возвращается как null и заполняется клиентом.
function engine(value: unknown): EngineType | null {
  return ["petrol", "diesel", "hybrid", "phev", "electric"].includes(String(value)) ? value as EngineType : null;
}
function drive(value: unknown): "fwd" | "rwd" | "awd" | null {
  return value === "fwd" || value === "rwd" || value === "awd" ? value : null;
}

const inRange = (value: number | null, min: number, max: number): number | null =>
  value !== null && value >= min && value <= max ? value : null;

/** VIN по ISO 3779: 17 символов без I, O, Q */
function validVin(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
}

/** некорректный VIN лучше отдать пустым, чем подсунуть клиенту мусор для договора */
function vinOrEmpty(value: string): string {
  const vin = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
  return validVin(vin) ? vin : "";
}

/** контрольная цифра VIN (позиция 9); на части не-североамериканских VIN не совпадает */
function vinChecksumOk(vin: string): boolean {
  const translit = "0123456789.ABCDEFGH..JKLMN.P.R..STUVWXYZ";
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const index = translit.indexOf(vin[i]);
    if (index < 0) return false;
    sum += (index % 10) * weights[i];
  }
  const rest = sum % 11;
  return (rest === 10 ? "X" : String(rest)) === vin[8];
}

function normalize(value: any): OcrResponse {
  const c = value?.confidence ?? {};
  const model = text(value?.model);
  const forbidden = /gemini|gpt|claude|llama|qwen|deepseek|mistral|groq|openrouter/i;
  return {
    brand: text(value?.brand), model: forbidden.test(model) ? "" : model,
    modification: text(value?.modification), vin: vinOrEmpty(text(value?.vin)),
    production_year: inRange(num(value?.production_year), 1950, new Date().getFullYear() + 1),
    production_month: inRange(num(value?.production_month), 1, 12),
    engine_volume_cc: inRange(num(value?.engine_volume_cc), 400, 9000),
    power_hp: inRange(num(value?.power_hp), 20, 2000),
    power_kw: inRange(num(value?.power_kw), 15, 1500),
    fuel_type: text(value?.fuel_type),
    engine_type: engine(value?.engine_type), transmission: text(value?.transmission), drive_type: drive(value?.drive_type),
    confidence: {
      brand: clamp(c.brand), model: clamp(c.model), production_year: clamp(c.production_year),
      production_month: clamp(c.production_month),
      engine_volume_cc: clamp(c.engine_volume_cc), power_hp: clamp(c.power_hp), engine_type: clamp(c.engine_type),
      vin: clamp(c.vin),
    },
  };
}

const TEXT_KEYS = ["text", "content", "transcription", "rec_text", "rec_texts", "ocr_text", "lines"];

function toBox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value)) return null;
  const points = value.flat(2).map(Number).filter((n) => Number.isFinite(n));
  if (points.length < 4) return null;
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Строки OCR с их собственной уверенностью и рамкой.
 * Поддерживает и формат сервиса ({lines:[{text, confidence, box}]}), и сырой ответ PaddleOCR.
 */
function extractLines(payload: any): OcrLine[] {
  const out: OcrLine[] = [];
  const visit = (v: any) => {
    if (typeof v === "string") { if (v.trim()) out.push({ text: v.trim(), confidence: 0, box: null }); return; }
    if (Array.isArray(v)) { for (const x of v) visit(x); return; }
    if (v && typeof v === "object") {
      if (typeof v.text === "string" && v.text.trim()) {
        out.push({
          text: v.text.trim(),
          confidence: clamp(v.confidence ?? v.score ?? v.rec_score ?? 0),
          box: toBox(v.box ?? v.bbox ?? v.points ?? v.rec_polys ?? v.dt_polys),
        });
        return;
      }
      for (const key of TEXT_KEYS) if (key in v) visit(v[key]);
      if (!Object.keys(v).some((k) => TEXT_KEYS.includes(k))) for (const x of Object.values(v)) visit(x);
    }
  };
  visit(payload);
  const seen = new Set<string>();
  return out.filter((l) => (seen.has(l.text) ? false : (seen.add(l.text), true))).slice(0, 200);
}

/** Значение после метки в той же строке либо в ближайшей строке справа/снизу. */
function valueByLabel(lines: OcrLine[], label: RegExp): { value: string; confidence: number } | null {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const m = line.text.match(label);
    if (!m) continue;
    const inline = line.text.slice((m.index ?? 0) + m[0].length).replace(/^[：:\s.\-—]+/, "").trim();
    if (inline) return { value: inline, confidence: line.confidence };

    // метка и значение разнесены по разным боксам: ищем ближайший бокс справа или снизу
    if (line.box) {
      const [, ly0, lx1, ly1] = line.box;
      const candidates = lines
        .filter((o, j) => j !== i && o.box && !label.test(o.text))
        .map((o) => {
          const [ox0, oy0] = o.box as [number, number, number, number];
          const sameRow = oy0 < ly1 && (o.box as number[])[3] > ly0;
          const distance = sameRow ? ox0 - lx1 : Math.abs(ox0 - (line.box as number[])[0]) + (oy0 - ly1) * 2;
          return { line: o, ok: sameRow ? ox0 >= lx1 - 4 : oy0 >= ly1 - 4, distance };
        })
        .filter((c) => c.ok)
        .sort((a, b) => a.distance - b.distance);
      if (candidates[0]) return { value: candidates[0].line.text.trim(), confidence: candidates[0].line.confidence };
    }
  }
  return null;
}

const LABELS = {
  brand: /(?:品牌|厂牌|商标|BRAND)/i,
  model: /(?:车型|型号|车辆型号|MODEL|TYPE)\s*/i,
  vin: /(?:车辆识别代号|车架号|VIN)/i,
  date: /(?:制造日期|生产日期|出厂日期|制造年月|DATE\s*OF\s*MANUFACTURE|MFG\.?\s*DATE)/i,
  volume: /(?:发动机排量|排量|DISPLACEMENT)/i,
  power: /(?:最大净功率|额定功率|发动机功率|功率|POWER)/i,
  seats: /(?:乘坐人数|座位数)/i,
};

function parsePaddleResult(payload: any): OcrResponse {
  const lines = extractLines(payload);
  const all = lines.map((l) => l.text).join(" ");
  // уверенность самих OCR-строк, из которых взято значение; при отсутствии — уверенность regex-поиска по всему тексту
  const byLabel = (label: RegExp) => valueByLabel(lines, label);
  const lineScoreFor = (pattern: RegExp): number => {
    const hit = lines.find((l) => pattern.test(l.text));
    return hit ? hit.confidence : 0;
  };
  const findText = (patterns: RegExp[]): { value: string; confidence: number } | null => {
    for (const pattern of patterns) {
      const m = all.match(pattern);
      if (m?.[1]) return { value: m[1].trim(), confidence: lineScoreFor(new RegExp(escapeRe(m[0]))) };
    }
    return null;
  };

  const brandHit = byLabel(LABELS.brand);
  const modelHit = byLabel(LABELS.model);
  const vinHit = byLabel(LABELS.vin) ?? findText([/\b([A-HJ-NPR-Z0-9]{17})\b/i]);
  const vinRaw = (vinHit?.value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
  const vin = validVin(vinRaw) ? vinRaw : "";

  const dateHit = byLabel(LABELS.date) ?? findText([/\b(20\d{2}[./年-]\s?\d{1,2})/]);
  const dateMatch = dateHit?.value.match(/((?:19|20)\d{2})\s*[./年\-]?\s*(\d{1,2})?/);
  const year = dateMatch ? num(dateMatch[1]) : null;
  const month = dateMatch?.[2] ? num(dateMatch[2]) : null;

  const volumeHit = byLabel(LABELS.volume) ?? findText([/(\d{1,2}[.,]\d{1,2})\s*[L升]/i, /\b(\d{3,5})\s*(?:ml|mL|cc|毫升)\b/]);
  const volumeRaw = volumeHit ? num(volumeHit.value.replace(",", ".")) : null;
  const volume = volumeRaw !== null && volumeRaw < 20 ? Math.round(volumeRaw * 1000) : volumeRaw;

  const powerHit = byLabel(LABELS.power) ?? findText([/\b(\d{2,4})\s*kW\b/i]);
  const kw = powerHit ? num(powerHit.value) : null;
  const hpHit = findText([/\b(\d{2,4})\s*(?:马力|hp|PS)\b/i]);
  const hp = hpHit ? num(hpHit.value) : kw !== null ? Math.round(kw * 1.35962) : null;

  const hasBattery = /电池|驱动电机|混合动力|油电|插电|phev|hev/i.test(all);
  const hasIce = /发动机|排量|燃油|汽油|柴油|petrol|diesel/i.test(all);
  const type: EngineType | null = hasBattery && hasIce
    ? (/插电|phev/i.test(all) ? "phev" : "hybrid")
    : hasBattery ? "electric"
    : /柴油|diesel/i.test(all) ? "diesel"
    : hasIce ? "petrol"
    : null;

  return normalize({
    brand: brandHit?.value ?? "", model: modelHit?.value ?? "", vin,
    production_year: year, production_month: month,
    engine_volume_cc: volume,
    power_kw: kw, power_hp: hp, engine_type: type,
    confidence: {
      brand: brandHit?.confidence ?? 0,
      model: modelHit?.confidence ?? 0,
      // VIN с непройденной контрольной цифрой оставляем, но помечаем как сомнительный
      production_year: year ? dateHit?.confidence ?? 0 : 0,
      production_month: month ? dateHit?.confidence ?? 0 : 0,
      engine_volume_cc: volume ? volumeHit?.confidence ?? 0 : 0,
      power_hp: hp ? (hpHit ?? powerHit)?.confidence ?? 0 : 0,
      // тип двигателя выводится эвристикой по словам шильдика, а не читается напрямую
      engine_type: type ? (hasBattery && hasIce ? 0.5 : 0.65) : 0,
      vin: vin ? (vinChecksumOk(vin) ? vinHit?.confidence ?? 0 : Math.min(0.5, vinHit?.confidence ?? 0.5)) : 0,
    },
  });
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function callPaddle(image: string): Promise<{ parsed: OcrResponse; provider: Provider; model: string }> {
  if (!OCR_URL) throw { code: "PADDLEOCR_NOT_CONFIGURED", userMessage: "PaddleOCR backend не настроен" };
  const res = await fetchTimeout(OCR_URL, { method: "POST", headers: { ...jsonHeaders, ...(OCR_TOKEN ? { "X-Service-Token": OCR_TOKEN } : {}) }, body: JSON.stringify({ image }) });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw { code: "PADDLEOCR_HTTP_ERROR", userMessage: `PaddleOCR HTTP ${res.status}` };
  return { parsed: parsePaddleResult(payload), provider: "PaddleOCR", model: "PP-OCRv5" };
}

function buildPrompt(ocrText: string): string {
  return `Ты извлекаешь данные с фото автомобильного шильдика. Верни только JSON без markdown.
OCR-текст (может содержать ошибки): ${ocrText || "нет достоверного текста"}
Проверь изображение и исправь OCR только если символы действительно видны. Не угадывай.
Нужный формат: {"brand":"","model":"","modification":"","vin":"","production_year":null,"production_month":null,"engine_volume_cc":null,"power_hp":null,"power_kw":null,"fuel_type":"","engine_type":"petrol|diesel|hybrid|phev|electric","transmission":"","drive_type":"fwd|rwd|awd","confidence":{"brand":0,"model":0,"production_year":0,"production_month":0,"engine_volume_cc":0,"power_hp":0,"engine_type":0}}
Марка и модель — автомобиль, не название AI-модели. Для китайских полей используй транслитерацию. Не придумывай отсутствующие значения — лучше null.
production_month — месяц изготовления (1-12) из поля 制造日期/生产日期/DATE OF MANUFACTURE; если на шильдике только год — верни null, не угадывай.
Если одновременно есть 发动机/排量 и батарея/驱动电机 — hybrid или phev; только батарея без ДВС — electric.`;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        const item = part as Record<string, unknown>;
        return typeof item.text === "string" ? item.text : typeof item.content === "string" ? item.content : "";
      }
      return "";
    }).filter(Boolean).join("\n");
  }
  if (content && typeof content === "object") {
    const item = content as Record<string, unknown>;
    return contentToText(item.text ?? item.content ?? item.reasoning ?? "");
  }
  return "";
}

function extractJson(value: unknown): any | null {
  let textValue = contentToText(value)
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, "")
    .trim();

  textValue = textValue
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try { return JSON.parse(textValue); } catch { /* JSON may be surrounded by prose */ }

  const start = textValue.indexOf("{");
  const end = textValue.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(textValue.slice(start, end + 1)); } catch { return null; }
}

async function callOpenRouter(image: string, ocrText: string): Promise<{ parsed: OcrResponse; provider: Provider; model: string }> {
  if (!OPENROUTER_KEY) throw { code: "OPENROUTER_NOT_CONFIGURED", userMessage: "OpenRouter backend не настроен" };
  const models = [OPENROUTER_MODEL, ...OPENROUTER_FALLBACKS].filter((x, i, a) => x && a.indexOf(x) === i);
  let last: any = null;
  for (const model of models) {
    try {
      const res = await fetchTimeout("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { ...jsonHeaders, Authorization: `Bearer ${OPENROUTER_KEY}`, "HTTP-Referer": "https://autochina-calculator.local", "X-Title": "Auto China Calculator" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: [{ type: "text", text: buildPrompt(ocrText) }, { type: "image_url", image_url: { url: image } }] }],
          temperature: 0,
          max_tokens: 800,
          response_format: { type: "json_object" },
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { last = { code: `OPENROUTER_HTTP_${res.status}`, userMessage: payload?.error?.message || `OpenRouter HTTP ${res.status}` }; continue; }
      const message = payload?.choices?.[0]?.message;
      // Некоторые reasoning-модели возвращают content="", а JSON кладут в reasoning.
      // Оператор ?? не помогает для пустой строки, поэтому объединяем оба поля.
      const output = [message?.content, message?.reasoning]
        .map((value) => contentToText(value))
        .filter(Boolean)
        .join("\n");
      const parsed = extractJson(output);
      if (!parsed || typeof parsed !== "object") {
        last = { code: "OPENROUTER_INVALID_JSON", userMessage: `OpenRouter не вернул JSON (model=${model}, finish_reason=${payload?.choices?.[0]?.finish_reason ?? "unknown"})` };
        continue;
      }
      return { parsed: normalize(parsed), provider: "OpenRouter", model };
    } catch (e) { last = e; }
  }
  throw last ?? { code: "OPENROUTER_FAILED", userMessage: "OpenRouter не вернул результат" };
}

function needsFallback(result: OcrResponse): boolean {
  const hasBrandModel = Boolean(result.brand && result.model);
  // год и тип двигателя определяют сумму платежей — без них имеет смысл второй провайдер
  const hasFinancialFields = Boolean(result.production_year && result.engine_type);
  return !hasBrandModel || !hasFinancialFields;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Требуется авторизация", code: "AUTH_REQUIRED" }, 401);
    if (await isRateLimited(user.id, "analyze-car-plate", RATE_LIMIT, RATE_LIMIT_WINDOW_MIN)) return jsonResponse({ error: "Слишком много запросов распознавания. Попробуйте через несколько минут.", code: "RATE_LIMITED" }, 429);
    const { image } = (await readJson(req)) as { image?: string };
    if (!image) return jsonResponse({ error: "image is required", code: "IMAGE_REQUIRED" }, 400);
    parseDataUrl(image);
    const hash = await sha256(image);
    const sb = supabaseAdmin();
    const { data: cached } = await sb.from("recognition_cache").select("result, provider, model, expires_at").eq("image_sha256", hash).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (cached) return jsonResponse({ ...cached.result, provider: cached.provider, ai_model: cached.model, cache: true, image_sha256: hash });

    let paddle: { parsed: OcrResponse; provider: Provider; model: string } | null = null;
    const startedPaddle = Date.now();
    try { paddle = await callPaddle(image); } catch (e) { console.warn("PaddleOCR unavailable", e); }
    const paddleMs = Date.now() - startedPaddle;
    const paddleText = paddle ? JSON.stringify(paddle.parsed) : "";
    let final = paddle;
    let fallbackError: any = null;
    let openrouterMs = 0;
    if (!paddle || needsFallback(paddle.parsed)) {
      const startedOr = Date.now();
      try { final = await callOpenRouter(image, paddleText); } catch (e) { fallbackError = e; }
      openrouterMs = Date.now() - startedOr;
    }
    if (!final) return jsonResponse({ error: fallbackError?.userMessage ?? "Не удалось распознать фото", code: fallbackError?.code ?? "RECOGNITION_FAILED", manual_required: true, diagnostics: { paddleocr: OCR_URL ? "failed" : "not_configured", openrouter: OPENROUTER_KEY ? "failed" : "not_configured" } }, 502);

    const result = normalize(final.parsed);
    const response = { ...result, provider: final.provider, ai_model: final.model, fallback_used: final.provider === "OpenRouter", manual_required: needsFallback(result), cache: false, image_sha256: hash, diagnostics: { paddleocr: paddle ? "ok" : OCR_URL ? "failed" : "not_configured", openrouter: final.provider === "OpenRouter" ? "ok" : "not_used" }, timings_ms: { paddleocr: paddleMs, openrouter: openrouterMs } };
    await sb.from("recognition_cache").upsert({ image_sha256: hash, result, provider: final.provider, model: final.model, expires_at: new Date(Date.now() + CACHE_DAYS * 86_400_000).toISOString() });

    // Телеметрия для сравнения провайдеров (доля fallback, задержка, полнота полей).
    // Не должна ломать распознавание, поэтому ошибка записи только логируется.
    const { error: metricError } = await sb.from("recognition_metrics").insert({
      user_id: user.id,
      image_sha256: hash,
      provider: final.provider,
      model: final.model,
      fallback_used: final.provider === "OpenRouter",
      manual_required: response.manual_required,
      paddleocr_ms: paddleMs,
      openrouter_ms: openrouterMs,
      fields_recognized: [result.brand, result.model, result.vin, result.production_year, result.production_month, result.engine_volume_cc, result.power_hp, result.engine_type].filter((v) => v !== null && v !== "").length,
    });
    if (metricError) console.warn("recognition_metrics insert failed", metricError);
    return jsonResponse(response);
  } catch (e: any) {
    console.error("analyze-car-plate error", e);
    return jsonResponse({ error: e?.userMessage ?? e?.message ?? "Не удалось распознать данные", code: e?.code ?? "OCR_INTERNAL_ERROR", manual_required: true }, 500);
  }
});
