export type Currency = "RUB" | "CNY" | "EUR";
export type EngineType = "petrol" | "diesel" | "hybrid" | "phev" | "electric";
export type DriveType = "fwd" | "rwd" | "awd";
export type VehicleType = "passenger" | "electric" | "other";
export type ImporterType = "physical" | "legal";
export type RateSource = "VTB" | "CBR" | "Manual" | "Demo";
export type RuleKind = "duty" | "fee" | "recycling_base" | "recycling_coeff" | "excise" | "vat";
export type RuleFormula = "percent" | "eur_per_cc" | "percent_or_eur_cc_max" | "fixed" | "base_times_coeff" | "per_hp";

export interface CarData {
  brand: string;
  model: string;
  modification: string;
  vin: string;
  production_year: number | null;
  engine_volume_cc: number | null;
  power_hp: number | null;
  power_kw: number | null;
  engine_type: EngineType;
  fuel_type: string;
  eco_class: string;
  transmission: string;
  drive_type: DriveType;
  vehicle_type: VehicleType;
  importer_type: ImporterType;
}

export interface OcrConfidence {
  brand: number;
  model: number;
  production_year: number;
  engine_volume_cc: number;
  power_hp: number;
  engine_type: number;
}

export interface OcrResult {
  data: CarData;
  confidence: OcrConfidence;
  demo: boolean;
  provider?: "PaddleOCR" | "OpenRouter" | "Manual";
  ai_model?: string;
  fallback_used?: boolean;
  manual_required?: boolean;
  cache?: boolean;
  diagnostics?: { paddleocr?: string; openrouter?: string };
}

export interface ExchangeRate {
  id: string;
  currency: "CNY" | "EUR";
  rate: string;
  source: RateSource;
  fetched_at: string;
  is_manual: boolean;
  created_at: string;
}

export interface RuleDef {
  id: string;
  kind: RuleKind;
  name: string;
  vehicle_type: VehicleType | null;
  importer_type: ImporterType | null;
  engine_type: EngineType | null;
  min_engine_volume: number | null;
  max_engine_volume: number | null;
  min_power: number | null;
  max_power: number | null;
  min_vehicle_age: number | null;
  max_vehicle_age: number | null;
  min_customs_value: string | null;
  max_customs_value: string | null;
  formula: RuleFormula;
  rate: string | null;
  fixed_amount: string | null;
  coefficient: string | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  version: string;
  created_at?: string;
  updated_at?: string;
}

export interface RuleVersion {
  version: string;
  name: string;
  effective_from: string;
  is_demo: boolean;
}

export interface AppliedRule {
  kind: RuleKind;
  name: string;
  version: string;
  formula_text: string;
  amount_rub: string;
}

export interface RecyclingDetail {
  base_rub: string;
  coefficient: string;
  total_rub: string;
}

export interface CustomsBreakdown {
  customs_value_rub: string;
  customs_duty: string;
  customs_fee: string;
  recycling_fee: string;
  excise: string;
  vat: string;
  total_customs: string;
  recycling: RecyclingDetail;
  excise_applied: boolean;
  vat_applied: boolean;
  excise_reason: string;
  vat_reason: string;
  applied_rules: AppliedRule[];
  rule_version: string;
}

export interface ExpenseItem {
  id: string;
  name: string;
  amount: string;
  currency: Currency;
}

export interface ExpenseType {
  id: string;
  name: string;
  amount: string;
  currency: Currency;
}

export interface ChinaCosts {
  delivery_cny: string;
  china_russia_cny: string;
  seller_fee_cny: string;
  other_cny: string;
}

export interface ShippingCosts {
  china_russia_rub: string;
  russia_rub: string;
  other_rub: string;
}

export interface CalculationInput {
  car: CarData;
  china_price_cny: string;
  price_equals_invoice: boolean;
  invoice_price_cny: string;
  china_costs: ChinaCosts;
  cny_rate: string;
  cny_rate_source: RateSource;
  cny_fetched_at: string;
  eur_rate: string;
  eur_rate_source: RateSource;
  eur_fetched_at: string;
  cny_markup: string;
  broker_cost_rub: string;
  shipping: ShippingCosts;
  expenses: ExpenseItem[];
  image_data: string | null;
}

export interface CalculationSnapshot {
  id: string;
  user_id: string | null;
  created_at: string;
  input: CalculationInput;
  breakdown: CustomsBreakdown;
  car_cost_rub: string;
  china_costs_rub: string;
  delivery_total_rub: string;
  broker_cost_rub: string;
  other_costs_rub: string;
  total_cost_rub: string;
  uplift_percent: string;
  rule_version: string;
  /** поля расчетов, созданных после внедрения надбавки от инвойса */
  invoice_markup_cny?: string;
  invoice_markup_rub?: string;
  car_base_rub?: string;
}

export interface AppSettings {
  cny_markup: string;
  broker_default_price: string;
  rule_version: string;
}

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  created_at: string;
}

export interface AdminStats {
  users: number;
  calculations: number;
  avg_total_rub: string;
  today: number;
  month: number;
}

export interface RateResult {
  rate: string;
  source: RateSource;
  fetched_at: string;
  note: string;
}

export const emptyCar = (): CarData => ({
  brand: "",
  model: "",
  modification: "",
  vin: "",
  production_year: null,
  engine_volume_cc: null,
  power_hp: null,
  power_kw: null,
  engine_type: "petrol",
  fuel_type: "АИ-95",
  eco_class: "",
  transmission: "Автомат",
  drive_type: "awd",
  vehicle_type: "passenger",
  importer_type: "physical",
});

export const ENGINE_LABELS: Record<EngineType, string> = {
  petrol: "Бензин",
  diesel: "Дизель",
  hybrid: "Гибрид",
  phev: "Plug-in Hybrid",
  electric: "Электромобиль",
};

export const DRIVE_LABELS: Record<DriveType, string> = {
  fwd: "Передний",
  rwd: "Задний",
  awd: "Полный",
};

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  passenger: "Легковой автомобиль",
  electric: "Электромобиль",
  other: "Другое",
};

export const IMPORTER_LABELS: Record<ImporterType, string> = {
  physical: "Физическое лицо",
  legal: "Юридическое лицо",
};
