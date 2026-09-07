import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Landmark, Truck, Percent, Coins, FilePlus2, FlaskConical } from "lucide-react";
import { db } from "../lib/db";
import type { CalculationSnapshot } from "../lib/types";
import type { FullCalculation } from "../lib/engine/customsEngine";
import { ENGINE_LABELS, DRIVE_LABELS, IMPORTER_LABELS, VEHICLE_LABELS } from "../lib/types";
import { fmtRub, fmtRub2, fmtCny, fmtRate, fmtDate, fmtDateTime, D } from "../lib/money";
import { Skeleton, Badge } from "../components/ui";
import PdfButton from "../components/PdfButton";

const toFull = (c: CalculationSnapshot): FullCalculation => ({
  breakdown: c.breakdown,
  invoice_markup_cny: c.invoice_markup_rub ? (c.invoice_markup_cny ?? "0") : "0",
  invoice_markup_rub: c.invoice_markup_rub ?? "0",
  car_base_rub: c.car_base_rub ?? c.car_cost_rub,
  car_cost_rub: c.car_cost_rub,
  china_costs_rub: c.china_costs_rub,
  delivery_total_rub: c.delivery_total_rub,
  broker_cost_rub: c.broker_cost_rub,
  other_costs_rub: c.other_costs_rub,
  total_cost_rub: c.total_cost_rub,
  uplift_percent: c.uplift_percent,
});

function InfoRow({ k, v, note }: { k: string; v: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-ink-700/60 last:border-0">
      <div>
        <span className="text-[13px] text-ink-300 font-medium">{k}</span>
        {note && <p className="text-[11px] text-ink-400 mt-0.5">{note}</p>}
      </div>
      <span className="text-[13.5px] font-bold text-ink-50 tnum text-right">{v}</span>
    </div>
  );
}

export default function CalculationDetailPage() {
  const { id } = useParams();
  const [calc, setCalc] = useState<CalculationSnapshot | null | "loading">("loading");

  useEffect(() => {
    if (!id) return;
    void db.getCalculation(id).then((c) => setCalc(c));
  }, [id]);

  if (calc === "loading") {
    return (
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-12 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!calc) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <p className="font-display text-xl font-bold text-ink-50">Расчет не найден</p>
        <p className="text-[13.5px] text-ink-300 mt-2">Возможно, он был удален или принадлежит другому пользователю.</p>
        <Link to="/calculations">
          <span className="inline-flex items-center gap-2 text-gold-400 font-semibold text-sm mt-5">
            <ArrowLeft size={16} /> К списку расчетов
          </span>
        </Link>
      </div>
    );
  }

  const car = calc.input.car;
  const b = calc.breakdown;
  const effRate = D(calc.input.cny_rate).times(1).plus(D(calc.input.cny_rate).times(D(calc.input.cny_markup).div(100)));

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-10">
      <Link to="/calculations" className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-300 hover:text-gold-400 transition-colors">
        <ArrowLeft size={15} /> Мои расчеты
      </Link>

      {/* заголовок */}
      <div className="card relative overflow-hidden p-6 sm:p-8 mt-5">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-gold-600 via-gold-400 to-transparent" />
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <Badge tone="gold">Snapshot · без пересчета</Badge>
              <span className="flex items-center gap-1.5 text-[12px] text-ink-400 font-medium">
                <CalendarDays size={13} /> {fmtDateTime(calc.created_at)}
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-50 mt-3">
              {car.brand} {car.model} {car.modification}
            </h1>
            <p className="text-[13.5px] text-ink-300 font-medium mt-2">
              {[
                car.production_year ? String(car.production_year) : null,
                car.engine_volume_cc ? `${car.engine_volume_cc} см³` : "электро",
                car.power_hp ? `${car.power_hp} л.с.` : null,
                ENGINE_LABELS[car.engine_type],
                DRIVE_LABELS[car.drive_type],
                IMPORTER_LABELS[car.importer_type],
              ].filter(Boolean).join(" • ")}
            </p>
            <p className="font-display text-[34px] sm:text-[42px] font-bold text-gold-400 tnum mt-4">{fmtRub(calc.total_cost_rub)}</p>
            <p className="text-[13px] text-danger-400 font-bold tnum">удорожание +{fmtRate(calc.uplift_percent)}% · версия правил {calc.rule_version}</p>
          </div>
          {calc.input.image_data && (
            <img src={calc.input.image_data} alt="Шильдик" className="w-full md:w-60 rounded-xl border border-ink-700 object-cover" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
        {/* исходные данные */}
        <div className="card p-5 sm:p-6">
          <h3 className="font-display text-[14px] font-semibold text-ink-50 mb-3">Исходные данные</h3>
          <InfoRow k="Цена в Китае" v={`${fmtCny(calc.input.china_price_cny)} · ${fmtRub(calc.car_cost_rub)}`} />
          <InfoRow
            k="Инвойс"
            v={fmtCny(calc.input.price_equals_invoice ? calc.input.china_price_cny : calc.input.invoice_price_cny)}
            note={calc.input.price_equals_invoice ? "совпадает с ценой" : "отдельный инвойс"}
          />
          <InfoRow k="VIN" v={car.vin || "—"} />
          <InfoRow k="Тип ТС" v={VEHICLE_LABELS[car.vehicle_type]} />
          <InfoRow k="Топливо / КПП" v={`${car.fuel_type} / ${car.transmission}`} />
          {calc.input.expenses.length > 0 && (
            <InfoRow
              k="Доп. расходы"
              v={calc.input.expenses.map((e) => e.name || "Без названия").join(", ")}
              note={`${calc.input.expenses.length} поз.`}
            />
          )}
        </div>

        {/* курсы на дату расчета */}
        <div className="card p-5 sm:p-6">
          <h3 className="font-display text-[14px] font-semibold text-ink-50 mb-3">Курсы на дату расчета</h3>
          <InfoRow
            k="Курс CNY (ВТБ)"
            v={`1 CNY = ${fmtRate(calc.input.cny_rate)} ₽`}
            note={`источник: ${calc.input.cny_rate_source} · ${fmtDateTime(calc.input.cny_fetched_at)}`}
          />
          <InfoRow
            k={`Надбавка ${calc.input.cny_markup}% от инвойса`}
            v={calc.invoice_markup_rub ? `+${fmtRub(calc.invoice_markup_rub)}` : "включена в стоимость"}
            note={`расчетный курс инвойса: 1 CNY = ${fmtRate(effRate)} ₽`}
          />
          <InfoRow
            k="Курс EUR"
            v={`1 EUR = ${fmtRate(calc.input.eur_rate)} ₽`}
            note={`источник: ${calc.input.eur_rate_source} · ${fmtDate(calc.input.eur_fetched_at)}`}
          />
          <InfoRow k="Таможенная стоимость" v={fmtRub2(b.customs_value_rub)} />
        </div>
      </div>

      {/* примененные правила */}
      <div className="card p-5 sm:p-6 mt-5">
        <h3 className="font-display text-[14px] font-semibold text-ink-50 mb-4">Примененные тарифы (snapshot)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {b.applied_rules.map((r, i) => {
            const icons = { duty: <Percent size={15} />, fee: <FilePlus2 size={15} />, recycling_coeff: <Coins size={15} />, excise: <FlaskConical size={15} />, vat: <Landmark size={15} />, recycling_base: <Coins size={15} /> };
            return (
              <div key={i} className="rounded-xl border border-ink-700 bg-ink-800/60 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-[12.5px] font-bold text-ink-100">
                    <span className="text-gold-400">{icons[r.kind]}</span> {r.name}
                  </span>
                  <span className="tnum font-bold text-[13px] text-ink-50">{fmtRub(r.amount_rub)}</span>
                </div>
                <p className="text-[11.5px] text-ink-400 mt-1.5 font-medium">
                  {r.formula_text} · v{r.version}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* детализация */}
      <div className="card p-5 sm:p-6 mt-5">
        <h3 className="font-display text-[14px] font-semibold text-ink-50 mb-3">Детализация</h3>
        {[
          ["Автомобиль в Китае", calc.car_base_rub ?? calc.car_cost_rub],
          ...(calc.invoice_markup_rub !== undefined
            ? ([["Надбавка " + calc.input.cny_markup + "% от инвойса", calc.invoice_markup_rub]] as [string, string | null][])
            : []),
          ["Расходы в Китае", calc.china_costs_rub],
          ["Таможенная пошлина", b.customs_duty],
          ["Таможенный сбор", b.customs_fee],
          ["Утилизационный сбор", b.recycling_fee],
          ["Акциз", b.excise_applied ? b.excise : null],
          ["НДС", b.vat_applied ? b.vat : null],
          ["Доставка", calc.delivery_total_rub],
          ["Брокер", calc.broker_cost_rub],
          ["Прочие расходы", calc.other_costs_rub],
        ].map(([label, amount]) => {
          const l = label as string;
          const a = amount as string | null;
          const isNa = a === null;
          const zero = !isNa && D(a).isZero();
          if (zero && isNa) return null;
          return (
            <InfoRow
              key={l}
              k={l}
              v={isNa ? <Badge tone="neutral">Не применяется</Badge> : fmtRub2(a as string)}
            />
          );
        })}
        <div className="flex items-baseline justify-between pt-3.5 mt-2 border-t-2 border-ink-600">
          <span className="font-display text-[15px] font-bold text-ink-50">Итого</span>
          <span className="font-display text-[24px] font-bold text-gold-400 tnum">{fmtRub(calc.total_cost_rub)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 mt-5 items-center">
        <PdfButton input={calc.input} result={toFull(calc)} />
        <div className="flex items-center gap-4 text-[12px] text-ink-400 font-medium">
          <span className="flex items-center gap-1.5"><Truck size={13} /> доставка {fmtRub(calc.delivery_total_rub)}</span>
          <span className="flex items-center gap-1.5"><Landmark size={13} /> брокер {fmtRub(calc.broker_cost_rub)}</span>
        </div>
      </div>
    </div>
  );
}
