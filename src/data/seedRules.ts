import type { RuleDef, RuleVersion, AppSettings, ExpenseType } from "../lib/types";

/**
 * Реальные ставки по состоянию на 2026 год (сверено по открытым источникам на
 * 06.09.2026). Используются как значения по умолчанию для локального
 * dev-режима и как первоначальный сид для `supabase/schema.sql`. В production
 * это ТОЛЬКО отправная точка — храните и правьте тарифы через админ-панель
 * (таблицы customs_rules / recycling_fee_rules), не редактируя код.
 *
 * Источники и уверенность по блокам (см. комментарии по ходу файла):
 *  - Пошлина физлиц (ЕТП, Решение Совета ЕЭК № 107, Приложение 5) — стабильна
 *    с 2014 года, высокая уверенность.
 *  - Пошлина юрлиц/акциз/НДС — уверенность высокая, акциз проиндексирован
 *    Федеральным законом № 425-ФЗ от 28.11.2025.
 *  - Таможенный сбор — Постановления Правительства РФ № 1637 (28.11.2024) и
 *    № 1638 (23.10.2025), действует с 01.01.2026. Высокая уверенность.
 *  - Утильсбор — САМЫЙ ВОЛАТИЛЬНЫЙ блок: методика менялась в декабре 2025,
 *    январе 2026, и очередное изменение анонсировано на апрель 2026
 *    (коэффициенты для двигателей >3000 см³ вырастут вдвое). Действующая
 *    льгота для физлиц (личное пользование) реализована с высокой
 *    уверенностью. Коэффициенты "коммерческой" сетки (используется для
 *    юрлиц и для физлиц, не прошедших льготный порог) помечены ниже как
 *    ТРЕБУЮТ ПРОВЕРКИ — источники по ним расходятся. Проверьте перед стартом
 *    реальных расчетов по действующему тексту Постановления Правительства РФ
 *    № 1291 от 26.12.2013 (в текущей редакции).
 */
export const DEMO_RULE_VERSION: RuleVersion = {
  version: "ru-2026.1",
  name: "РФ, 2026 — сверено 06.09.2026 (утильсбор для юрлиц/сверх льготы требует проверки)",
  effective_from: "2026-01-01",
  is_demo: false,
};

export const DEMO_SETTINGS: AppSettings = {
  cny_markup: "2.5",
  broker_default_price: "40000",
  rule_version: DEMO_RULE_VERSION.version,
};

export const SEED_EXPENSE_TYPES: ExpenseType[] = [
  { id: "et-sbkts", name: "СБКТС", amount: "35000", currency: "RUB" },
  { id: "et-epts", name: "ЭПТС", amount: "5000", currency: "RUB" },
  { id: "et-lab", name: "Лаборатория / испытания", amount: "25000", currency: "RUB" },
  { id: "et-parking", name: "Стоянка СВХ", amount: "15000", currency: "RUB" },
  { id: "et-glonass", name: "ЭРА-ГЛОНАСС", amount: "7000", currency: "RUB" },
];

const V = DEMO_RULE_VERSION.version;
const FROM = "2026-01-01";

const r = (
  id: string,
  kind: RuleDef["kind"],
  name: string,
  p: Partial<RuleDef>
): RuleDef => ({
  id,
  kind,
  name,
  vehicle_type: null,
  importer_type: null,
  engine_type: null,
  min_engine_volume: null,
  max_engine_volume: null,
  min_power: null,
  max_power: null,
  min_vehicle_age: null,
  max_vehicle_age: null,
  min_customs_value: null,
  max_customs_value: null,
  formula: "percent",
  rate: null,
  fixed_amount: null,
  coefficient: null,
  effective_from: FROM,
  effective_to: null,
  is_active: true,
  version: V,
  ...p,
});

export const SEED_RULES: RuleDef[] = [
  // ================================================================
  // ПОШЛИНА ФИЗЛИЦ — ЕТП, Решение Совета ЕЭК № 107 (Приложение 5).
  // До 3 лет: max(% от таможенной стоимости, €/см³ × объём).
  // ================================================================
  r("duty-p-u3-v1000", "duty", "Физлицо, до 3 лет, до 1000 см³", {
    importer_type: "physical", min_vehicle_age: 0, max_vehicle_age: 2,
    max_engine_volume: 1000, formula: "percent_or_eur_cc_max", rate: "54", coefficient: "2.5",
  }),
  r("duty-p-u3-v1500", "duty", "Физлицо, до 3 лет, 1000–1500 см³", {
    importer_type: "physical", min_vehicle_age: 0, max_vehicle_age: 2,
    min_engine_volume: 1001, max_engine_volume: 1500, formula: "percent_or_eur_cc_max", rate: "48", coefficient: "3.5",
  }),
  r("duty-p-u3-v1800", "duty", "Физлицо, до 3 лет, 1500–1800 см³", {
    importer_type: "physical", min_vehicle_age: 0, max_vehicle_age: 2,
    min_engine_volume: 1501, max_engine_volume: 1800, formula: "percent_or_eur_cc_max", rate: "48", coefficient: "5.5",
  }),
  r("duty-p-u3-v2300", "duty", "Физлицо, до 3 лет, 1800–2300 см³", {
    importer_type: "physical", min_vehicle_age: 0, max_vehicle_age: 2,
    min_engine_volume: 1801, max_engine_volume: 2300, formula: "percent_or_eur_cc_max", rate: "48", coefficient: "7.5",
  }),
  r("duty-p-u3-v3000", "duty", "Физлицо, до 3 лет, 2300–3000 см³", {
    importer_type: "physical", min_vehicle_age: 0, max_vehicle_age: 2,
    min_engine_volume: 2301, max_engine_volume: 3000, formula: "percent_or_eur_cc_max", rate: "48", coefficient: "12",
  }),
  r("duty-p-u3-vmax", "duty", "Физлицо, до 3 лет, свыше 3000 см³", {
    importer_type: "physical", min_vehicle_age: 0, max_vehicle_age: 2,
    min_engine_volume: 3001, formula: "percent_or_eur_cc_max", rate: "48", coefficient: "15.5",
  }),

  // ---- 3–5 лет: фиксированная ставка €/см³ ----
  r("duty-p-35-v1000", "duty", "Физлицо, 3–5 лет, до 1000 см³", {
    importer_type: "physical", min_vehicle_age: 3, max_vehicle_age: 5,
    max_engine_volume: 1000, formula: "eur_per_cc", rate: "1.5",
  }),
  r("duty-p-35-v1500", "duty", "Физлицо, 3–5 лет, 1000–1500 см³", {
    importer_type: "physical", min_vehicle_age: 3, max_vehicle_age: 5,
    min_engine_volume: 1001, max_engine_volume: 1500, formula: "eur_per_cc", rate: "1.7",
  }),
  r("duty-p-35-v1800", "duty", "Физлицо, 3–5 лет, 1500–1800 см³", {
    importer_type: "physical", min_vehicle_age: 3, max_vehicle_age: 5,
    min_engine_volume: 1501, max_engine_volume: 1800, formula: "eur_per_cc", rate: "2.5",
  }),
  r("duty-p-35-v2300", "duty", "Физлицо, 3–5 лет, 1800–2300 см³", {
    importer_type: "physical", min_vehicle_age: 3, max_vehicle_age: 5,
    min_engine_volume: 1801, max_engine_volume: 2300, formula: "eur_per_cc", rate: "2.7",
  }),
  r("duty-p-35-v3000", "duty", "Физлицо, 3–5 лет, 2300–3000 см³", {
    importer_type: "physical", min_vehicle_age: 3, max_vehicle_age: 5,
    min_engine_volume: 2301, max_engine_volume: 3000, formula: "eur_per_cc", rate: "2.7",
  }),
  r("duty-p-35-vmax", "duty", "Физлицо, 3–5 лет, свыше 3000 см³", {
    importer_type: "physical", min_vehicle_age: 3, max_vehicle_age: 5,
    min_engine_volume: 3001, formula: "eur_per_cc", rate: "3.6",
  }),

  // ---- старше 5 лет: фиксированная ставка €/см³ (выше, чем 3–5 лет) ----
  r("duty-p-5p-v1000", "duty", "Физлицо, старше 5 лет, до 1000 см³", {
    importer_type: "physical", min_vehicle_age: 6,
    max_engine_volume: 1000, formula: "eur_per_cc", rate: "3.0",
  }),
  r("duty-p-5p-v1500", "duty", "Физлицо, старше 5 лет, 1000–1500 см³", {
    importer_type: "physical", min_vehicle_age: 6,
    min_engine_volume: 1001, max_engine_volume: 1500, formula: "eur_per_cc", rate: "3.2",
  }),
  r("duty-p-5p-v1800", "duty", "Физлицо, старше 5 лет, 1500–1800 см³", {
    importer_type: "physical", min_vehicle_age: 6,
    min_engine_volume: 1501, max_engine_volume: 1800, formula: "eur_per_cc", rate: "3.5",
  }),
  r("duty-p-5p-v2300", "duty", "Физлицо, старше 5 лет, 1800–2300 см³", {
    importer_type: "physical", min_vehicle_age: 6,
    min_engine_volume: 1801, max_engine_volume: 2300, formula: "eur_per_cc", rate: "4.8",
  }),
  r("duty-p-5p-v3000", "duty", "Физлицо, старше 5 лет, 2300–3000 см³", {
    importer_type: "physical", min_vehicle_age: 6,
    min_engine_volume: 2301, max_engine_volume: 3000, formula: "eur_per_cc", rate: "5.0",
  }),
  r("duty-p-5p-vmax", "duty", "Физлицо, старше 5 лет, свыше 3000 см³", {
    importer_type: "physical", min_vehicle_age: 6,
    min_engine_volume: 3001, formula: "eur_per_cc", rate: "5.7",
  }),

  // ---- электромобиль — физлицо: единая пошлина 15% ----
  r("duty-p-ev", "duty", "Физлицо, электромобиль", {
    importer_type: "physical", engine_type: "electric", formula: "percent", rate: "15",
  }),

  // ================================================================
  // ПОШЛИНА ЮРЛИЦ — ЕТТ ЕАЭС, для легковых базовая ставка 15% от
  // таможенной стоимости (уточняйте код ТН ВЭД под конкретную модель —
  // возможны иные ставки/спецпошлины для отдельных позиций).
  // ================================================================
  r("duty-l-ice", "duty", "Юрлицо, ДВС/гибрид", {
    importer_type: "legal", formula: "percent", rate: "15",
  }),
  r("duty-l-ev", "duty", "Юрлицо, электромобиль", {
    importer_type: "legal", engine_type: "electric", formula: "percent", rate: "15",
  }),

  // ================================================================
  // ТАМОЖЕННЫЙ СБОР — Постановления Правительства РФ № 1637 (28.11.2024) и
  // № 1638 (23.10.2025), действует с 01.01.2026.
  // ================================================================
  r("fee-b1", "fee", "Сбор: до 200 000 ₽", { max_customs_value: "200000", formula: "fixed", fixed_amount: "1231" }),
  r("fee-b2", "fee", "Сбор: 200 000,01 – 450 000 ₽", { min_customs_value: "200000.01", max_customs_value: "450000", formula: "fixed", fixed_amount: "2462" }),
  r("fee-b3", "fee", "Сбор: 450 000,01 – 1 200 000 ₽", { min_customs_value: "450000.01", max_customs_value: "1200000", formula: "fixed", fixed_amount: "4924" }),
  r("fee-b4", "fee", "Сбор: 1 200 000,01 – 2 700 000 ₽", { min_customs_value: "1200000.01", max_customs_value: "2700000", formula: "fixed", fixed_amount: "13541" }),
  r("fee-b5", "fee", "Сбор: 2 700 000,01 – 4 200 000 ₽", { min_customs_value: "2700000.01", max_customs_value: "4200000", formula: "fixed", fixed_amount: "18465" }),
  r("fee-b6", "fee", "Сбор: 4 200 000,01 – 5 500 000 ₽", { min_customs_value: "4200000.01", max_customs_value: "5500000", formula: "fixed", fixed_amount: "21344" }),
  r("fee-b7", "fee", "Сбор: 5 500 000,01 – 10 000 000 ₽", { min_customs_value: "5500000.01", max_customs_value: "10000000", formula: "fixed", fixed_amount: "49240" }),
  r("fee-b8", "fee", "Сбор: свыше 10 000 000 ₽", { min_customs_value: "10000000.01", formula: "fixed", fixed_amount: "73860" }),

  // ================================================================
  // УТИЛЬСБОР — база 20 000 ₽ × коэффициент.
  // ================================================================
  r("rec-base", "recycling_base", "База утильсбора (легковое ТС)", { formula: "fixed", fixed_amount: "20000" }),

  // ---- Льгота физлиц (личное пользование): ДВС/гибрид ≤160 л.с. И ≤3000 см³.
  // Более узкие правила (заданы max_power + max_engine_volume) специфичнее
  // общего "rec-base"/"rec-comm-*" и потому выигрывают у них при подборе. ----
  r("rec-p-priv-u3", "recycling_base", "Физлицо, личное польз., ≤160 л.с. и ≤3000 см³, до 3 лет", {
    importer_type: "physical", min_vehicle_age: 0, max_vehicle_age: 2,
    max_power: 160, max_engine_volume: 3000, formula: "fixed", fixed_amount: "3400",
  }),
  r("rec-p-priv-u3-coeff", "recycling_coeff", "Физлицо, личное польз., ≤160 л.с. и ≤3000 см³, до 3 лет", {
    importer_type: "physical", min_vehicle_age: 0, max_vehicle_age: 2,
    max_power: 160, max_engine_volume: 3000, coefficient: "1",
  }),
  r("rec-p-priv-3p", "recycling_base", "Физлицо, личное польз., ≤160 л.с. и ≤3000 см³, старше 3 лет", {
    importer_type: "physical", min_vehicle_age: 3,
    max_power: 160, max_engine_volume: 3000, formula: "fixed", fixed_amount: "5200",
  }),
  r("rec-p-priv-3p-coeff", "recycling_coeff", "Физлицо, личное польз., ≤160 л.с. и ≤3000 см³, старше 3 лет", {
    importer_type: "physical", min_vehicle_age: 3,
    max_power: 160, max_engine_volume: 3000, coefficient: "1",
  }),
  // Электромобиль физлица для личного пользования — отдельная (обычно тоже
  // льготная) сетка; уточните текущий коэффициент перед запуском.
  r("rec-p-priv-ev", "recycling_coeff", "Физлицо, электромобиль, личное пользование ⚠️ ТРЕБУЕТ ПРОВЕРКИ", {
    importer_type: "physical", engine_type: "electric", coefficient: "0.17",
  }),

  // ---- ⚠️ ТРЕБУЕТ ПРОВЕРКИ: "коммерческая" сетка коэффициентов —
  // применяется к юрлицам, и к физлицам, не прошедшим льготный порог
  // (>160 л.с. или >3000 см³). Методика в активной реформе (изменения
  // декабрь 2025 / январь 2026 / анонс на апрель 2026 — удвоение для
  // объёма >3000 см³). Источники расходятся в точных значениях —
  // сверьте по актуальному тексту ПП РФ № 1291 перед реальными расчетами. ----
  r("rec-comm-u3-v1000", "recycling_coeff", "Коммерческая сетка, до 3 лет, до 1000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ", { min_vehicle_age: 0, max_vehicle_age: 2, max_engine_volume: 1000, coefficient: "4.06" }),
  r("rec-comm-u3-v2000", "recycling_coeff", "Коммерческая сетка, до 3 лет, 1000–2000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ", { min_vehicle_age: 0, max_vehicle_age: 2, min_engine_volume: 1001, max_engine_volume: 2000, coefficient: "13.22" }),
  r("rec-comm-u3-v3000", "recycling_coeff", "Коммерческая сетка, до 3 лет, 2000–3000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ", { min_vehicle_age: 0, max_vehicle_age: 2, min_engine_volume: 2001, max_engine_volume: 3000, coefficient: "35.28" }),
  r("rec-comm-u3-vmax", "recycling_coeff", "Коммерческая сетка, до 3 лет, свыше 3000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ (анонсировано удвоение с 04.2026)", { min_vehicle_age: 0, max_vehicle_age: 2, min_engine_volume: 3001, coefficient: "57.76" }),
  r("rec-comm-3p-v1000", "recycling_coeff", "Коммерческая сетка, старше 3 лет, до 1000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ", { min_vehicle_age: 3, max_engine_volume: 1000, coefficient: "6.67" }),
  r("rec-comm-3p-v2000", "recycling_coeff", "Коммерческая сетка, старше 3 лет, 1000–2000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ", { min_vehicle_age: 3, min_engine_volume: 1001, max_engine_volume: 2000, coefficient: "21.73" }),
  r("rec-comm-3p-v3000", "recycling_coeff", "Коммерческая сетка, старше 3 лет, 2000–3000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ", { min_vehicle_age: 3, min_engine_volume: 2001, max_engine_volume: 3000, coefficient: "58.06" }),
  r("rec-comm-3p-vmax", "recycling_coeff", "Коммерческая сетка, старше 3 лет, свыше 3000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ (анонсировано удвоение с 04.2026)", { min_vehicle_age: 3, min_engine_volume: 3001, coefficient: "94.68" }),

  // ================================================================
  // АКЦИЗ — юрлица, по мощности (руб./л.с.), ст. 193 НК РФ, ставки
  // проиндексированы Федеральным законом № 425-ФЗ от 28.11.2025 (на 2026 год).
  // Для физлиц не применяется (учтён в единой ставке пошлины), для
  // электромобилей не применяется (см. customsEngine.ts).
  // ================================================================
  r("exc-l-90", "excise", "Акциз: до 90 л.с. включительно (0 ₽/л.с.)", { importer_type: "legal", max_power: 90, formula: "fixed", fixed_amount: "0" }),
  r("exc-l-150", "excise", "Акциз: 90–150 л.с.", { importer_type: "legal", min_power: 90.01, max_power: 150, formula: "per_hp", rate: "70" }),
  r("exc-l-200", "excise", "Акциз: 150–200 л.с.", { importer_type: "legal", min_power: 150.01, max_power: 200, formula: "per_hp", rate: "664" }),
  r("exc-l-300", "excise", "Акциз: 200–300 л.с.", { importer_type: "legal", min_power: 200.01, max_power: 300, formula: "per_hp", rate: "1086" }),
  r("exc-l-400", "excise", "Акциз: 300–400 л.с.", { importer_type: "legal", min_power: 300.01, max_power: 400, formula: "per_hp", rate: "1850" }),
  r("exc-l-500", "excise", "Акциз: 400–500 л.с.", { importer_type: "legal", min_power: 400.01, max_power: 500, formula: "per_hp", rate: "1916" }),
  r("exc-l-max", "excise", "Акциз: свыше 500 л.с.", { importer_type: "legal", min_power: 500.01, formula: "per_hp", rate: "1978" }),

  // ================================================================
  // НДС — 20%, ст. 164 НК РФ (для юрлиц; физлица НДС отдельно не платят).
  // ================================================================
  r("vat-20", "vat", "НДС 20%", { formula: "percent", rate: "20" }),
];
