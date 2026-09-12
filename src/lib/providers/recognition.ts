import { fetchWithRetry } from "./fetchWithRetry";
import type { OcrResult, CarData } from "../types";
import { emptyCar } from "../types";
import { getEdgeAuthHeaders } from "../supabaseClient";

const env = ((import.meta as unknown as { env?: Record<string, string> }).env) || {};

const edgeBase = env.VITE_EDGE_URL || (env.VITE_SUPABASE_URL ? `${env.VITE_SUPABASE_URL.replace(/\/$/, "")}/functions/v1` : "");

/**
 * CarRecognitionProvider — abstraction layer над OCR/AI.
 * Pipeline подключается ТОЛЬКО через backend: PaddleOCR → OpenRouter → ручной ввод.
 * Все ключи провайдеров хранятся в Supabase Secrets.
 * Замена провайдера не требует изменений frontend.
 */
export interface CarRecognitionProvider {
  analyze(imageData: string): Promise<OcrResult>;
}

interface RawOcr {
  brand?: string;
  model?: string;
  modification?: string;
  vin?: string;
  production_year?: number | null;
  engine_volume_cc?: number | null;
  power_hp?: number | null;
  power_kw?: number | null;
  fuel_type?: string;
  engine_type?: string;
  eco_class?: string;
  transmission?: string;
  drive_type?: string;
  confidence?: Partial<Record<"brand" | "model" | "production_year" | "engine_volume_cc" | "power_hp" | "engine_type", number>>;
}

const normalize = (raw: RawOcr, demo: boolean, meta?: Partial<OcrResult>): OcrResult => {
  const car: CarData = {
    ...emptyCar(),
    brand: raw.brand ?? "",
    model: raw.model ?? "",
    modification: raw.modification ?? "",
    vin: raw.vin ?? "",
    production_year: raw.production_year ?? null,
    engine_volume_cc: raw.engine_volume_cc ?? null,
    power_hp: raw.power_hp ?? null,
    power_kw: raw.power_kw ?? null,
    fuel_type: raw.fuel_type ?? "АИ-95",
    eco_class: raw.eco_class ?? "",
    engine_type:
      raw.engine_type === "electric" || raw.engine_type === "diesel" || raw.engine_type === "hybrid" || raw.engine_type === "phev"
        ? raw.engine_type
        : "petrol",
    transmission: raw.transmission ?? "Автомат",
    drive_type: raw.drive_type === "fwd" || raw.drive_type === "rwd" ? raw.drive_type : "awd",
  };
  return {
    data: car,
    confidence: {
      brand: raw.confidence?.brand ?? 0,
      model: raw.confidence?.model ?? 0,
      production_year: raw.confidence?.production_year ?? 0,
      engine_volume_cc: raw.confidence?.engine_volume_cc ?? 0,
      power_hp: raw.confidence?.power_hp ?? 0,
      engine_type: raw.confidence?.engine_type ?? 0,
    },
    demo,
    provider: meta?.provider,
    ai_model: meta?.ai_model,
    fallback_used: meta?.fallback_used,
    manual_required: meta?.manual_required,
    cache: meta?.cache,
    diagnostics: meta?.diagnostics,
  };
};

export class EdgeCarRecognitionProvider implements CarRecognitionProvider {
  async analyze(imageData: string): Promise<OcrResult> {
    const base = edgeBase;
    if (!base) throw new Error("Supabase не настроен: укажите VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY");

    const headers = await getEdgeAuthHeaders();

    // fetchWithRetry прозрачно повторяет запрос при 502/503/504 и сетевых ошибках —
    // это спасает от холодных стартов Supabase Edge Functions.
    const res = await fetchWithRetry(
      `${base}/analyze-car-plate`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ image: imageData }),
      },
      3,
    );

    const j = (await res.json().catch(() => ({}))) as RawOcr & { error?: string; code?: string; provider?: "PaddleOCR" | "OpenRouter"; ai_model?: string; fallback_used?: boolean; manual_required?: boolean; cache?: boolean; diagnostics?: { paddleocr?: string; openrouter?: string } };

    if (res.status === 401) {
      throw new Error("Войдите в аккаунт, чтобы распознать шильдик");
    }
    if (res.status === 429) {
      throw new Error("Слишком много запросов распознавания. Попробуйте через пару минут.");
    }
    if (!res.ok) {
      // Показываем осмысленное сообщение с бэкенда, если оно есть.
      throw new Error(`${j.error ?? `Сервис распознавания недоступен (HTTP ${res.status})`}${j.code ? ` [${j.code}]` : ""}`);
    }

    return normalize(j, false, {
      provider: j.provider,
      ai_model: j.ai_model,
      fallback_used: j.fallback_used,
      manual_required: j.manual_required,
      cache: j.cache,
      diagnostics: j.diagnostics,
    });
  }
}

const SAMPLES: RawOcr[] = [
  {
    brand: "BMW", model: "X5", modification: "xDrive40i", vin: "WBAJB0C51KB123456",
    production_year: 2024, engine_volume_cc: 2998, power_hp: 340, power_kw: 250,
    fuel_type: "АИ-95", engine_type: "petrol", eco_class: "Евро-6", transmission: "Автомат", drive_type: "awd",
    confidence: { brand: 0.97, model: 0.94, production_year: 0.9, engine_volume_cc: 0.88, power_hp: 0.92, engine_type: 0.9 },
  },
  {
    brand: "Zeekr", model: "001", modification: "Premium", vin: "LZT3C0E5XPA098765",
    production_year: 2024, engine_volume_cc: null, power_hp: 421, power_kw: 310,
    fuel_type: "Электро", engine_type: "electric", transmission: "Автомат", drive_type: "awd",
    confidence: { brand: 0.93, model: 0.9, production_year: 0.62, engine_volume_cc: 0, power_hp: 0.85, engine_type: 0.9 },
  },
  {
    brand: "Li Auto", model: "L7", modification: "Pro", vin: "LA6T4E8C2S1234567",
    production_year: 2023, engine_volume_cc: 1496, power_hp: 449, power_kw: 330,
    fuel_type: "АИ-95 + электро", engine_type: "phev", transmission: "Автомат", drive_type: "awd",
    confidence: { brand: 0.89, model: 0.86, production_year: 0.91, engine_volume_cc: 0.58, power_hp: 0.79, engine_type: 0.9 },
  },
  {
    brand: "Geely", model: "Monjaro", modification: "2.0 TD", vin: "LGG5D2A79P0456789",
    production_year: 2023, engine_volume_cc: 1969, power_hp: 238, power_kw: 175,
    fuel_type: "АИ-95", engine_type: "petrol", transmission: "Автомат", drive_type: "awd",
    confidence: { brand: 0.95, model: 0.92, production_year: 0.88, engine_volume_cc: 0.9, power_hp: 0.66, engine_type: 0.9 },
  },
  {
    brand: "Toyota", model: "Camry", modification: "2.5 AT", vin: "JTNBE46K273012345",
    production_year: 2022, engine_volume_cc: 2487, power_hp: 209, power_kw: 154,
    fuel_type: "АИ-95", engine_type: "petrol", transmission: "Автомат", drive_type: "fwd",
    confidence: { brand: 0.98, model: 0.96, production_year: 0.55, engine_volume_cc: 0.93, power_hp: 0.9, engine_type: 0.9 },
  },
];

/** Mock-распознавание ТОЛЬКО для разработки (нет backend). Помечается demo=true. */
export class MockCarRecognitionProvider implements CarRecognitionProvider {
  async analyze(_imageData: string): Promise<OcrResult> {
    await new Promise((r) => setTimeout(r, 1900));
    const sample = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
    return normalize(sample, true);
  }
}

export const getRecognitionProvider = (): CarRecognitionProvider =>
  edgeBase ? new EdgeCarRecognitionProvider() : new MockCarRecognitionProvider();
