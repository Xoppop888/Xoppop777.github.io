// Генерирует SQL INSERT для customs_rules / recycling_fee_rules из
// src/data/seedRules.ts — единственного источника правды по тарифам.
// Запуск: npx tsx scripts/gen-rules-sql.ts > /tmp/rules_seed.sql
import { SEED_RULES, DEMO_RULE_VERSION } from "../src/data/seedRules";
import type { RuleDef } from "../src/lib/types";

const sqlStr = (v: string | null): string => (v === null ? "null" : `'${v.replace(/'/g, "''")}'`);
const sqlNum = (v: string | number | null): string => (v === null ? "null" : String(v));
const sqlBool = (v: boolean): string => (v ? "true" : "false");

const CUSTOMS_KINDS = new Set(["duty", "fee", "excise", "vat"]);

const rowValues = (r: RuleDef): string =>
  `(${sqlStr(r.id)}, ${sqlStr(r.kind)}, ${sqlStr(r.name)}, ${sqlStr(r.vehicle_type)}, ${sqlStr(r.importer_type)}, ` +
  `${sqlStr(r.engine_type)}, ${sqlNum(r.min_engine_volume)}, ${sqlNum(r.max_engine_volume)}, ${sqlNum(r.min_power)}, ` +
  `${sqlNum(r.max_power)}, ${sqlNum(r.min_vehicle_age)}, ${sqlNum(r.max_vehicle_age)}, ${sqlNum(r.min_customs_value)}, ` +
  `${sqlNum(r.max_customs_value)}, ${sqlStr(r.formula)}, ${sqlNum(r.rate)}, ${sqlNum(r.fixed_amount)}, ` +
  `${sqlNum(r.coefficient)}, ${sqlStr(r.effective_from)}, ${sqlStr(r.effective_to)}, ${sqlBool(r.is_active)}, ${sqlStr(r.version)})`;

const COLUMNS =
  "(id, kind, name, vehicle_type, importer_type, engine_type, min_engine_volume, max_engine_volume, " +
  "min_power, max_power, min_vehicle_age, max_vehicle_age, min_customs_value, max_customs_value, " +
  "formula, rate, fixed_amount, coefficient, effective_from, effective_to, is_active, version)";

const customsRows = SEED_RULES.filter((r) => CUSTOMS_KINDS.has(r.kind));
const recyclingRows = SEED_RULES.filter((r) => !CUSTOMS_KINDS.has(r.kind));

const out: string[] = [];
out.push("-- Автосгенерировано из src/data/seedRules.ts — не редактируйте руками, пересоздайте скриптом.");
out.push(
  `insert into public.calculation_rule_versions (version, name, effective_from, is_demo) values (${sqlStr(DEMO_RULE_VERSION.version)}, ${sqlStr(DEMO_RULE_VERSION.name)}, ${sqlStr(DEMO_RULE_VERSION.effective_from)}, ${sqlBool(DEMO_RULE_VERSION.is_demo)}) on conflict (version) do update set name = excluded.name, effective_from = excluded.effective_from, is_demo = excluded.is_demo;`
);
out.push("");
out.push(`insert into public.customs_rules ${COLUMNS} values`);
out.push(customsRows.map(rowValues).join(",\n") + "\non conflict (id) do update set (kind, name, vehicle_type, importer_type, engine_type, min_engine_volume, max_engine_volume, min_power, max_power, min_vehicle_age, max_vehicle_age, min_customs_value, max_customs_value, formula, rate, fixed_amount, coefficient, effective_from, effective_to, is_active, version) = (excluded.kind, excluded.name, excluded.vehicle_type, excluded.importer_type, excluded.engine_type, excluded.min_engine_volume, excluded.max_engine_volume, excluded.min_power, excluded.max_power, excluded.min_vehicle_age, excluded.max_vehicle_age, excluded.min_customs_value, excluded.max_customs_value, excluded.formula, excluded.rate, excluded.fixed_amount, excluded.coefficient, excluded.effective_from, excluded.effective_to, excluded.is_active, excluded.version);");
out.push("");
out.push(`insert into public.recycling_fee_rules ${COLUMNS} values`);
out.push(recyclingRows.map(rowValues).join(",\n") + "\non conflict (id) do update set (kind, name, vehicle_type, importer_type, engine_type, min_engine_volume, max_engine_volume, min_power, max_power, min_vehicle_age, max_vehicle_age, min_customs_value, max_customs_value, formula, rate, fixed_amount, coefficient, effective_from, effective_to, is_active, version) = (excluded.kind, excluded.name, excluded.vehicle_type, excluded.importer_type, excluded.engine_type, excluded.min_engine_volume, excluded.max_engine_volume, excluded.min_power, excluded.max_power, excluded.min_vehicle_age, excluded.max_vehicle_age, excluded.min_customs_value, excluded.max_customs_value, excluded.formula, excluded.rate, excluded.fixed_amount, excluded.coefficient, excluded.effective_from, excluded.effective_to, excluded.is_active, excluded.version);");
out.push("");
out.push(
  `update public.app_settings set rule_version = ${sqlStr(DEMO_RULE_VERSION.version)} where id = 1;`
);

console.log(out.join("\n"));
