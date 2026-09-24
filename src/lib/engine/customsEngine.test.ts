import { describe, expect, it } from "vitest";
import { calculateCustoms, vehicleAgeYears, validateForCalculation } from "./customsEngine";
import type { CustomsArgs } from "./customsEngine";
import { SEED_RULES, DEMO_RULE_VERSION } from "../../data/seedRules";
import { emptyCar } from "../types";
import { D } from "../money";

const base = (over: Partial<CustomsArgs> = {}): CustomsArgs => ({
  production_year: 2023,
  production_month: 6,
  engine_volume_cc: 2998,
  power_hp: 340,
  power_kw: 250,
  engine_type: "petrol",
  vehicle_type: "passenger",
  importer_type: "physical",
  invoice_price_cny: "250000",
  cny_rate_effective: "12",
  eur_rate: "100",
  rules: SEED_RULES,
  rule_version: DEMO_RULE_VERSION.version,
  calc_date: "2027-03-15",
  ...over,
});

describe("vehicleAgeYears", () => {
  it("считает полные годы с учётом месяца изготовления", () => {
    expect(vehicleAgeYears(2024, 3, "2027-02-10")).toBe(2);
    expect(vehicleAgeYears(2024, 3, "2027-03-10")).toBe(3);
    expect(vehicleAgeYears(2024, 3, "2027-04-10")).toBe(3);
  });

  it("не возвращает отрицательный возраст для будущей даты изготовления", () => {
    expect(vehicleAgeYears(2028, 1, "2027-04-10")).toBe(0);
  });
});

describe("calculateCustoms: возраст с шильдика", () => {
  it("месяц меняет возрастную категорию и итоговые платежи", () => {
    // 2024-01 на 2027-03 -> 3 года; 2024-12 -> 2 года
    const older = calculateCustoms(base({ production_year: 2024, production_month: 1 }));
    const younger = calculateCustoms(base({ production_year: 2024, production_month: 12 }));
    expect(older.vehicle_age_years).toBe(3);
    expect(younger.vehicle_age_years).toBe(2);
    expect(older.total_customs).not.toBe(younger.total_customs);
  });

  it("без месяца берёт более дорогой вариант и помечает допущение", () => {
    const unknown = calculateCustoms(base({ production_year: 2024, production_month: null }));
    const jan = calculateCustoms(base({ production_year: 2024, production_month: 1 }));
    const dec = calculateCustoms(base({ production_year: 2024, production_month: 12 }));
    const worst = D(jan.total_customs).gt(dec.total_customs) ? jan : dec;

    expect(unknown.age_assumed).toBe(true);
    expect(unknown.age_note).toContain("Месяц изготовления не указан");
    expect(unknown.total_customs).toBe(worst.total_customs);
    expect(D(unknown.total_customs).gte(jan.total_customs)).toBe(true);
    expect(D(unknown.total_customs).gte(dec.total_customs)).toBe(true);
  });

  it("не помечает допущение, когда обе границы года дают один возраст", () => {
    // год выпуска совпадает с годом расчёта: любой месяц даёт возраст 0
    const r = calculateCustoms(base({ production_year: 2027, production_month: null }));
    expect(r.age_assumed).toBe(false);
    expect(r.vehicle_age_years).toBe(0);
  });

  it("не помечает допущение, если месяц известен", () => {
    expect(calculateCustoms(base()).age_assumed).toBe(false);
  });
});

describe("calculateCustoms: сценарии из README", () => {
  it("бензин 2998 см³ / 340 л.с. / 3–5 лет: положительные платежи и сходящийся итог", () => {
    const r = calculateCustoms(base({ production_year: 2023, production_month: 1 }));
    expect(r.vehicle_age_years).toBe(4);
    expect(D(r.customs_duty).gt(0)).toBe(true);
    expect(D(r.recycling_fee).gt(0)).toBe(true);
    const sum = D(r.customs_duty).plus(r.customs_fee).plus(r.recycling_fee).plus(r.excise).plus(r.vat);
    expect(r.total_customs).toBe(sum.toFixed(2));
  });

  it("дизель считается и даёт свои правила", () => {
    const r = calculateCustoms(base({ engine_type: "diesel" }));
    expect(D(r.total_customs).gt(0)).toBe(true);
    expect(r.applied_rules.length).toBeGreaterThan(0);
  });

  it("электромобиль без объёма двигателя считается", () => {
    const r = calculateCustoms(base({ engine_type: "electric", vehicle_type: "electric", engine_volume_cc: null }));
    expect(D(r.total_customs).gte(0)).toBe(true);
  });

  it("PHEV считается и отличается от бензина", () => {
    const phev = calculateCustoms(base({ engine_type: "phev", engine_volume_cc: 1496 }));
    expect(D(phev.total_customs).gt(0)).toBe(true);
  });

  it("юрлицо и физлицо получают разные платежи", () => {
    const physical = calculateCustoms(base({ importer_type: "physical" }));
    const legal = calculateCustoms(base({ importer_type: "legal" }));
    expect(physical.total_customs).not.toBe(legal.total_customs);
  });

  it("расчёт детерминирован при одинаковом входе", () => {
    expect(calculateCustoms(base()).total_customs).toBe(calculateCustoms(base()).total_customs);
  });

  it("фиксирует версию правил в результате", () => {
    expect(calculateCustoms(base()).rule_version).toBe(DEMO_RULE_VERSION.version);
  });
});

describe("validateForCalculation", () => {
  it("требует год выпуска и тип двигателя вместо молчаливой подстановки", () => {
    const missing = validateForCalculation(emptyCar(), "0");
    expect(missing).toContain("год выпуска");
    expect(missing).toContain("тип двигателя");
    expect(missing).toContain("цена автомобиля в Китае");
  });

  it("не требует объём двигателя у электромобиля", () => {
    const car = { ...emptyCar(), engine_type: "electric" as const, production_year: 2024, power_hp: 421 };
    expect(validateForCalculation(car, "250000")).toEqual([]);
  });
});
