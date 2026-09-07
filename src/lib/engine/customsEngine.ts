import Decimal from "decimal.js";
import type {
  RuleDef,
  CarData,
  CalculationInput,
  CalculationSnapshot,
  CustomsBreakdown,
  AppliedRule,
  EngineType,
  VehicleType,
  ImporterType,
} from "../types";
import { D, round2 } from "../money";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface CustomsArgs {
  production_year: number;
  engine_volume_cc: number | null;
  power_hp: number | null;
  power_kw: number | null;
  engine_type: EngineType;
  vehicle_type: VehicleType;
  importer_type: ImporterType;
  invoice_price_cny: string;
  cny_rate_effective: string;
  eur_rate: string;
  rules: RuleDef[];
  rule_version: string;
  calc_date?: string;
}

interface MatchCtx {
  vehicle_type: VehicleType;
  importer_type: ImporterType;
  engine_type: EngineType;
  volume: number | null;
  power: number | null;
  age: number;
  customs_value: Decimal;
}

const vehicleAge = (production_year: number, date?: string): number => {
  const now = date ? new Date(date) : new Date();
  return Math.max(0, now.getFullYear() - production_year);
};

const matches = (r: RuleDef, ctx: MatchCtx, date: Date): boolean => {
  if (!r.is_active) return false;
  const from = new Date(r.effective_from);
  if (date < from) return false;
  if (r.effective_to && date > new Date(r.effective_to)) return false;
  if (r.vehicle_type && r.vehicle_type !== ctx.vehicle_type) return false;
  if (r.importer_type && r.importer_type !== ctx.importer_type) return false;
  if (r.engine_type && r.engine_type !== ctx.engine_type) return false;

  const check = (min: number | null, max: number | null, val: number | null) => {
    if (min === null && max === null) return true;
    if (val === null) return false;
    if (min !== null && val < min) return false;
    if (max !== null && val > max) return false;
    return true;
  };
  if (!check(r.min_engine_volume, r.max_engine_volume, ctx.volume)) return false;
  if (!check(r.min_power, r.max_power, ctx.power)) return false;
  if (!check(r.min_vehicle_age, r.max_vehicle_age, ctx.age)) return false;
  if (r.min_customs_value !== null && ctx.customs_value.lt(D(r.min_customs_value))) return false;
  if (r.max_customs_value !== null && ctx.customs_value.gt(D(r.max_customs_value))) return false;
  return true;
};

/** чем больше заданных ограничений — тем специфичнее правило */
const specificity = (r: RuleDef): number => {
  let s = 0;
  if (r.vehicle_type) s += 4;
  if (r.importer_type) s += 4;
  if (r.engine_type) s += 8;
  if (r.min_engine_volume !== null) s += 2;
  if (r.max_engine_volume !== null) s += 2;
  if (r.min_power !== null) s += 2;
  if (r.max_power !== null) s += 2;
  if (r.min_vehicle_age !== null) s += 2;
  if (r.max_vehicle_age !== null) s += 2;
  if (r.min_customs_value !== null) s += 2;
  if (r.max_customs_value !== null) s += 2;
  return s;
};

const findBest = (rules: RuleDef[], kind: RuleDef["kind"], ctx: MatchCtx, date: Date): RuleDef | null => {
  const pool = rules
    .filter((x) => x.kind === kind && matches(x, ctx, date))
    .sort((a, b) => specificity(b) - specificity(a));
  return pool[0] ?? null;
};

const formulaText = (r: RuleDef, ctx: MatchCtx): string => {
  switch (r.formula) {
    case "percent":
      return `${r.rate}% от таможенной стоимости`;
    case "eur_per_cc":
      return `${ctx.volume ?? 0} см³ × ${r.rate} €/см³`;
    case "percent_or_eur_cc_max":
      return `max(${r.rate}% от ТС, ${ctx.volume ?? 0} см³ × ${r.coefficient} €/см³)`;
    case "fixed":
      return `фиксированная сумма по правилу`;
    case "per_hp":
      return `${ctx.power ?? 0} л.с. × ${r.rate} ₽/л.с.`;
    default:
      return r.name;
  }
};

const applyFormula = (r: RuleDef, ctx: MatchCtx, eurRate: Decimal): Decimal => {
  switch (r.formula) {
    case "percent":
      return ctx.customs_value.times(D(r.rate)).div(100);
    case "eur_per_cc":
      return new Decimal(ctx.volume ?? 0).times(D(r.rate)).times(eurRate);
    case "percent_or_eur_cc_max": {
      const pct = ctx.customs_value.times(D(r.rate)).div(100);
      const percc = new Decimal(ctx.volume ?? 0).times(D(r.coefficient ?? 0)).times(eurRate);
      return Decimal.max(pct, percc);
    }
    case "fixed":
      return D(r.fixed_amount);
    case "per_hp":
      return new Decimal(ctx.power ?? 0).times(D(r.rate));
    default:
      return new Decimal(0);
  }
};

/**
 * Детерминированный таможенный расчет.
 * При одинаковых входах, курсах и версии правил результат всегда одинаков.
 */
export function calculateCustoms(a: CustomsArgs): CustomsBreakdown {
  const date = a.calc_date ? new Date(a.calc_date) : new Date();
  const eur = D(a.eur_rate);
  const customs_value = D(a.invoice_price_cny).times(D(a.cny_rate_effective));
  const age = vehicleAge(a.production_year, a.calc_date);
  const ctx: MatchCtx = {
    vehicle_type: a.vehicle_type,
    importer_type: a.importer_type,
    engine_type: a.engine_type,
    volume: a.engine_volume_cc,
    power: a.power_hp,
    age,
    customs_value,
  };
  const applied: AppliedRule[] = [];

  // ---- Пошлина ----
  const dutyRule = findBest(a.rules, "duty", ctx, date);
  const duty = dutyRule ? applyFormula(dutyRule, ctx, eur) : new Decimal(0);
  if (dutyRule) {
    applied.push({
      kind: "duty",
      name: dutyRule.name,
      version: dutyRule.version,
      formula_text: formulaText(dutyRule, ctx),
      amount_rub: round2(duty),
    });
  }

  // ---- Таможенный сбор ----
  const feeRule = findBest(a.rules, "fee", ctx, date);
  const fee = feeRule ? applyFormula(feeRule, ctx, eur) : new Decimal(0);
  if (feeRule) {
    applied.push({
      kind: "fee",
      name: feeRule.name,
      version: feeRule.version,
      formula_text: formulaText(feeRule, ctx),
      amount_rub: round2(fee),
    });
  }

  // ---- Утилизационный сбор: база × коэффициент ----
  const baseRule = findBest(a.rules, "recycling_base", ctx, date);
  const coeffRule = findBest(a.rules, "recycling_coeff", ctx, date);
  const recBase = baseRule ? D(baseRule.fixed_amount) : new Decimal(0);
  const recCoeff = coeffRule ? D(coeffRule.coefficient) : new Decimal(0);
  const recycling = recBase.times(recCoeff);
  if (baseRule && coeffRule) {
    applied.push({
      kind: "recycling_coeff",
      name: coeffRule.name,
      version: coeffRule.version,
      formula_text: `база ${recBase.toFixed(0)} ₽ × коэффициент ${recCoeff.toString()}`,
      amount_rub: round2(recycling),
    });
  }

  // ---- Акциз ----
  let excise = new Decimal(0);
  let excise_applied = false;
  let excise_reason = "";
  if (a.importer_type === "physical") {
    excise_reason = "Не применяется: для физлиц акциз учтен в единой ставке пошлины";
  } else if (a.engine_type === "electric") {
    excise_reason = "Не применяется: электромобили не облагаются акцизом";
  } else {
    const excRule = findBest(a.rules, "excise", ctx, date);
    if (excRule) {
      excise = applyFormula(excRule, ctx, eur);
      excise_applied = true;
      applied.push({
        kind: "excise",
        name: excRule.name,
        version: excRule.version,
        formula_text: formulaText(excRule, ctx),
        amount_rub: round2(excise),
      });
    } else {
      excise_reason = "Правило акциза не найдено";
    }
  }

  // ---- НДС ----
  let vat = new Decimal(0);
  let vat_applied = false;
  let vat_reason = "";
  if (a.importer_type === "physical") {
    vat_reason = "Не применяется: физлица не уплачивают НДС отдельно";
  } else {
    const vatRule = findBest(a.rules, "vat", ctx, date);
    if (vatRule) {
      vat = customs_value.plus(duty).plus(excise).times(D(vatRule.rate)).div(100);
      vat_applied = true;
      applied.push({
        kind: "vat",
        name: vatRule.name,
        version: vatRule.version,
        formula_text: `${vatRule.rate}% × (ТС + пошлина + акциз)`,
        amount_rub: round2(vat),
      });
    } else {
      vat_reason = "Правило НДС не найдено";
    }
  }

  const total = duty.plus(fee).plus(recycling).plus(excise).plus(vat);

  return {
    customs_value_rub: round2(customs_value),
    customs_duty: round2(duty),
    customs_fee: round2(fee),
    recycling_fee: round2(recycling),
    excise: round2(excise),
    vat: round2(vat),
    total_customs: round2(total),
    recycling: {
      base_rub: round2(recBase),
      coefficient: recCoeff.toString(),
      total_rub: round2(recycling),
    },
    excise_applied,
    vat_applied,
    excise_reason,
    vat_reason,
    applied_rules: applied,
    rule_version: a.rule_version,
  };
}

/** Расчетный курс = базовый × (1 + надбавка%) */
export const effectiveRate = (baseRate: string, markupPercent: string): Decimal =>
  D(baseRate).times(D(1).plus(D(markupPercent).div(100)));

export interface FullCalculation {
  breakdown: CustomsBreakdown;
  /** надбавка 2,5% от инвойса, в ¥ */
  invoice_markup_cny: string;
  /** надбавка 2,5% от инвойса, в ₽ */
  invoice_markup_rub: string;
  /** цена авто без надбавки, в ₽ */
  car_base_rub: string;
  car_cost_rub: string;
  china_costs_rub: string;
  delivery_total_rub: string;
  broker_cost_rub: string;
  other_costs_rub: string;
  total_cost_rub: string;
  uplift_percent: string;
}

/** Полный расчет итоговой стоимости в РФ по единой формуле */
export function computeFullCalculation(
  input: CalculationInput,
  rules: RuleDef[],
  rule_version: string
): FullCalculation {
  const baseRate = D(input.cny_rate); // курс ВТБ
  const markupPct = D(input.cny_markup).div(100);
  const eur = D(input.eur_rate);

  const invoice = input.price_equals_invoice ? input.china_price_cny : input.invoice_price_cny;

  // Стоимость автомобиля = цена в Китае + надбавка 2,5% ОТ ИНВОЙСА (по курсу ВТБ)
  const invoice_markup_cny = D(invoice).times(markupPct);
  const car_base_rub = D(input.china_price_cny).times(baseRate);
  const car_cost = D(input.china_price_cny).plus(invoice_markup_cny).times(baseRate);

  // Прочие суммы в юанях конвертируются по курсу ВТБ (надбавка применяется только к авто)
  const china_costs = D(input.china_costs.delivery_cny)
    .plus(D(input.china_costs.china_russia_cny))
    .plus(D(input.china_costs.seller_fee_cny))
    .plus(D(input.china_costs.other_cny))
    .times(baseRate);
  const delivery_total = D(input.china_costs.delivery_cny)
    .plus(D(input.china_costs.china_russia_cny))
    .times(baseRate)
    .plus(D(input.shipping.china_russia_rub))
    .plus(D(input.shipping.russia_rub))
    .plus(D(input.shipping.other_rub));

  const breakdown = calculateCustoms({
    production_year: input.car.production_year ?? new Date().getFullYear(),
    engine_volume_cc: input.car.engine_volume_cc,
    power_hp: input.car.power_hp,
    power_kw: input.car.power_kw,
    engine_type: input.car.engine_type,
    vehicle_type: input.car.engine_type === "electric" ? "electric" : input.car.vehicle_type,
    importer_type: input.car.importer_type,
    invoice_price_cny: invoice,
    // таможенная стоимость считается по курсу ВТБ без коммерческой надбавки
    cny_rate_effective: baseRate.toFixed(6),
    eur_rate: input.eur_rate,
    rules,
    rule_version,
  });

  const other = input.expenses.reduce((acc, e) => {
    const amt = D(e.amount);
    if (e.currency === "CNY") return acc.plus(amt.times(baseRate));
    if (e.currency === "EUR") return acc.plus(amt.times(eur));
    return acc.plus(amt);
  }, new Decimal(0));

  const total = car_cost
    .plus(china_costs)
    .plus(D(breakdown.total_customs))
    .plus(delivery_total)
    .plus(D(input.broker_cost_rub))
    .plus(other);

  const uplift = car_cost.gt(0)
    ? total.minus(car_cost).div(car_cost).times(100)
    : new Decimal(0);

  return {
    breakdown,
    invoice_markup_cny: round2(invoice_markup_cny),
    invoice_markup_rub: round2(invoice_markup_cny.times(baseRate)),
    car_base_rub: round2(car_base_rub),
    car_cost_rub: round2(car_cost),
    china_costs_rub: round2(china_costs),
    delivery_total_rub: round2(delivery_total),
    broker_cost_rub: round2(D(input.broker_cost_rub)),
    other_costs_rub: round2(other),
    total_cost_rub: round2(total),
    uplift_percent: round2(uplift),
  };
}

/** Валидация обязательных данных для расчета */
export function validateForCalculation(car: CarData, china_price_cny: string, broker_cost_rub?: string): string[] {
  const missing: string[] = [];
  if (!D(china_price_cny).gt(0)) missing.push("цена автомобиля в Китае");
  if (!car.production_year) missing.push("год выпуска");
  if (car.engine_type !== "electric" && !car.engine_volume_cc) missing.push("объем двигателя");
  if (!car.power_hp) missing.push("мощность");
  if (broker_cost_rub === "") missing.push("стоимость услуг брокера");
  return missing;
}

export const makeSnapshot = (
  id: string,
  user_id: string | null,
  input: CalculationInput,
  calc: FullCalculation,
  rule_version: string
): CalculationSnapshot => ({
  id,
  user_id,
  created_at: new Date().toISOString(),
  input,
  breakdown: calc.breakdown,
  invoice_markup_cny: calc.invoice_markup_cny,
  invoice_markup_rub: calc.invoice_markup_rub,
  car_base_rub: calc.car_base_rub,
  car_cost_rub: calc.car_cost_rub,
  china_costs_rub: calc.china_costs_rub,
  delivery_total_rub: calc.delivery_total_rub,
  broker_cost_rub: calc.broker_cost_rub,
  other_costs_rub: calc.other_costs_rub,
  total_cost_rub: calc.total_cost_rub,
  uplift_percent: calc.uplift_percent,
  rule_version,
});
