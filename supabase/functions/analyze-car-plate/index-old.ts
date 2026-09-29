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
  production_year: number | null; engine_volume_cc: number | null;
  power_hp: number | null; power_kw: number | null; fuel_type: string;
  engine_type: EngineType; transmission: string; drive_type: "fwd" | "rwd" | "awd";
  confidence: Record<string, number>;
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
function engine(value: unknown): EngineType {
  return ["petrol", "diesel", "hybrid", "phev", "electric"].includes(String(value)) ? value as EngineType : "petrol";
}
function drive(value: unknown): "fwd" | "rwd" | "awd" {
  return value === "fwd" || value === "rwd" ? value : "awd";
}

function normalize(value: any): OcrResponse {
  const c = value?.confidence ?? {};
  const model = text(value?.model);
  const forbidden = /gemini|gpt|claude|llama|qwen|deepseek|mistral|groq|openrouter/i;
  return {
    brand: text(value?.brand), model: forbidden.test(model) ? "" : model,
    modification: text(value?.modification), vin: text(value?.vin).toUpperCase().replace(/\s/g, "").slice(0, 17),
    production_year: num(value?.production_year), engine_volume_cc: num(value?.engine_volume_cc),
    power_hp: num(value?.power_hp), power_kw: num(value?.power_kw), fuel_type: text(value?.fuel_type),
    engine_type: engine(value?.engine_type), transmission: text(value?.transmission), drive_type: drive(value?.drive_type),
    confidence: {
      brand: clamp(c.brand), model: clamp(c.model), production_year: clamp(c.production_year),
      engine_volume_cc: clamp(c.engine_volume_cc), power_hp: clamp(c.power_hp), engine_type: clamp(c.engine_type),
    },
  };
}

function extractLines(payload: any): string[] {
  const out: string[] = [];
  const visit = (v: any) => {
    if (typeof v === "string") { if (v.trim()) out.push(v.trim()); return; }
    if (Array.isArray(v)) { for (const x of v) visit(x); return; }
    if (v && typeof v === "object") {
      for (const key of ["text", "content", "transcription", "rec_text", "rec_texts", "ocr_text", "lines"]) if (key in v) visit(v[key]);
      if (!Object.keys(v).some((k) => ["text", "content", "transcription", "rec_text", "rec_texts", "ocr_text", "lines"].includes(k))) {
        for (const x of Object.values(v)) visit(x);
      }
    }
  };
  visit(payload);
  return [...new Set(out)].slice(0, 200);
}

function parsePaddleResult(payload: any): OcrResponse {
  const lines = extractLines(payload);
  const all = lines.join(" ");
  const find = (patterns: RegExp[]) => {
    for (const pattern of patterns) { const m = all.match(pattern); if (m?.[1]) return m[1].trim(); }
    return "";
  };
  const vin = find([/\b([A-HJ-NPR-Z0-9]{17})\b/i, /VIN[：:\s]*([A-HJ-NPR-Z0-9]{11,17})/i]);
  const year = num(find([/(?:制造日期|生产日期|出厂日期|制造年月)[：:\s]*(20\d{2})/i, /\b(20\d{2})[./年-]\d{1,2}/i]));
  const volume = num(find([/(?:排量|发动机排量)[：:\s]*(\d{3,5})/i, /\b(\d{1,2}[.,]\d{1,2})\s*[L升]/i]));
  const kw = num(find([/(?:最大净功率|额定功率|功率)[：:\s]*(\d{2,4})\s*kW/i, /\b(\d{2,4})\s*kW/i]));
  const hp = num(find([/(?:马力|功率)[：:\s]*(\d{2,4})\s*(?:马力|hp|PS)/i, /\b(\d{2,4})\s*(?:马力|hp|PS)\b/i]));
  const hasBattery = /电池|驱动电机|混合动力|油电|插电|phev|hev/i.test(all);
  const hasIce = /发动机|排量|燃油|汽油|柴油|petrol|diesel/i.test(all);
  const type: EngineType = hasBattery && hasIce ? (/插电|phev/i.test(all) ? "phev" : "hybrid") : hasBattery ? "electric" : /柴油|diesel/i.test(all) ? "diesel" : "petrol";
  return normalize({
    brand: lines[0] ?? "", model: lines[1] ?? "", vin, production_year: year,
    engine_volume_cc: volume && volume < 20 ? Math.round(volume * 1000) : volume,
    power_kw: kw, power_hp: hp ?? (kw ? Math.round(kw * 1.35962) : null), engine_type: type,
    confidence: { brand: lines[0] ? 0.55 : 0, model: lines[1] ? 0.45 : 0, production_year: year ? 0.7 : 0,
      engine_volume_cc: volume ? 0.75 : 0, power_hp: hp || kw ? 0.7 : 0, engine_type: hasBattery || hasIce ? 0.65 : 0 },
  });
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
Нужный формат: {"brand":"","model":"","modification":"","vin":"","production_year":null,"engine_volume_cc":null,"power_hp":null,"power_kw":null,"fuel_type":"","engine_type":"petrol|diesel|hybrid|phev|electric","transmission":"","drive_type":"fwd|rwd|awd","confidence":{"brand":0,"model":0,"production_year":0,"engine_volume_cc":0,"power_hp":0,"engine_type":0}}
Марка и модель — автомобиль, не название AI-модели. Для китайских полей используй транслитерацию. Не придумывай отсутствующие значения. Если одновременно есть 发动机/排量 и батарея/驱动电机 — hybrid или phev; только батарея без ДВС — electric.`;
}

function extractJson(textValue: string): any | null {
  const cleaned = textValue.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { const m = cleaned.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } }
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
        body: JSON.stringify({ model, messages: [{ role: "user", content: [{ type: "text", text: buildPrompt(ocrText) }, { type: "image_url", image_url: { url: image } }] }], temperature: 0, max_tokens: 800 }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { last = { code: `OPENROUTER_HTTP_${res.status}`, userMessage: payload?.error?.message || `OpenRouter HTTP ${res.status}` }; continue; }
      const output = payload?.choices?.[0]?.message?.content;
      const parsed = extractJson(typeof output === "string" ? output : "");
      if (!parsed) { last = { code: "OPENROUTER_INVALID_JSON", userMessage: "OpenRouter вернул некорректный JSON" }; continue; }
      return { parsed: normalize(parsed), provider: "OpenRouter", model };
    } catch (e) { last = e; }
  }
  throw last ?? { code: "OPENROUTER_FAILED", userMessage: "OpenRouter не вернул результат" };
}

function needsFallback(result: OcrResponse): boolean {
  const c = result.confidence;
  return !result.brand || !result.model || (!result.vin && !result.production_year && !result.engine_volume_cc) ||
    [c.brand, c.model, c.production_year, c.engine_volume_cc, c.power_hp, c.engine_type].some((x) => x > 0 && x < 0.7);
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
    try { paddle = await callPaddle(image); } catch (e) { console.warn("PaddleOCR unavailable", e); }
    const paddleText = paddle ? JSON.stringify(paddle.parsed) : "";
    let final = paddle;
    let fallbackError: any = null;
    if (!paddle || needsFallback(paddle.parsed)) {
      try { final = await callOpenRouter(image, paddleText); } catch (e) { fallbackError = e; }
    }
    if (!final) return jsonResponse({ error: fallbackError?.userMessage ?? "Не удалось распознать фото", code: fallbackError?.code ?? "RECOGNITION_FAILED", manual_required: true, diagnostics: { paddleocr: OCR_URL ? "failed" : "not_configured", openrouter: OPENROUTER_KEY ? "failed" : "not_configured" } }, 502);

    const result = normalize(final.parsed);
    const response = { ...result, provider: final.provider, ai_model: final.model, fallback_used: final.provider === "OpenRouter", manual_required: needsFallback(result), cache: false, image_sha256: hash, diagnostics: { paddleocr: paddle ? "ok" : OCR_URL ? "failed" : "not_configured", openrouter: final.provider === "OpenRouter" ? "ok" : "not_used" } };
    await sb.from("recognition_cache").upsert({ image_sha256: hash, result, provider: final.provider, model: final.model, expires_at: new Date(Date.now() + CACHE_DAYS * 86_400_000).toISOString() });
    return jsonResponse(response);
  } catch (e: any) {
    console.error("analyze-car-plate error", e);
    return jsonResponse({ error: e?.userMessage ?? e?.message ?? "Не удалось распознать данные", code: e?.code ?? "OCR_INTERNAL_ERROR", manual_required: true }, 500);
  }
});
