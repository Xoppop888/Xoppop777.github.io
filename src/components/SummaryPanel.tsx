import type { CalculationInput } from "../lib/types";
import type { FullCalculation } from "../lib/engine/customsEngine";
import { D, fmtRub, fmtCny, fmtRate } from "../lib/money";
import { AlertCircle } from "lucide-react";

function Row({ label, value, dim, bold }: { label: string; value: string; dim?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[7px]">
      <span className={`text-[13px] ${dim ? "text-ink-400" : "text-ink-300"} font-medium`}>{label}</span>
      <span className={`tnum text-[13.5px] font-bold ${bold ? "text-ink-50 text-[15px]" : "text-ink-100"}`}>{value}</span>
    </div>
  );
}

export default function SummaryPanel({
  input,
  result,
  missing,
}: {
  input: CalculationInput;
  result: FullCalculation | null;
  missing: string[];
}) {
  const hasCar = Boolean(input.car.brand || input.car.model);
  const hasPrice = D(input.china_price_cny).gt(0);
  const hasRates = D(input.cny_rate).gt(0) && D(input.eur_rate).gt(0);

  return (
    <div className="card p-5 lg:sticky lg:top-24">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-[15px] font-semibold text-ink-50">Предварительный расчет</h3>
        <span className="flex gap-1.5">
          {[hasCar, hasPrice && hasRates, Boolean(result)].map((ok, i) => (
            <span key={i} className={`w-2 h-2 rounded-full ${ok ? "bg-ok-500" : "bg-ink-600"}`} />
          ))}
        </span>
      </div>

      {/* автомобиль */}
      <div className="rounded-xl border border-ink-700 bg-ink-800/60 p-3.5 mb-4">
        {hasCar ? (
          <>
            <p className="font-display font-semibold text-[15px] text-ink-50">
              {input.car.brand} {input.car.model}
            </p>
            <p className="text-[12px] text-ink-300 mt-1 font-medium">
              {[
                input.car.production_year ? String(input.car.production_year) : null,
                input.car.engine_volume_cc ? `${(input.car.engine_volume_cc / 1000).toFixed(1)} л` : null,
                input.car.power_hp ? `${input.car.power_hp} л.с.` : null,
              ]
                .filter(Boolean)
                .join(" • ") || "характеристики уточняются"}
            </p>
          </>
        ) : (
          <>
            <div className="skeleton h-4 w-32 mb-2" />
            <div className="skeleton h-3 w-44" />
          </>
        )}
      </div>

      {!result ? (
        <div className="space-y-2.5">
          {["Цена в Китае", "Пошлина", "Утильсбор", "Доставка", "Итого"].map((l) => (
            <div key={l} className="flex items-center justify-between">
              <span className="text-[13px] text-ink-400 font-medium">{l}</span>
              <div className="skeleton h-3.5 w-20" />
            </div>
          ))}
          {missing.length > 0 && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-gold-700/40 bg-gold-900/25 p-3">
              <AlertCircle size={16} className="text-gold-400 shrink-0 mt-0.5" />
              <p className="text-[12.5px] text-gold-300 font-medium leading-snug">
                Для расчета необходимо указать: {missing.join(", ")}.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="divide-y divide-ink-700/70">
          <Row label={`Автомобиль · ${fmtCny(input.china_price_cny)}`} value={fmtRub(result.car_base_rub)} />
          {D(result.invoice_markup_rub).gt(0) && (
            <Row label={`Надбавка ${input.cny_markup}% от инвойса`} value={`+${fmtRub(result.invoice_markup_rub)}`} dim />
          )}
          {D(result.china_costs_rub).gt(0) && <Row label="Расходы в Китае" value={fmtRub(result.china_costs_rub)} dim />}
          <Row label="Таможенная пошлина" value={fmtRub(result.breakdown.customs_duty)} />
          <Row label="Таможенный сбор" value={fmtRub(result.breakdown.customs_fee)} dim />
          <Row label="Утилизационный сбор" value={fmtRub(result.breakdown.recycling_fee)} />
          {result.breakdown.excise_applied && <Row label="Акциз" value={fmtRub(result.breakdown.excise)} dim />}
          {result.breakdown.vat_applied && <Row label="НДС" value={fmtRub(result.breakdown.vat)} dim />}
          <Row label="Доставка" value={fmtRub(result.delivery_total_rub)} />
          <Row label="Брокер" value={fmtRub(result.broker_cost_rub)} dim />
          {D(result.other_costs_rub).gt(0) && <Row label="Прочие расходы" value={fmtRub(result.other_costs_rub)} dim />}
          <div className="pt-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-bold uppercase tracking-wider text-ink-300">Итого в РФ</span>
              <span className="font-display text-[22px] font-bold text-gold-400 tnum">{fmtRub(result.total_cost_rub)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 mt-1">
              <span className="text-[12px] text-ink-400 font-medium">Удорожание</span>
              <span className="text-[13px] font-bold text-danger-400 tnum">+{fmtRate(result.uplift_percent)}%</span>
            </div>
          </div>
          <p className="pt-3 text-[11px] text-ink-400 leading-relaxed">
            Курс ВТБ: {fmtRate(input.cny_rate)} ₽ ({input.cny_rate_source}) + {input.cny_markup}% от инвойса · EUR:{" "}
            {fmtRate(input.eur_rate)} ₽ ({input.eur_rate_source}) · правила: {result.breakdown.rule_version}
          </p>
        </div>
      )}
    </div>
  );
}
