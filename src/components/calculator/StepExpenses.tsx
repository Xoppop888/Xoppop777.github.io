import { useEffect, useState } from "react";
import { Plus, Trash2, Landmark, Truck, FilePlus2, Percent, Coins } from "lucide-react";
import type { CalculationInput, ExpenseItem, ExpenseType, Currency } from "../../lib/types";
import type { FullCalculation } from "../../lib/engine/customsEngine";
import { db } from "../../lib/db";
import { D, fmtRub, fmtRub2 } from "../../lib/money";
import { effectiveRate } from "../../lib/engine/customsEngine";
import { Button, Field, MoneyInput, SelectInput, TextInput, SectionTitle, Badge } from "../ui";

const uid = () => `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function CustomsCard({
  title,
  icon,
  children,
  amount,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  amount: string;
}) {
  return (
    <div className="card p-4.5 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-[9px] bg-ink-750 border border-ink-600 flex items-center justify-center text-gold-400">{icon}</span>
          <h4 className="font-display text-[13.5px] font-semibold text-ink-50">{title}</h4>
        </div>
        <span className="font-display text-[15px] font-bold text-ink-50 tnum whitespace-nowrap">{fmtRub(amount)}</span>
      </div>
      <div className="space-y-1.5 text-[12.5px]">{children}</div>
    </div>
  );
}

const kv = (k: string, v: React.ReactNode) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-ink-400 font-medium">{k}</span>
    <span className="text-ink-100 font-semibold tnum text-right">{v}</span>
  </div>
);

export default function StepExpenses({
  input,
  update,
  result,
}: {
  input: CalculationInput;
  update: (p: Partial<CalculationInput>) => void;
  result: FullCalculation | null;
}) {
  const [types, setTypes] = useState<ExpenseType[]>([]);
  useEffect(() => {
    void db.listExpenseTypes().then(setTypes);
  }, []);

  const b = result?.breakdown;
  const eff = effectiveRate(input.cny_rate, input.cny_markup);
  const eur = D(input.eur_rate);
  const setShip = (p: Partial<CalculationInput["shipping"]>) => update({ shipping: { ...input.shipping, ...p } });

  const addExpense = (name = "", amount = "", currency: Currency = "RUB") =>
    update({ expenses: [...input.expenses, { id: uid(), name, amount, currency }] });
  const setExpense = (id: string, p: Partial<ExpenseItem>) =>
    update({ expenses: input.expenses.map((e) => (e.id === id ? { ...e, ...p } : e)) });
  const removeExpense = (id: string) => update({ expenses: input.expenses.filter((e) => e.id !== id) });

  const expRub = (e: ExpenseItem) =>
    e.currency === "CNY" ? D(e.amount).times(eff) : e.currency === "EUR" ? D(e.amount).times(eur) : D(e.amount);

  const dutyRule = b?.applied_rules.find((r) => r.kind === "duty");
  const feeRule = b?.applied_rules.find((r) => r.kind === "fee");

  return (
    <div className="anim-fade-up">
      <SectionTitle sub="Таможенные платежи рассчитаны по действующей версии правил, затем добавьте доставку, брокера и прочие расходы.">
        4. Таможня и расходы
      </SectionTitle>

      {/* ---- Таможенные платежи ---- */}
      {b ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <CustomsCard title="Таможенная пошлина" icon={<Percent size={15} />} amount={b.customs_duty}>
            {kv("Таможенная стоимость", fmtRub2(b.customs_value_rub))}
            {dutyRule ? (
              <>
                {kv("Правило", dutyRule.name)}
                {kv("Формула", <span className="text-gold-300">{dutyRule.formula_text}</span>)}
              </>
            ) : (
              kv("Правило", <span className="text-danger-400">не найдено</span>)
            )}
          </CustomsCard>

          <CustomsCard title="Таможенный сбор" icon={<FilePlus2 size={15} />} amount={b.customs_fee}>
            {feeRule ? (
              <>
                {kv("Примененное правило", feeRule.name)}
                {kv("Формула", <span className="text-gold-300">{feeRule.formula_text}</span>)}
              </>
            ) : (
              kv("Правило", <span className="text-danger-400">не найдено</span>)
            )}
          </CustomsCard>

          <CustomsCard title="Утилизационный сбор" icon={<Coins size={15} />} amount={b.recycling_fee}>
            {kv("База", fmtRub(b.recycling.base_rub))}
            {kv("Коэффициент", b.recycling.coefficient)}
            {kv("Итого", <span className="text-gold-300">{fmtRub(b.recycling.total_rub)}</span>)}
          </CustomsCard>

          <div className="card p-4.5 sm:p-5">
            <h4 className="font-display text-[13.5px] font-semibold text-ink-50 mb-3">Акциз и НДС</h4>
            <div className="space-y-3">
              <div className="rounded-[10px] border border-ink-700 bg-ink-800/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-ink-300">Акциз</span>
                  {b.excise_applied ? (
                    <span className="font-display font-bold text-ink-50 tnum">{fmtRub(b.excise)}</span>
                  ) : (
                    <Badge tone="neutral">Не применяется</Badge>
                  )}
                </div>
                {!b.excise_applied && <p className="text-[11.5px] text-ink-400 mt-1.5 leading-snug">{b.excise_reason}</p>}
                {b.excise_applied && <p className="text-[11.5px] text-ink-400 mt-1.5">{b.applied_rules.find((r) => r.kind === "excise")?.formula_text}</p>}
              </div>
              <div className="rounded-[10px] border border-ink-700 bg-ink-800/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-ink-300">НДС</span>
                  {b.vat_applied ? (
                    <span className="font-display font-bold text-ink-50 tnum">{fmtRub(b.vat)}</span>
                  ) : (
                    <Badge tone="neutral">Не применяется</Badge>
                  )}
                </div>
                {!b.vat_applied && <p className="text-[11.5px] text-ink-400 mt-1.5 leading-snug">{b.vat_reason}</p>}
                {b.vat_applied && <p className="text-[11.5px] text-ink-400 mt-1.5">{b.applied_rules.find((r) => r.kind === "vat")?.formula_text}</p>}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-5 mb-5 text-[13px] text-ink-300">
          Заполните данные автомобиля и курсы на предыдущих шагах — таможенные платежи появятся автоматически.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ---- Брокер ---- */}
        <div className="card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-9 h-9 rounded-[10px] bg-gold-900 border border-gold-700/40 flex items-center justify-center">
              <Landmark size={17} className="text-gold-400" />
            </span>
            <div>
              <h3 className="font-display text-[14px] font-semibold text-ink-50">Услуги брокера</h3>
              <p className="text-[12px] text-ink-400 font-medium">Таможенное оформление в РФ</p>
            </div>
          </div>
          <Field label="Стоимость услуг брокера" suffix="₽">
            <MoneyInput value={input.broker_cost_rub} onChange={(v) => update({ broker_cost_rub: v })} suffix="₽" placeholder="40 000" />
          </Field>
        </div>

        {/* ---- Доставка ---- */}
        <div className="card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-9 h-9 rounded-[10px] bg-eur-500/10 border border-eur-500/25 flex items-center justify-center">
              <Truck size={17} className="text-eur-500" />
            </span>
            <div>
              <h3 className="font-display text-[14px] font-semibold text-ink-50">Доставка</h3>
              <p className="text-[12px] text-ink-400 font-medium">Логистика на всем маршруте</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Доставка по Китаю" suffix="¥">
              <MoneyInput value={input.china_costs.delivery_cny} onChange={(v) => update({ china_costs: { ...input.china_costs, delivery_cny: v } })} suffix="¥" />
            </Field>
            <Field label="Китай → Россия" suffix="₽">
              <MoneyInput value={input.shipping.china_russia_rub} onChange={(v) => setShip({ china_russia_rub: v })} suffix="₽" />
            </Field>
            <Field label="Доставка по России" suffix="₽">
              <MoneyInput value={input.shipping.russia_rub} onChange={(v) => setShip({ russia_rub: v })} suffix="₽" />
            </Field>
            <Field label="Другие логистические расходы" suffix="₽">
              <MoneyInput value={input.shipping.other_rub} onChange={(v) => setShip({ other_rub: v })} suffix="₽" />
            </Field>
          </div>
        </div>
      </div>

      {/* ---- Динамические расходы ---- */}
      <div className="card p-5 mt-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="font-display text-[14px] font-semibold text-ink-50">Дополнительные расходы</h3>
            <p className="text-[12px] text-ink-400 font-medium">СБКТС, ЭПТС, стоянка и всё, что нужно — суммы автоматически конвертируются в ₽</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => addExpense()}>
            <Plus size={15} /> Добавить расход
          </Button>
        </div>

        {types.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {types.map((t) => (
              <button
                key={t.id}
                onClick={() => addExpense(t.name, t.amount, t.currency)}
                className="px-3 h-8 rounded-lg border border-ink-600 bg-ink-800 text-[12px] font-semibold text-ink-200 hover:border-gold-600 hover:text-gold-400 transition-colors cursor-pointer"
              >
                + {t.name}
              </button>
            ))}
          </div>
        )}

        {input.expenses.length === 0 ? (
          <p className="text-[13px] text-ink-400 py-3">Расходов пока нет. Добавьте первый — например, СБКТС или ЭПТС.</p>
        ) : (
          <div className="space-y-3">
            {input.expenses.map((e) => (
              <div key={e.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_150px_110px_auto] gap-2.5 items-start anim-fade-up">
                <TextInput value={e.name} onChange={(v) => setExpense(e.id, { name: v })} placeholder="Название расхода" />
                <div className="hidden sm:block">
                  <MoneyInput value={e.amount} onChange={(v) => setExpense(e.id, { amount: v })} suffix={e.currency === "CNY" ? "¥" : e.currency === "EUR" ? "€" : "₽"} />
                </div>
                <div className="hidden sm:block">
                  <SelectInput
                    value={e.currency}
                    onChange={(v) => setExpense(e.id, { currency: v as Currency })}
                    options={[
                      { value: "RUB", label: "RUB ₽" },
                      { value: "CNY", label: "CNY ¥" },
                      { value: "EUR", label: "EUR €" },
                    ]}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-bold text-ink-100 tnum whitespace-nowrap sm:w-[110px] sm:text-right">≈ {fmtRub(expRub(e))}</span>
                  <button onClick={() => removeExpense(e.id)} className="p-2.5 rounded-lg text-ink-400 hover:text-danger-400 hover:bg-danger-900 transition-colors cursor-pointer" aria-label="Удалить расход">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-2.5 sm:hidden">
                  <MoneyInput value={e.amount} onChange={(v) => setExpense(e.id, { amount: v })} suffix={e.currency === "CNY" ? "¥" : e.currency === "EUR" ? "€" : "₽"} />
                  <SelectInput
                    value={e.currency}
                    onChange={(v) => setExpense(e.id, { currency: v as Currency })}
                    options={[
                      { value: "RUB", label: "RUB ₽" },
                      { value: "CNY", label: "CNY ¥" },
                      { value: "EUR", label: "EUR €" },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
