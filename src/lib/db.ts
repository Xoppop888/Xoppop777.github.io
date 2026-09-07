import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabaseClient";
import type {
  AppSettings,
  AppUser,
  AdminStats,
  CalculationSnapshot,
  ExchangeRate,
  ExpenseType,
  RuleDef,
  RuleVersion,
} from "./types";
import { SEED_RULES, SEED_EXPENSE_TYPES, DEMO_SETTINGS, DEMO_RULE_VERSION } from "../data/seedRules";
import { D, round2 } from "./money";

const env = ((import.meta as unknown as { env?: Record<string, string> }).env) || {};

export interface DbAdapter {
  mode: "local" | "supabase";
  // rates
  getLatestRate(currency: "CNY" | "EUR"): Promise<ExchangeRate | null>;
  saveRate(r: Omit<ExchangeRate, "id" | "created_at">): Promise<ExchangeRate>;
  listRates(currency: "CNY" | "EUR", limit?: number): Promise<ExchangeRate[]>;
  // rules
  listRules(): Promise<RuleDef[]>;
  saveRule(r: RuleDef): Promise<RuleDef>;
  deleteRule(id: string): Promise<void>;
  getRuleVersion(): Promise<RuleVersion>;
  // settings & expense types
  getSettings(): Promise<AppSettings>;
  saveSettings(s: AppSettings): Promise<void>;
  listExpenseTypes(): Promise<ExpenseType[]>;
  saveExpenseType(t: ExpenseType): Promise<ExpenseType>;
  deleteExpenseType(id: string): Promise<void>;
  // calculations
  listCalculations(userId: string | null): Promise<CalculationSnapshot[]>;
  getCalculation(id: string): Promise<CalculationSnapshot | null>;
  saveCalculation(c: CalculationSnapshot): Promise<CalculationSnapshot>;
  deleteCalculation(id: string): Promise<void>;
  // auth
  currentUser(): Promise<AppUser | null>;
  signIn(email: string, password: string): Promise<AppUser>;
  signUp(email: string, password: string, name: string): Promise<{ user: AppUser | null; needsEmailConfirm: boolean }>;
  signOut(): Promise<void>;
  // admin
  adminStats(): Promise<AdminStats>;
  listUsers(): Promise<AppUser[]>;
}

/* ------------------------------------------------------------------ */
/* LOCAL ADAPTER (development / demo). В production — SupabaseAdapter. */
/* ------------------------------------------------------------------ */

const LS = {
  users: "acc_users",
  session: "acc_session",
  rates: "acc_rates",
  rules: "acc_rules",
  settings: "acc_settings",
  expenseTypes: "acc_expense_types",
  calcs: "acc_calculations",
};

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded — ignore in demo */
  }
};
const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

interface LocalUserRow extends AppUser {
  password: string;
}

class LocalAdapter implements DbAdapter {
  mode = "local" as const;

  constructor() {
    if (!localStorage.getItem(LS.rules)) write(LS.rules, SEED_RULES);
    if (!localStorage.getItem(LS.settings)) write(LS.settings, DEMO_SETTINGS);
    if (!localStorage.getItem(LS.expenseTypes)) write(LS.expenseTypes, SEED_EXPENSE_TYPES);
  }

  async getLatestRate(currency: "CNY" | "EUR") {
    const all = read<ExchangeRate[]>(LS.rates, []).filter((r) => r.currency === currency);
    return all.sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))[0] ?? null;
  }
  async saveRate(r: Omit<ExchangeRate, "id" | "created_at">) {
    const row: ExchangeRate = { ...r, id: uid(), created_at: new Date().toISOString() };
    write(LS.rates, [row, ...read<ExchangeRate[]>(LS.rates, [])]);
    return row;
  }
  async listRates(currency: "CNY" | "EUR", limit = 12) {
    return read<ExchangeRate[]>(LS.rates, [])
      .filter((r) => r.currency === currency)
      .sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))
      .slice(0, limit);
  }

  async listRules() {
    return read<RuleDef[]>(LS.rules, []);
  }
  async saveRule(r: RuleDef) {
    const rules = read<RuleDef[]>(LS.rules, []);
    const i = rules.findIndex((x) => x.id === r.id);
    const next = { ...r, updated_at: new Date().toISOString() };
    if (i >= 0) rules[i] = next;
    else rules.push({ ...next, created_at: new Date().toISOString() });
    write(LS.rules, rules);
    return next;
  }
  async deleteRule(id: string) {
    write(LS.rules, read<RuleDef[]>(LS.rules, []).filter((r) => r.id !== id));
  }
  async getRuleVersion(): Promise<RuleVersion> {
    return DEMO_RULE_VERSION;
  }

  async getSettings() {
    return { ...DEMO_SETTINGS, ...read<Partial<AppSettings>>(LS.settings, {}) };
  }
  async saveSettings(s: AppSettings) {
    write(LS.settings, s);
  }

  async listExpenseTypes() {
    return read<ExpenseType[]>(LS.expenseTypes, []);
  }
  async saveExpenseType(t: ExpenseType) {
    const list = read<ExpenseType[]>(LS.expenseTypes, []);
    const i = list.findIndex((x) => x.id === t.id);
    if (i >= 0) list[i] = t;
    else list.push(t);
    write(LS.expenseTypes, list);
    return t;
  }
  async deleteExpenseType(id: string) {
    write(LS.expenseTypes, read<ExpenseType[]>(LS.expenseTypes, []).filter((t) => t.id !== id));
  }

  async listCalculations(userId: string | null) {
    const all = read<CalculationSnapshot[]>(LS.calcs, []);
    const user = await this.currentUser();
    const visible = user?.role === "admin" ? all : all.filter((c) => c.user_id === userId);
    return visible.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async getCalculation(id: string) {
    return read<CalculationSnapshot[]>(LS.calcs, []).find((c) => c.id === id) ?? null;
  }
  async saveCalculation(c: CalculationSnapshot) {
    write(LS.calcs, [c, ...read<CalculationSnapshot[]>(LS.calcs, []).filter((x) => x.id !== c.id)]);
    return c;
  }
  async deleteCalculation(id: string) {
    write(LS.calcs, read<CalculationSnapshot[]>(LS.calcs, []).filter((c) => c.id !== id));
  }

  async currentUser(): Promise<AppUser | null> {
    const sid = read<string | null>(LS.session, null);
    if (!sid) return null;
    const u = read<LocalUserRow[]>(LS.users, []).find((x) => x.id === sid);
    if (!u) return null;
    const { password: _pw, ...pub } = u;
    return pub;
  }
  async signIn(email: string, password: string): Promise<AppUser> {
    const users = read<LocalUserRow[]>(LS.users, []);
    const normalized = email.trim().toLowerCase();
    let u = users.find((x) => x.email === normalized);
    if (u && u.password !== password) throw new Error("Неверный пароль для этого аккаунта");
    if (!u) {
      u = {
        id: uid(),
        email: normalized,
        name: normalized.split("@")[0],
        role: normalized === "admin@autochina.ru" ? "admin" : "user",
        created_at: new Date().toISOString(),
        password,
      };
      users.push(u);
      write(LS.users, users);
    }
    write(LS.session, u.id);
    const { password: _pw, ...pub } = u;
    return pub;
  }
  async signUp(email: string, password: string, name: string): Promise<{ user: AppUser | null; needsEmailConfirm: boolean }> {
    const users = read<LocalUserRow[]>(LS.users, []);
    const normalized = email.trim().toLowerCase();
    if (users.find((x) => x.email === normalized)) throw new Error("Аккаунт с таким email уже существует");
    const u: LocalUserRow = {
      id: uid(),
      email: normalized,
      name: name.trim() || normalized.split("@")[0],
      role: normalized === "admin@autochina.ru" ? "admin" : "user",
      created_at: new Date().toISOString(),
      password,
    };
    users.push(u);
    write(LS.users, users);
    write(LS.session, u.id);
    const { password: _pw, ...pub } = u;
    return { user: pub, needsEmailConfirm: false };
  }
  async signOut() {
    write(LS.session, null);
  }

  async adminStats(): Promise<AdminStats> {
    const calcs = read<CalculationSnapshot[]>(LS.calcs, []);
    const users = read<LocalUserRow[]>(LS.users, []);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const totals = calcs.map((c) => D(c.total_cost_rub));
    const sum = totals.reduce((a, b) => a.plus(b), D(0));
    return {
      users: users.length,
      calculations: calcs.length,
      avg_total_rub: calcs.length ? round2(sum.div(calcs.length)) : "0",
      today: calcs.filter((c) => c.created_at >= startToday).length,
      month: calcs.filter((c) => c.created_at >= startMonth).length,
    };
  }
  async listUsers(): Promise<AppUser[]> {
    return read<LocalUserRow[]>(LS.users, []).map(({ password: _pw, ...u }) => u);
  }
}

/* ------------------------------------------------------------------ */
/* SUPABASE ADAPTER (production)                                        */
/* ------------------------------------------------------------------ */

class SupabaseAdapter implements DbAdapter {
  mode = "supabase" as const;
  private sb: SupabaseClient;

  constructor() {
    const sb = getSupabaseClient();
    if (!sb) throw new Error("Supabase client не настроен: проверьте VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY");
    this.sb = sb;
  }

  async getLatestRate(currency: "CNY" | "EUR") {
    const { data } = await this.sb
      .from("exchange_rates")
      .select("*")
      .eq("currency", currency)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as ExchangeRate) ?? null;
  }
  async saveRate(r: Omit<ExchangeRate, "id" | "created_at">) {
    const { data } = await this.sb.from("exchange_rates").insert(r).select().single();
    return data as ExchangeRate;
  }
  async listRates(currency: "CNY" | "EUR", limit = 12) {
    const { data } = await this.sb
      .from("exchange_rates")
      .select("*")
      .eq("currency", currency)
      .order("fetched_at", { ascending: false })
      .limit(limit);
    return (data as ExchangeRate[]) ?? [];
  }

  async listRules(): Promise<RuleDef[]> {
    const [c, r] = await Promise.all([
      this.sb.from("customs_rules").select("*").eq("is_active", true),
      this.sb.from("recycling_fee_rules").select("*").eq("is_active", true),
    ]);
    return [...((c.data as RuleDef[]) ?? []), ...((r.data as RuleDef[]) ?? [])];
  }
  async saveRule(rule: RuleDef) {
    const table = rule.kind.startsWith("recycling") ? "recycling_fee_rules" : "customs_rules";
    const { data } = await this.sb.from(table).upsert(rule).select().single();
    return data as RuleDef;
  }
  async deleteRule(id: string) {
    await this.sb.from("customs_rules").delete().eq("id", id);
    await this.sb.from("recycling_fee_rules").delete().eq("id", id);
  }
  async getRuleVersion(): Promise<RuleVersion> {
    const { data } = await this.sb
      .from("calculation_rule_versions")
      .select("*")
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as RuleVersion) ?? DEMO_RULE_VERSION;
  }

  async getSettings(): Promise<AppSettings> {
    const { data } = await this.sb.from("app_settings").select("*").limit(1).maybeSingle();
    const row = (data ?? {}) as Partial<AppSettings>;
    return { ...DEMO_SETTINGS, ...row };
  }
  async saveSettings(s: AppSettings) {
    await this.sb.from("app_settings").upsert({ id: 1, ...s });
  }

  async listExpenseTypes() {
    const { data } = await this.sb.from("additional_expense_types").select("*");
    return (data as ExpenseType[]) ?? [];
  }
  async saveExpenseType(t: ExpenseType) {
    const { data } = await this.sb.from("additional_expense_types").upsert(t).select().single();
    return data as ExpenseType;
  }
  async deleteExpenseType(id: string) {
    await this.sb.from("additional_expense_types").delete().eq("id", id);
  }

  async listCalculations(userId: string | null) {
    let q = this.sb.from("calculations").select("*").order("created_at", { ascending: false });
    const user = await this.currentUser();
    if (user?.role !== "admin") q = q.eq("user_id", userId);
    const { data } = await q;
    return ((data as unknown as CalculationSnapshot[]) ?? []).map(hydrateCalc);
  }
  async getCalculation(id: string) {
    const { data } = await this.sb.from("calculations").select("*").eq("id", id).maybeSingle();
    return data ? hydrateCalc(data as unknown as CalculationSnapshot) : null;
  }
  async saveCalculation(c: CalculationSnapshot) {
    const { data } = await this.sb.from("calculations").insert(flattenCalc(c)).select().single();
    return hydrateCalc(data as unknown as CalculationSnapshot);
  }
  async deleteCalculation(id: string) {
    await this.sb.from("calculations").delete().eq("id", id);
  }

  async currentUser(): Promise<AppUser | null> {
    const { data } = await this.sb.auth.getUser();
    if (!data.user) return null;
    const { data: profile } = await this.sb
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();
    return (
      (profile as AppUser) ?? {
        id: data.user.id,
        email: data.user.email ?? "",
        name: data.user.email?.split("@")[0] ?? "",
        role: "user",
        created_at: new Date().toISOString(),
      }
    );
  }
  async signIn(email: string, password: string): Promise<AppUser> {
    const res = await this.sb.auth.signInWithPassword({ email, password });
    if (res.error) throw new Error(res.error.message);
    return (await this.currentUser())!;
  }
  async signUp(email: string, password: string, name: string): Promise<{ user: AppUser | null; needsEmailConfirm: boolean }> {
    const res = await this.sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: name.trim() } },
    });
    if (res.error) throw new Error(res.error.message);
    // Если в проекте включено подтверждение email, Supabase не выдаёт сессию сразу —
    // res.data.session будет null, а res.data.user уже создан (но неактивен до подтверждения).
    const needsEmailConfirm = !res.data.session;
    const user = needsEmailConfirm ? null : await this.currentUser();
    return { user, needsEmailConfirm };
  }
  async signOut() {
    await this.sb.auth.signOut();
  }

  async adminStats(): Promise<AdminStats> {
    const { data } = await this.sb.rpc("admin_dashboard_stats");
    return (data as AdminStats) ?? { users: 0, calculations: 0, avg_total_rub: "0", today: 0, month: 0 };
  }
  async listUsers(): Promise<AppUser[]> {
    const { data } = await this.sb.from("profiles").select("*").order("created_at", { ascending: false });
    return (data as AppUser[]) ?? [];
  }
}

/* расчет хранится в БД плоскими колонками (см. schema.sql), снапшот — в JSONB */
function flattenCalc(c: CalculationSnapshot) {
  return {
    id: c.id,
    user_id: c.user_id,
    car_data: c.input.car,
    snapshot: c,
    china_price_cny: c.input.china_price_cny,
    invoice_price_cny: c.input.invoice_price_cny,
    cny_rate: c.input.cny_rate,
    cny_rate_source: c.input.cny_rate_source,
    eur_rate: c.input.eur_rate,
    eur_rate_source: c.input.eur_rate_source,
    customs_value_rub: c.breakdown.customs_value_rub,
    customs_duty: c.breakdown.customs_duty,
    customs_fee: c.breakdown.customs_fee,
    recycling_fee: c.breakdown.recycling_fee,
    excise: c.breakdown.excise,
    vat: c.breakdown.vat,
    shipping_cost: c.delivery_total_rub,
    broker_cost: c.broker_cost_rub,
    other_costs: c.other_costs_rub,
    total_cost_rub: c.total_cost_rub,
    customs_rule_version: c.rule_version,
  };
}
function hydrateCalc(row: CalculationSnapshot & { snapshot?: CalculationSnapshot }): CalculationSnapshot {
  return row.snapshot ?? row;
}

const hasSupabase = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);

/** Единая точка доступа к данным: Supabase (production) или локальный демо-адаптер */
export const db: DbAdapter = hasSupabase ? new SupabaseAdapter() : new LocalAdapter();

/** Сжатие изображения перед загрузкой в Storage (макс. сторона 1280px, JPEG) */
export function compressImage(file: File, maxSide = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas unavailable"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось прочитать изображение"));
    };
    img.src = url;
  });
}
