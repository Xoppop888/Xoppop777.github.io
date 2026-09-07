import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { History, ArrowRight, Plus, LogIn, GitCompareArrows, X } from "lucide-react";
import { useApp } from "../state/AppContext";
import { db } from "../lib/db";
import type { CalculationSnapshot } from "../lib/types";
import { fmtRub, fmtCny, fmtRate, fmtDateTime, D } from "../lib/money";
import { Button, Skeleton, Badge } from "../components/ui";

const extrasOf = (c: CalculationSnapshot) =>
  D(c.china_costs_rub).plus(c.delivery_total_rub).plus(c.broker_cost_rub).plus(c.other_costs_rub);

export default function CalculationsPage() {
  const { user, authReady } = useApp();
  const navigate = useNavigate();
  const [list, setList] = useState<CalculationSnapshot[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!authReady) return;
    void db.listCalculations(user?.id ?? null).then(setList);
  }, [user, authReady]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 3 ? [...s.slice(1), id] : [...s, id]));

  if (!authReady || (user && list === null)) {
    return (
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-12 space-y-4">
        <Skeleton className="h-9 w-64" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <LogIn size={30} className="text-ink-500 mx-auto mb-4" />
        <h1 className="font-display text-xl font-bold text-ink-50">Мои расчеты</h1>
        <p className="text-[13.5px] text-ink-300 mt-2">
          Войдите в аккаунт, чтобы видеть историю расчетов. Каждый расчет сохраняется ровно в том виде, в котором был создан.
        </p>
        <Link to="/login">
          <Button className="mt-6">Войти</Button>
        </Link>
      </div>
    );
  }

  const compared = selected
    .map((id) => list?.find((c) => c.id === id))
    .filter((c): c is CalculationSnapshot => Boolean(c));

  return (
    <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-7">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-gold-400">История</p>
          <h1 className="font-display text-2xl font-bold text-ink-50 mt-1.5">Мои расчеты</h1>
        </div>
        <div className="flex items-center gap-3">
          {selected.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              <X size={14} /> Сбросить выбор
            </Button>
          )}
          <Link to="/calculator">
            <Button>
              <Plus size={16} /> Новый расчет
            </Button>
          </Link>
        </div>
      </div>

      {/* ===== Сравнение вариантов ===== */}
      {compared.length >= 2 && (
        <div className="card p-5 sm:p-6 mb-6 anim-fade-up relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-eur-500/70 via-gold-500/70 to-transparent" />
          <div className="flex items-center gap-2.5 mb-4">
            <GitCompareArrows size={17} className="text-gold-400" />
            <h3 className="font-display text-[15px] font-semibold text-ink-50">Сравнение вариантов</h3>
            <span className="text-[12px] text-ink-400 font-medium">выбрано {compared.length} из 3</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-ink-700">
                  <th className="text-left py-2.5 pr-4 text-[11px] font-bold uppercase tracking-wider text-ink-400">Показатель</th>
                  {compared.map((c) => (
                    <th key={c.id} className="text-right py-2.5 px-3">
                      <span className="font-display text-[13px] font-bold text-ink-50">
                        {c.input.car.brand} {c.input.car.model}
                      </span>
                      <span className="block text-[10.5px] text-ink-400 font-medium">
                        {c.input.car.production_year} • {c.input.car.power_hp} л.с. • {fmtDateTime(c.created_at)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {(
                  [
                    ["Цена в Китае", (c: CalculationSnapshot) => fmtCny(c.input.china_price_cny)],
                    ["Таможня", (c: CalculationSnapshot) => fmtRub(c.breakdown.total_customs)],
                    ["Доп. расходы и доставка", (c: CalculationSnapshot) => fmtRub(extrasOf(c))],
                    ["Удорожание", (c: CalculationSnapshot) => `+${fmtRate(c.uplift_percent)}%`],
                  ] as [string, (c: CalculationSnapshot) => string][]
                ).map(([label, fn]) => (
                  <tr key={label}>
                    <td className="py-2.5 pr-4 text-[13px] text-ink-300 font-medium">{label}</td>
                    {compared.map((c) => (
                      <td key={c.id} className="py-2.5 px-3 text-right tnum text-[13.5px] font-bold text-ink-100">
                        {fn(c)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-ink-800/50">
                  <td className="py-3 pr-4 font-display text-[13px] font-bold text-ink-50">Итоговая стоимость</td>
                  {compared.map((c) => {
                    const min = compared.reduce((m, x) => (D(x.total_cost_rub).lt(m) ? D(x.total_cost_rub) : m), D(compared[0].total_cost_rub));
                    const best = D(c.total_cost_rub).equals(min);
                    return (
                      <td key={c.id} className="py-3 px-3 text-right">
                        <span className={`font-display tnum text-[15px] font-bold ${best ? "text-ok-400" : "text-gold-400"}`}>
                          {fmtRub(c.total_cost_rub)}
                        </span>
                        {best && compared.length > 1 && (
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-ok-400/80">выгоднее</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!list || list.length === 0 ? (
        <div className="card p-12 text-center">
          <History size={30} className="text-ink-500 mx-auto mb-4" />
          <p className="font-display text-[16px] font-semibold text-ink-100">Сохраненных расчетов пока нет</p>
          <p className="text-[13.5px] text-ink-300 mt-2 max-w-sm mx-auto">
            Сделайте первый расчет и нажмите «Сохранить расчет» — он появится здесь вместе с курсами и тарифами на дату расчета.
          </p>
          <Link to="/calculator">
            <Button className="mt-6">
              Рассчитать автомобиль <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <p className="hidden md:block text-[12px] text-ink-400 font-medium mb-3">
            Отметьте 2–3 варианта, чтобы сравнить их между собой.
          </p>

          {/* desktop table */}
          <div className="hidden md:block card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-700 text-left">
                  {["", "Автомобиль", "Цена в Китае", "Таможня", "Доп. расходы", "Итог в России", "Удорожание", "Дата", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-ink-400 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/calculations/${c.id}`)}
                    className="border-b border-ink-700/60 last:border-0 hover:bg-ink-800/70 transition-colors cursor-pointer"
                  >
                    <td className="pl-4 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => toggle(c.id)}
                        aria-label="Выбрать для сравнения"
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors cursor-pointer ${
                          selected.includes(c.id) ? "bg-gold-500 border-gold-500" : "border-ink-500 hover:border-gold-500"
                        }`}
                      >
                        {selected.includes(c.id) && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0b0d11" strokeWidth="4">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-display text-[14px] font-bold text-ink-50">
                        {c.input.car.brand} {c.input.car.model}
                      </p>
                      <p className="text-[12px] text-ink-400 font-medium mt-0.5">
                        {c.input.car.production_year} • {c.input.car.engine_volume_cc ? `${(c.input.car.engine_volume_cc / 1000).toFixed(1)} л` : "EV"} •{" "}
                        {c.input.car.power_hp} л.с.
                      </p>
                    </td>
                    <td className="px-4 py-4 tnum font-bold text-[13.5px] text-ink-100 whitespace-nowrap">{fmtCny(c.input.china_price_cny)}</td>
                    <td className="px-4 py-4 tnum font-bold text-[13.5px] text-ink-100 whitespace-nowrap">{fmtRub(c.breakdown.total_customs)}</td>
                    <td className="px-4 py-4 tnum font-bold text-[13.5px] text-ink-300 whitespace-nowrap">{fmtRub(extrasOf(c))}</td>
                    <td className="px-4 py-4 tnum font-display font-bold text-[15px] text-gold-400 whitespace-nowrap">{fmtRub(c.total_cost_rub)}</td>
                    <td className="px-4 py-4">
                      <Badge tone={D(c.uplift_percent).gt(0) ? "danger" : "neutral"}>+{fmtRate(c.uplift_percent)}%</Badge>
                    </td>
                    <td className="px-4 py-4 text-[12.5px] text-ink-300 font-medium tnum whitespace-nowrap">{fmtDateTime(c.created_at)}</td>
                    <td className="px-4 py-4">
                      <Button size="sm" variant="outline">Открыть</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile cards */}
          <div className="md:hidden space-y-3">
            {list.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/calculations/${c.id}`)}
                className="card card-hover w-full p-4.5 text-left cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-[15px] font-bold text-ink-50">
                      {c.input.car.brand} {c.input.car.model}
                    </p>
                    <p className="text-[12px] text-ink-400 font-medium mt-0.5">
                      {c.input.car.production_year} • {c.input.car.engine_volume_cc ? `${(c.input.car.engine_volume_cc / 1000).toFixed(1)} л` : "EV"} •{" "}
                      {c.input.car.power_hp} л.с.
                    </p>
                  </div>
                  <Badge tone="danger">+{fmtRate(c.uplift_percent)}%</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3.5 text-[12px] font-semibold">
                  <span className="text-ink-400">Таможня <span className="tnum text-ink-100 block">{fmtRub(c.breakdown.total_customs)}</span></span>
                  <span className="text-ink-400 text-right">Доп. расходы <span className="tnum text-ink-100 block">{fmtRub(extrasOf(c))}</span></span>
                </div>
                <div className="flex items-baseline justify-between mt-3">
                  <span className="tnum text-[13px] font-bold text-ink-300">{fmtCny(c.input.china_price_cny)}</span>
                  <span className="font-display text-[17px] font-bold text-gold-400 tnum">{fmtRub(c.total_cost_rub)}</span>
                </div>
                <p className="text-[11.5px] text-ink-400 font-medium mt-2 tnum">{fmtDateTime(c.created_at)}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
