import type { RateResult } from "../types";
import { getEdgeAuthHeaders } from "../supabaseClient";

const env = ((import.meta as unknown as { env?: Record<string, string> }).env) || {};

/**
 * Абстракция источников курсов.
 * CNY: только через backend (Edge Function get-vtb-cny-rate) — никогда из браузера.
 * EUR: официальный курс ЦБ РФ (через backend; в dev допускается публичное daily-зеркало ЦБ).
 * Если источник недоступен — ручной ввод + явная пометка источника Manual.
 */
export interface RateProvider {
  fetchCnyRate(): Promise<RateResult>;
  fetchEurRate(): Promise<RateResult>;
}

const timeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("Превышено время ожидания")), ms)),
  ]);

/** Production-провайдер: оба курса через Supabase Edge Functions */
export class EdgeRateProvider implements RateProvider {
  private base = env.VITE_EDGE_URL ?? "";

  async fetchCnyRate(): Promise<RateResult> {
    const headers = await getEdgeAuthHeaders();
    const res = await timeout(
      fetch(`${this.base}/get-vtb-cny-rate`, { method: "POST", headers, body: "{}" }),
      9000
    );
    const j = (await res.json().catch(() => ({}))) as { rate?: string; fetched_at?: string; error?: string };
    if (res.status === 401) throw new Error("Войдите в аккаунт, чтобы запросить курс ВТБ");
    if (res.status === 429) throw new Error("Слишком частые запросы курса ВТБ. Попробуйте через пару минут.");
    if (!res.ok || !j.rate) throw new Error(j.error ?? "Edge function get-vtb-cny-rate недоступна");
    return {
      rate: j.rate,
      source: "VTB",
      fetched_at: j.fetched_at ?? new Date().toISOString(),
      note: "Курс ВТБ (через backend)",
    };
  }

  async fetchEurRate(): Promise<RateResult> {
    const headers = await getEdgeAuthHeaders();
    const res = await timeout(
      fetch(`${this.base}/get-cbr-eur-rate`, { method: "POST", headers, body: "{}" }),
      9000
    );
    const j = (await res.json().catch(() => ({}))) as { rate?: string; date?: string; error?: string };
    if (res.status === 401) throw new Error("Войдите в аккаунт, чтобы запросить курс ЦБ");
    if (!res.ok || !j.rate) throw new Error(j.error ?? "Edge function get-cbr-eur-rate недоступна");
    return {
      rate: j.rate,
      source: "CBR",
      fetched_at: j.date ? new Date(j.date).toISOString() : new Date().toISOString(),
      note: "Официальный курс ЦБ РФ",
    };
  }
}

/**
 * Development-провайдер.
 * EUR: пробуем публичное daily-зеркало официального курса ЦБ РФ (cbr-xml-daily).
 * CNY: API ВТБ из браузера не запрашиваем — сразу сообщаем о недоступности,
 *      чтобы UI предложил ручной ввод (или demo-курс с явной пометкой DEMO DATA).
 */
export class DevRateProvider implements RateProvider {
  async fetchCnyRate(): Promise<RateResult> {
    if (env.VITE_EDGE_URL) return new EdgeRateProvider().fetchCnyRate();
    throw new Error("Курс ВТБ ищет Gemini на backend (Edge Function get-vtb-cny-rate). В dev-режиме backend не подключен — введите курс вручную.");
  }

  async fetchEurRate(): Promise<RateResult> {
    if (env.VITE_EDGE_URL) return new EdgeRateProvider().fetchEurRate();
    const res = await timeout(fetch("https://www.cbr-xml-daily.ru/daily_json.js"), 8000);
    if (!res.ok) throw new Error("Не удалось получить курс EUR ЦБ РФ");
    const j = (await res.json()) as { Date?: string; Valute?: { EUR?: { Value?: number } } };
    const value = j.Valute?.EUR?.Value;
    if (!value) throw new Error("Не удалось получить курс EUR ЦБ РФ");
    return {
      rate: String(value),
      source: "CBR",
      fetched_at: j.Date ? new Date(j.Date).toISOString() : new Date().toISOString(),
      note: "Официальный курс ЦБ РФ (daily)",
    };
  }
}

/** Mock только для разработки — явная пометка Demo в интерфейсе */
export class MockRateProvider implements RateProvider {
  async fetchCnyRate(): Promise<RateResult> {
    await new Promise((r) => setTimeout(r, 500));
    return {
      rate: "12.45",
      source: "Demo",
      fetched_at: new Date().toISOString(),
      note: "DEMO DATA — курс не является реальным",
    };
  }
  async fetchEurRate(): Promise<RateResult> {
    await new Promise((r) => setTimeout(r, 500));
    return {
      rate: "96.52",
      source: "Demo",
      fetched_at: new Date().toISOString(),
      note: "DEMO DATA — курс не является реальным",
    };
  }
}

export const getRateProvider = (): RateProvider =>
  env.VITE_EDGE_URL ? new EdgeRateProvider() : new DevRateProvider();

export const demoRates = new MockRateProvider();
