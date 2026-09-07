import type { CalculationInput } from "../../lib/types";
import { effectiveRate } from "../../lib/engine/customsEngine";
import { D, fmtRub, fmtCny, fmtRate } from "../../lib/money";
import { Field, MoneyInput, Switch, SectionTitle } from "../ui";
import { Receipt, FileText, AlertTriangle } from "lucide-react";

export default function StepPrice({
  input,
  update,
}: {
  input: CalculationInput;
  update: (p: Partial<CalculationInput>) => void;
}) {
  const base = D(input.cny_rate); // курс ВТБ
  const markupPct = D(input.cny_markup).div(100);
  const eff = effectiveRate(input.cny_rate, input.cny_markup);
  const priceRub = D(input.china_price_cny).times(base);
  const invoiceCny = input.price_equals_invoice ? input.china_price_cny : input.invoice_price_cny;
  const invoiceRub = D(invoiceCny).times(base);
  const markupCny = D(invoiceCny).times(markupPct);
  const totalCarCny = D(input.china_price_cny).plus(markupCny);
  const totalCarRub = totalCarCny.times(base);
  const invoiceDiffers =
    !input.price_equals_invoice &&
    D(input.invoice_price_cny).gt(0) &&
    !D(input.invoice_price_cny).equals(D(input.china_price_cny));
  const setChina = (p: Partial<CalculationInput["china_costs"]>) =>
    update({ china_costs: { ...input.china_costs, ...p } });

  const chinaTotal = D(input.china_costs.delivery_cny)
    .plus(input.china_costs.china_russia_cny)
    .plus(input.china_costs.seller_fee_cny)
    .plus(input.china_costs.other_cny);

  return (
    <div className="anim-fade-up">
      <SectionTitle sub="Укажите цену покупки. По умолчанию она совпадает со стоимостью по инвойсу для таможни. Все дополнительные поля необязательны.">
        2. Стоимость автомобиля в Китае
      </SectionTitle>

      <div className="card p-5 sm:p-6">
        <Field label="Цена автомобиля" suffix="CNY / ¥">
          <MoneyInput big value={input.china_price_cny} onChange={(v) => update({ china_price_cny: v })} suffix="¥" placeholder="3 000 000" />
        </Field>
        <div className="mt-2 flex items-center justify-between text-[12.5px] font-medium">
          <span className="text-ink-400">Эквивалент по курсу ВТБ (без надбавки)</span>
          <span className="tnum text-ink-100 font-bold">{priceRub.gt(0) ? `≈ ${fmtRub(priceRub)}` : "—"}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[12.5px] font-medium">
          <span className="text-ink-400">+ надбавка {input.cny_markup}% от инвойса</span>
          <span className="tnum text-gold-400 font-bold">
            {markupCny.gt(0) && base.gt(0) ? `+${fmtCny(markupCny)} · ${fmtRub(markupCny.times(base))}` : "—"}
          </span>
        </div>

        <div className="mt-5 pt-5 border-t border-ink-700">
          <Switch
            checked={input.price_equals_invoice}
            onChange={(v) => update({ price_equals_invoice: v })}
            label="Цена автомобиля совпадает с инвойсом"
          />
          {!input.price_equals_invoice && (
            <div className="mt-4 anim-fade-up">
              <Field label="Стоимость по инвойсу" hint="Именно инвойсная стоимость используется для расчета таможенных платежей" suffix="CNY / ¥">
                <MoneyInput value={input.invoice_price_cny} onChange={(v) => update({ invoice_price_cny: v })} suffix="¥" placeholder="2 850 000" />
              </Field>
              {invoiceDiffers && (
                <div className="flex items-start gap-2.5 rounded-xl border border-gold-700/40 bg-gold-900/20 p-3.5 mt-3.5">
                  <AlertTriangle size={16} className="text-gold-400 shrink-0 mt-0.5" />
                  <p className="text-[12.5px] text-gold-300 font-semibold leading-snug">
                    Стоимость по инвойсу отличается от цены автомобиля — таможенные платежи будут рассчитаны по инвойсу (
                    {fmtCny(input.invoice_price_cny)}).
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== Инвойс ===== */}
      <div className="card p-5 sm:p-6 mt-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-cny-500/60 to-transparent" />
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-9 h-9 rounded-[10px] bg-cny-500/10 border border-cny-500/25 flex items-center justify-center">
            <FileText size={17} className="text-cny-500" />
          </span>
          <div>
            <h3 className="font-display text-[15px] font-semibold text-ink-50">Инвойс</h3>
            <p className="text-[12px] text-ink-400 font-medium">База для расчета таможенной стоимости</p>
          </div>
        </div>
        <div className="divide-y divide-ink-700/70">
          <div className="flex items-baseline justify-between py-2.5">
            <span className="text-[13.5px] text-ink-300 font-medium">Стоимость автомобиля по инвойсу</span>
            <span className="tnum font-bold text-[14px] text-ink-50">{fmtCny(invoiceCny)}</span>
          </div>
          <div className="flex items-baseline justify-between py-2.5">
            <span className="text-[13.5px] text-ink-300 font-medium">
              Курс CNY <span className="text-ink-400 text-[11.5px]">({input.cny_rate_source})</span>
            </span>
            <span className="tnum font-bold text-[14px] text-ink-50">{base.gt(0) ? `1 ¥ = ${fmtRate(base)} ₽` : "курс не получен"}</span>
          </div>
          <div className="flex items-baseline justify-between py-2.5">
            <span className="text-[13.5px] text-ink-300 font-medium">
              Надбавка +{input.cny_markup}% от инвойса
            </span>
            <span className="tnum font-bold text-[14px] text-gold-400">
              {markupCny.gt(0) && base.gt(0) ? `+${fmtCny(markupCny)} · ${fmtRub(markupCny.times(base))}` : "—"}
            </span>
          </div>
          <div className="flex items-baseline justify-between py-2.5">
            <span className="text-[13.5px] text-ink-300 font-medium">
              Расчетный курс инвойса <span className="text-ink-400 text-[11.5px]">ВТБ × {D(1).plus(markupPct).toFixed(3)}</span>
            </span>
            <span className="tnum font-bold text-[14px] text-ink-50">{base.gt(0) ? `1 ¥ = ${fmtRate(eff)} ₽` : "—"}</span>
          </div>
          <div className="flex items-baseline justify-between py-2.5">
            <span className="text-[13.5px] text-ink-300 font-medium">Стоимость инвойса в рублях (база таможни)</span>
            <span className="tnum font-bold text-[14px] text-ink-50">{invoiceRub.gt(0) ? fmtRub(invoiceRub) : "—"}</span>
          </div>
          <div className="flex items-baseline justify-between py-3">
            <span className="font-display text-[13.5px] font-bold text-ink-100">Автомобиль с надбавкой</span>
            <span className="font-display tnum font-bold text-[17px] text-gold-400">
              {totalCarRub.gt(0) ? `${fmtCny(totalCarCny)} · ${fmtRub(totalCarRub)}` : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* ===== Расходы в Китае ===== */}
      <div className="card p-5 sm:p-6 mt-5">
        <div className="flex items-center gap-2.5 mb-5">
          <span className="w-9 h-9 rounded-[10px] bg-cny-500/10 border border-cny-500/25 flex items-center justify-center">
            <Receipt size={17} className="text-cny-500" />
          </span>
          <div>
            <h3 className="font-display text-[15px] font-semibold text-ink-50">Дополнительные расходы в Китае</h3>
            <p className="text-[12px] text-ink-400 font-medium">Доставка до склада, логистика до границы, комиссия продавца — заполните только то, что используется</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Field label="Доставка по Китаю" suffix="¥">
            <MoneyInput value={input.china_costs.delivery_cny} onChange={(v) => setChina({ delivery_cny: v })} suffix="¥" />
          </Field>
          <Field label="Доставка до России" suffix="¥" hint="Логистика Китай → РФ в юанях">
            <MoneyInput value={input.china_costs.china_russia_cny} onChange={(v) => setChina({ china_russia_cny: v })} suffix="¥" />
          </Field>
          <Field label="Комиссия продавца" suffix="¥">
            <MoneyInput value={input.china_costs.seller_fee_cny} onChange={(v) => setChina({ seller_fee_cny: v })} suffix="¥" />
          </Field>
          <Field label="Другие расходы" suffix="¥">
            <MoneyInput value={input.china_costs.other_cny} onChange={(v) => setChina({ other_cny: v })} suffix="¥" />
          </Field>
        </div>
        <div className="mt-3 flex items-baseline justify-between text-[12.5px] font-medium">
          <span className="text-ink-400">Суммарно в юанях → рубли по расчетному курсу</span>
          <span className="tnum font-bold text-ink-100">
            {fmtCny(chinaTotal)} {chinaTotal.gt(0) && eff.gt(0) ? `· ≈ ${fmtRub(chinaTotal.times(eff))}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
