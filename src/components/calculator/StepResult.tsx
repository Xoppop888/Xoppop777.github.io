import { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Save, FileDown, RotateCcw, TrendingUp, CheckCircle2 } from "lucide-react";
import type { CalculationInput, AppUser } from "../../lib/types";
import type { FullCalculation } from "../../lib/engine/customsEngine";
import { D, fmtRub, fmtCny, fmtRate, fmtDateTime } from "../../lib/money";
import { Button, Badge, Switch } from "../ui";
import PdfButton from "../PdfButton";
import { ENGINE_LABELS } from "../../lib/types";

const COLORS = ["#F2AE3C", "#E8574B", "#5AA9E6", "#37C987", "#D9932A", "#8B95A9"];

/** плавное «набегание» итоговой суммы */
function useCountUp(target: string): string {
  const [val, setVal] = useState("0");
  useEffect(() => {
    const t = D(target).toNumber();
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(String(Math.round(t * eased)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return val;
}

export default function StepResult({
  input,
  result,
  user,
  onSave,
  onNew,
  saving,
  saved,
}: {
  input: CalculationInput;
  result: FullCalculation;
  user: AppUser | null;
  onSave: () => void;
  onNew: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const [showZero, setShowZero] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const b = result.breakdown;
  const shownTotal = useCountUp(result.total_cost_rub);
  const upliftAbs = D(result.total_cost_rub).minus(result.car_cost_rub);

  const chart = useMemo(() => {
    const rows = [
      { name: "Автомобиль", value: D(result.car_cost_rub).plus(result.china_costs_rub) },
      { name: "Пошлина", value: D(b.customs_duty) },
      { name: "Утильсбор", value: D(b.recycling_fee) },
      { name: "Доставка", value: D(result.delivery_total_rub) },
      { name: "Брокер", value: D(result.broker_cost_rub) },
      { name: "Прочее", value: D(b.customs_fee).plus(b.excise).plus(b.vat).plus(result.other_costs_rub) },
    ].filter((r) => r.value.gt(0));
    return rows.map((r) => ({ ...r, value: r.value.toNumber() }));
  }, [result, b]);

  const tableRows = [
    { label: "Автомобиль в Китае", amount: result.car_base_rub, sub: fmtCny(input.china_price_cny) },
    { label: `Надбавка ${input.cny_markup}% от инвойса`, amount: result.invoice_markup_rub, sub: fmtCny(result.invoice_markup_cny) },
    { label: "Расходы в Китае", amount: result.china_costs_rub },
    { label: "Таможенная пошлина", amount: b.customs_duty },
    { label: "Таможенный сбор", amount: b.customs_fee },
    { label: "Утилизационный сбор", amount: b.recycling_fee },
    { label: "Акциз", amount: b.excise, note: b.excise_applied ? undefined : b.excise_reason },
    { label: "НДС", amount: b.vat, note: b.vat_applied ? undefined : b.vat_reason },
    { label: "Доставка", amount: result.delivery_total_rub },
    { label: "Брокер", amount: result.broker_cost_rub },
    { label: "Прочие расходы", amount: result.other_costs_rub },
  ];
  const visibleRows = showZero ? tableRows : tableRows.filter((r) => D(r.amount).gt(0));
  const hiddenCount = tableRows.length - visibleRows.length;

  const car = input.car;

  return (
    <div className="anim-fade-up">
      {/* ======== Главный экран ======== */}
      <div className="card relative overflow-hidden p-6 sm:p-8">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-gold-600 via-gold-400 to-transparent" />
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-8">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-gold-400">5. Результат</p>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-ink-50 mt-2">
              Конечная стоимость в России
            </h1>
            <p className="font-display text-[40px] sm:text-[54px] leading-tight font-bold text-gold-400 tnum mt-3 total-glow">
              {fmtRub(shownTotal)}
            </p>
            <div className="flex items-center gap-2.5 mt-2 flex-wrap">
              <Badge tone="gold">Предварительный расчет</Badge>
              <Badge tone="neutral">правила: {b.rule_version}</Badge>
              <span className="text-[11.5px] text-ink-400 font-medium">{fmtDateTime(new Date().toISOString())}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-7">
              <div className="rounded-xl border border-ink-700 bg-ink-800/60 p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">Цена в Китае</p>
                <p className="font-display text-lg font-bold text-ink-50 tnum mt-1">{fmtCny(input.china_price_cny)}</p>
                <p className="text-[12px] text-ink-300 font-medium tnum">≈ {fmtRub(result.car_cost_rub)}</p>
              </div>
              <div className="rounded-xl border border-gold-700/40 bg-gold-900/20 p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gold-400/80">Удорожание</p>
                <p className="font-display text-lg font-bold text-gold-400 tnum mt-1 flex items-center gap-1.5">
                  <TrendingUp size={17} /> +{fmtRate(result.uplift_percent)}%
                </p>
                <p className="text-[12px] text-ink-300 font-medium tnum">
                  удорожание +{fmtRub(upliftAbs)} к цене в Китае
                </p>
              </div>
            </div>
          </div>

          {/* карточка автомобиля */}
          <div className="rounded-2xl border border-ink-700 bg-ink-800/50 overflow-hidden">
            {input.image_data ? (
              <img src={input.image_data} alt="Шильдик" className="w-full h-36 object-cover opacity-90" />
            ) : (
              <div className="w-full h-36 bg-ink-750 flex items-center justify-center">
                <span className="font-display text-3xl font-bold text-ink-600">
                  {(car.brand || "AUTO").slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <div className="p-4.5">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-gold-400">Ваш автомобиль</p>
              <p className="font-display text-xl font-bold text-ink-50 mt-1">
                {car.brand} {car.model}
              </p>
              <p className="text-[13px] text-ink-300 font-medium mt-1.5">
                {[
                  car.production_year ? String(car.production_year) : null,
                  car.engine_volume_cc ? `${(car.engine_volume_cc / 1000).toFixed(1)} л` : null,
                  car.power_hp ? `${car.power_hp} л.с.` : null,
                  ENGINE_LABELS[car.engine_type],
                ]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
            </div>
          </div>
        </div>

        {/* категории */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-7">
          {[
            { l: "Таможня", v: D(b.customs_duty).plus(b.customs_fee).plus(b.excise).plus(b.vat) },
            { l: "Утильсбор", v: D(b.recycling_fee) },
            { l: "Доставка", v: D(result.delivery_total_rub) },
            { l: "Брокер", v: D(result.broker_cost_rub) },
            { l: "Прочие", v: D(result.china_costs_rub).plus(result.other_costs_rub) },
          ].map((t) => (
            <div key={t.l} className="rounded-xl border border-ink-700 bg-ink-800/60 px-3.5 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">{t.l}</p>
              <p className="font-display text-[15px] font-bold text-ink-50 tnum mt-1">{fmtRub(t.v)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-5 mt-5">
        {/* ======== Детализация ======== */}
        <div className="card p-5 sm:p-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h3 className="font-display text-[15px] font-semibold text-ink-50">Детализация</h3>
            <Switch checked={showZero} onChange={setShowZero} label={`Нулевые строки${hiddenCount ? ` (${hiddenCount})` : ""}`} />
          </div>
          <div className="divide-y divide-ink-700/70">
            {visibleRows.map((r) => (
              <div key={r.label} className="py-2.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[13.5px] text-ink-200 font-medium">
                    {r.label}
                    {r.sub && <span className="text-ink-400 text-[12px] ml-2">{r.sub}</span>}
                  </span>
                  <span className={`tnum font-bold text-[14px] ${D(r.amount).isZero() ? "text-ink-500" : "text-ink-50"}`}>
                    {D(r.amount).isZero() ? "0 ₽" : fmtRub(r.amount)}
                  </span>
                </div>
                {r.note && <p className="text-[11.5px] text-ink-400 mt-0.5">{r.note}</p>}
              </div>
            ))}
            <div className="py-3.5 flex items-baseline justify-between gap-4">
              <span className="font-display text-[14px] font-bold text-ink-50">Итого</span>
              <span className="font-display text-[20px] font-bold text-gold-400 tnum">{fmtRub(result.total_cost_rub)}</span>
            </div>
          </div>
        </div>

        {/* ======== Диаграмма ======== */}
        <div className="card p-5 sm:p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink-50 mb-2">Структура стоимости</h3>
          <div className="h-[240px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chart}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={92}
                  paddingAngle={3}
                  strokeWidth={0}
                  onMouseEnter={(_, i) => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                >
                  {chart.map((_, i) => (
                    <Cell
                      key={i}
                      fill={COLORS[i % COLORS.length]}
                      opacity={active === null || active === i ? 1 : 0.35}
                      style={{ transition: "opacity .2s", cursor: "pointer" }}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active: a, payload }) =>
                    a && payload?.length ? (
                      <div className="card px-3.5 py-2.5 shadow-2xl">
                        <p className="text-[12px] font-bold text-ink-300">{payload[0].name}</p>
                        <p className="font-display text-[15px] font-bold text-ink-50 tnum">{fmtRub(payload[0].value as number)}</p>
                        <p className="text-[11px] text-ink-400 tnum">
                          {fmtRate(D(payload[0].value as number).div(D(result.total_cost_rub)).times(100))}% от итога
                        </p>
                      </div>
                    ) : null
                  }
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-bold uppercase tracking-widest text-ink-400">Итого</span>
              <span className="font-display text-[17px] font-bold text-ink-50 tnum">{fmtRub(result.total_cost_rub)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
            {chart.map((c, i) => (
              <button
                key={c.name}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                className={`flex items-center gap-2 text-left cursor-pointer ${active === null || active === i ? "" : "opacity-40"}`}
              >
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-[12px] font-semibold text-ink-300">{c.name}</span>
                <span className="text-[12px] font-bold text-ink-100 tnum ml-auto">{fmtRub(c.value)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ======== Действия ======== */}
      <div className="card p-5 sm:p-6 mt-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <Button size="lg" onClick={onSave} disabled={saving} className="sm:w-auto flex-1">
          {saved ? (
            <>
              <CheckCircle2 size={18} className="text-ink-950" /> Расчет сохранен
            </>
          ) : saving ? (
            "Сохраняем..."
          ) : (
            <>
              <Save size={18} /> Сохранить расчет
            </>
          )}
        </Button>
        <div className="flex-1">
          <PdfButton input={input} result={result} />
        </div>
        <Button size="lg" variant="ghost" onClick={onNew} className="sm:w-auto">
          <RotateCcw size={17} /> Новый расчет
        </Button>
        {!user && (
          <p className="text-[12px] text-ink-400 font-medium sm:ml-2 sm:max-w-[170px]">
            Для сохранения потребуется войти в аккаунт
          </p>
        )}
      </div>

      <div className="mt-5 rounded-xl border border-ink-700 bg-ink-850/70 p-4.5 flex flex-col sm:flex-row gap-2.5 sm:items-center sm:justify-between">
        <p className="text-[12px] text-ink-400 leading-relaxed max-w-3xl">
          Расчет является предварительным. Итоговые таможенные платежи могут зависеть от документов, таможенной
          стоимости, характеристик автомобиля, курса валют и действующего законодательства.
        </p>
        <span className="text-[11.5px] text-ink-300 font-bold whitespace-nowrap">
          Дата актуальности: {new Date().toLocaleDateString("ru-RU")}
        </span>
      </div>
    </div>
  );
}
