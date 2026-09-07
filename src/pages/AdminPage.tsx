import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, RefreshCw, PenLine, Plus, Trash2, Power, Users, Calculator, TrendingUp, CalendarDays, History, AlertTriangle } from "lucide-react";
import { getLogs, clearLogs } from "../lib/logger";
import { useApp } from "../state/AppContext";
import { db } from "../lib/db";
import { getRateProvider } from "../lib/providers/rates";
import type { AdminStats, AppUser, ExchangeRate, ExpenseType, RuleDef, RuleKind } from "../lib/types";
import { D, fmtRub, fmtRate, fmtDateTime, fmtDate, parseAmount } from "../lib/money";
import { Button, Badge, Modal, Field, TextInput, SelectInput, MoneyInput, Switch, Stat, Skeleton, useToast, SectionTitle } from "../components/ui";

type Tab = "dash" | "rates" | "customs" | "recycling" | "settings";

const KIND_LABELS: Record<RuleKind, string> = {
  duty: "Пошлина",
  fee: "Таможенный сбор",
  recycling_base: "Утильсбор: база",
  recycling_coeff: "Утильсбор: коэффициент",
  excise: "Акциз",
  vat: "НДС",
};

export default function AdminPage() {
  const { user, authReady } = useApp();
  const [tab, setTab] = useState<Tab>("dash");

  if (!authReady) {
    return <div className="max-w-[1100px] mx-auto px-4 py-14"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full mt-5" /></div>;
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <ShieldAlert size={30} className="text-danger-400 mx-auto mb-4" />
        <h1 className="font-display text-xl font-bold text-ink-50">Доступ запрещен</h1>
        <p className="text-[13.5px] text-ink-300 mt-2">Админ-панель доступна только пользователям с ролью «Администратор».</p>
        <Link to="/"><span className="inline-block text-gold-400 font-semibold text-sm mt-5">На главную</span></Link>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "dash", label: "Dashboard" },
    { id: "rates", label: "Курсы валют" },
    { id: "customs", label: "Таможенные правила" },
    { id: "recycling", label: "Утилизационный сбор" },
    { id: "settings", label: "Брокер и расходы" },
  ];

  return (
    <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-10">
      <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-gold-400">Администрирование</p>
      <h1 className="font-display text-2xl font-bold text-ink-50 mt-1.5 mb-6">Панель управления</h1>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-7">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 h-10 rounded-[10px] text-[13px] font-bold whitespace-nowrap border transition-colors cursor-pointer ${
              tab === t.id ? "bg-gold-500 text-ink-950 border-gold-500" : "bg-ink-850 text-ink-300 border-ink-600 hover:text-ink-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dash" && <DashboardTab />}
      {tab === "rates" && <RatesTab />}
      {tab === "customs" && <RulesTab kinds={["duty", "fee", "excise", "vat"]} />}
      {tab === "recycling" && <RulesTab kinds={["recycling_base", "recycling_coeff"]} />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

/* ================= DASHBOARD ================= */
function DashboardTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [logs, setLogs] = useState(getLogs());
  useEffect(() => {
    void db.adminStats().then(setStats);
    void db.listUsers().then(setUsers);
  }, []);

  if (!stats) return <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;

  return (
    <div className="anim-fade-up">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat label="Пользователи" value={stats.users} />
        <Stat label="Расчетов всего" value={stats.calculations} />
        <Stat label="Средняя стоимость" value={fmtRub(stats.avg_total_rub)} accent />
        <Stat label="За сегодня" value={stats.today} />
        <Stat label="За месяц" value={stats.month} />
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-700 flex items-center gap-2.5">
          <Users size={16} className="text-gold-400" />
          <h3 className="font-display text-[14px] font-semibold text-ink-50">Пользователи</h3>
        </div>
        {users.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-ink-400">Пока нет зарегистрированных пользователей</p>
        ) : (
          <div className="divide-y divide-ink-700/60">
            {users.map((u) => (
              <div key={u.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold text-ink-100 truncate">{u.name}</p>
                  <p className="text-[12px] text-ink-400 font-medium truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11.5px] text-ink-400 font-medium tnum hidden sm:block">{fmtDate(u.created_at)}</span>
                  <Badge tone={u.role === "admin" ? "gold" : "neutral"}>{u.role === "admin" ? "admin" : "user"}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* журнал ошибок */}
      <div className="card mt-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-700 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <AlertTriangle size={16} className="text-danger-400" />
            <h3 className="font-display text-[14px] font-semibold text-ink-50">Журнал ошибок</h3>
            <span className="text-[11.5px] text-ink-400 font-medium">последние {logs.length}</span>
          </span>
          {logs.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearLogs();
                setLogs([]);
              }}
            >
              <Trash2 size={13} /> Очистить
            </Button>
          )}
        </div>
        {logs.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-ink-400">Ошибок не зафиксировано</p>
        ) : (
          <div className="divide-y divide-ink-700/60 max-h-72 overflow-y-auto">
            {logs.map((l, i) => (
              <div key={i} className="px-5 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-danger-400">{l.scope}</span>
                  <p className="text-[13px] text-ink-200 font-medium mt-0.5 break-words">{l.message}</p>
                </div>
                <span className="text-[11.5px] text-ink-400 font-medium tnum whitespace-nowrap">{fmtDateTime(l.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= RATES ================= */
function RatesTab() {
  const toast = useToast();
  const [cny, setCny] = useState<ExchangeRate | null>(null);
  const [eur, setEur] = useState<ExchangeRate | null>(null);
  const [histCny, setHistCny] = useState<ExchangeRate[]>([]);
  const [histEur, setHistEur] = useState<ExchangeRate[]>([]);
  const [manual, setManual] = useState<{ cur: "CNY" | "EUR"; value: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setCny(await db.getLatestRate("CNY"));
    setEur(await db.getLatestRate("EUR"));
    setHistCny(await db.listRates("CNY", 8));
    setHistEur(await db.listRates("EUR", 8));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async (cur: "CNY" | "EUR") => {
    setBusy(true);
    try {
      const p = getRateProvider();
      const res = cur === "CNY" ? await p.fetchCnyRate() : await p.fetchEurRate();
      await db.saveRate({ currency: cur, rate: res.rate, source: res.source, fetched_at: res.fetched_at, is_manual: false });
      toast("success", `Курс ${cur} обновлен: 1 ${cur} = ${fmtRate(res.rate)} ₽`);
      await load();
    } catch {
      toast("error", cur === "CNY" ? "Не удалось получить курс ВТБ. Введите курс вручную." : "Не удалось получить курс EUR ЦБ РФ.");
    } finally {
      setBusy(false);
    }
  };

  const saveManual = async () => {
    if (!manual) return;
    const v = parseAmount(manual.value);
    if (!D(v).gt(0)) return toast("error", "Введите корректный курс");
    await db.saveRate({ currency: manual.cur, rate: v, source: "Manual", fetched_at: new Date().toISOString(), is_manual: true });
    toast("success", "Курс сохранен вручную");
    setManual(null);
    await load();
  };

  const Card = ({ cur, row, hist }: { cur: "CNY" | "EUR"; row: ExchangeRate | null; hist: ExchangeRate[] }) => (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-ink-50">{cur} / RUB</h3>
          <p className="text-[12px] text-ink-400 font-medium mt-0.5">
            {cur === "CNY" ? "Источник: ВТБ · Gemini + Google Search (Edge Function)" : "Источник: ЦБ РФ (официальный)"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="dark" onClick={() => void refresh(cur)} disabled={busy}>
            <RefreshCw size={14} /> Обновить
          </Button>
          <Button size="sm" variant="outline" onClick={() => setManual({ cur, value: row?.rate ?? "" })}>
            <PenLine size={14} /> Ввести вручную
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-ink-800/70 border border-ink-700 px-4 py-3.5 flex items-baseline justify-between">
        {row ? (
          <>
            <div>
              <p className="font-display text-xl font-bold text-ink-50 tnum">1 {cur} = {fmtRate(row.rate)} ₽</p>
              <p className="text-[11.5px] text-ink-400 font-medium mt-1">
                {fmtDateTime(row.fetched_at)} · <Badge tone={row.source === "Manual" ? "gold" : row.source === "Demo" ? "danger" : "ok"}>{row.source}</Badge>
              </p>
            </div>
          </>
        ) : (
          <p className="text-[13px] text-ink-400 font-medium">Курс еще не получен</p>
        )}
      </div>

      <div className="mt-4">
        <p className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-wider text-ink-400 mb-2">
          <History size={12} /> История
        </p>
        {hist.length === 0 ? (
          <p className="text-[12.5px] text-ink-400">Пусто</p>
        ) : (
          <div className="divide-y divide-ink-700/60 rounded-xl border border-ink-700 overflow-hidden">
            {hist.map((h) => (
              <div key={h.id} className="px-3.5 py-2.5 flex items-center justify-between bg-ink-850">
                <span className="tnum text-[13px] font-bold text-ink-100">{fmtRate(h.rate)} ₽</span>
                <span className="flex items-center gap-2.5">
                  <span className="text-[11.5px] text-ink-400 font-medium tnum">{fmtDateTime(h.fetched_at)}</span>
                  <Badge tone={h.source === "Manual" ? "gold" : h.source === "Demo" ? "danger" : h.source === "CBR" ? "eur" : "ok"}>{h.source}</Badge>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="anim-fade-up">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card cur="CNY" row={cny} hist={histCny} />
        <Card cur="EUR" row={eur} hist={histEur} />
      </div>
      <Modal open={manual !== null} onClose={() => setManual(null)} title={`Курс ${manual?.cur} вручную`}>
        <Field label={`Курс ${manual?.cur} к RUB`}>
          <MoneyInput value={manual?.value ?? ""} onChange={(v) => setManual((m) => (m ? { ...m, value: v } : m))} suffix="₽" />
        </Field>
        <div className="flex gap-2.5 mt-4">
          <Button onClick={() => void saveManual()}>Сохранить</Button>
          <Button variant="ghost" onClick={() => setManual(null)}>Отмена</Button>
        </div>
      </Modal>
    </div>
  );
}

/* ================= RULES CRUD ================= */
const emptyRule = (kind: RuleKind, version: string): RuleDef => ({
  id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  kind,
  name: "",
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
  effective_from: new Date().toISOString().slice(0, 10),
  effective_to: null,
  is_active: true,
  version,
});

function RulesTab({ kinds }: { kinds: RuleKind[] }) {
  const { rules, refreshRules, ruleVersion } = useApp();
  const toast = useToast();
  const [editing, setEditing] = useState<RuleDef | null>(null);
  const list = rules.filter((r) => kinds.includes(r.kind));

  const numOrNull = (s: string | null): number | null => {
    if (s === null || s === "") return null;
    const n = Number(s);
    return isNaN(n) ? null : n;
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return toast("error", "Укажите название правила");
    await db.saveRule(editing);
    await refreshRules();
    setEditing(null);
    toast("success", "Правило сохранено");
  };
  const remove = async (id: string) => {
    await db.deleteRule(id);
    await refreshRules();
    toast("info", "Правило удалено");
  };
  const toggle = async (r: RuleDef) => {
    await db.saveRule({ ...r, is_active: !r.is_active });
    await refreshRules();
    toast("info", r.is_active ? "Правило деактивировано" : "Правило активировано");
  };

  const f = (p: Partial<RuleDef>) => setEditing((e) => (e ? { ...e, ...p } : e));

  return (
    <div className="anim-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <p className="text-[13px] text-ink-300 font-medium">
          Версия правил: <Badge tone="gold">{ruleVersion.version}</Badge> — правила выбираются по дате расчета
        </p>
        <Button onClick={() => setEditing(emptyRule(kinds[0], ruleVersion.version))}>
          <Plus size={15} /> Создать правило
        </Button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-ink-700 text-left">
                {["Название", "Тип", "Параметры", "Формула", "Действует", "Статус", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-[10.5px] font-bold uppercase tracking-wider text-ink-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className={`border-b border-ink-700/60 last:border-0 ${r.is_active ? "" : "opacity-45"}`}>
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-bold text-ink-100">{r.name}</p>
                    <p className="text-[11px] text-ink-400 font-medium">v{r.version}</p>
                  </td>
                  <td className="px-4 py-3"><Badge tone="neutral">{KIND_LABELS[r.kind]}</Badge></td>
                  <td className="px-4 py-3 text-[12px] text-ink-300 font-medium whitespace-nowrap">
                    {[
                      r.importer_type === "physical" ? "физлицо" : r.importer_type === "legal" ? "юрлицо" : null,
                      r.engine_type ? r.engine_type : null,
                      r.min_engine_volume !== null || r.max_engine_volume !== null
                        ? `${r.min_engine_volume ?? 0}–${r.max_engine_volume ?? "∞"} см³`
                        : null,
                      r.min_vehicle_age !== null || r.max_vehicle_age !== null
                        ? `${r.min_vehicle_age ?? 0}–${r.max_vehicle_age ?? "∞"} лет`
                        : null,
                      r.min_power !== null || r.max_power !== null ? `${r.min_power ?? 0}–${r.max_power ?? "∞"} л.с.` : null,
                      r.min_customs_value !== null || r.max_customs_value !== null
                        ? `ТС ${D(r.min_customs_value ?? 0).div(1000).toFixed(0)}–${r.max_customs_value ? D(r.max_customs_value).div(1000).toFixed(0) : "∞"} тыс ₽`
                        : null,
                    ].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-ink-300 font-semibold whitespace-nowrap">
                    {r.formula === "percent" ? `${r.rate}%` : r.formula === "eur_per_cc" ? `${r.rate} €/см³` : r.formula === "percent_or_eur_cc_max" ? `max(${r.rate}%, ${r.coefficient} €/см³)` : r.formula === "fixed" ? `${fmtRub(r.fixed_amount ?? "0")}` : r.formula === "per_hp" ? `${r.rate} ₽/л.с.` : `×${r.coefficient}`}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-ink-300 font-medium whitespace-nowrap">
                    {fmtDate(r.effective_from)} — {r.effective_to ? fmtDate(r.effective_to) : "∞"}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => void toggle(r)} className={`flex items-center gap-1.5 text-[12px] font-bold cursor-pointer ${r.is_active ? "text-ok-400" : "text-ink-400"}`}>
                      <Power size={13} /> {r.is_active ? "активно" : "выкл"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(r)} className="p-2 rounded-lg text-ink-300 hover:text-gold-400 hover:bg-ink-750 cursor-pointer"><PenLine size={15} /></button>
                      <button onClick={() => void remove(r.id)} className="p-2 rounded-lg text-ink-300 hover:text-danger-400 hover:bg-danger-900 cursor-pointer"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-[13px] text-ink-400">Правил этого типа пока нет</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.name ? "Изменить правило" : "Новое правило"} wide>
        {editing && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Название" className="sm:col-span-2">
              <TextInput value={editing.name} onChange={(v) => f({ name: v })} placeholder="Физлицо, 3–5 лет, 1001–2000 см³" />
            </Field>
            <Field label="Тип правила">
              <SelectInput value={editing.kind} onChange={(v) => f({ kind: v as RuleKind })} options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="Формула">
              <SelectInput
                value={editing.formula}
                onChange={(v) => f({ formula: v as RuleDef["formula"] })}
                options={[
                  { value: "percent", label: "% от таможенной стоимости" },
                  { value: "eur_per_cc", label: "€/см³ (rate)" },
                  { value: "percent_or_eur_cc_max", label: "max(%, €/см³)" },
                  { value: "fixed", label: "Фиксированная сумма" },
                  { value: "per_hp", label: "₽ за л.с." },
                  { value: "base_times_coeff", label: "База × коэффициент" },
                ]}
              />
            </Field>
            <Field label="Импортер">
              <SelectInput value={editing.importer_type ?? ""} onChange={(v) => f({ importer_type: (v || null) as RuleDef["importer_type"] })} options={[{ value: "", label: "Любой" }, { value: "physical", label: "Физлицо" }, { value: "legal", label: "Юрлицо" }]} />
            </Field>
            <Field label="Тип двигателя">
              <SelectInput value={editing.engine_type ?? ""} onChange={(v) => f({ engine_type: (v || null) as RuleDef["engine_type"] })} options={[{ value: "", label: "Любой" }, { value: "petrol", label: "Бензин" }, { value: "diesel", label: "Дизель" }, { value: "hybrid", label: "Гибрид" }, { value: "phev", label: "Plug-in Hybrid" }, { value: "electric", label: "Электро" }]} />
            </Field>
            <Field label="Объем: мин, см³"><TextInput value={String(editing.min_engine_volume ?? "")} onChange={(v) => f({ min_engine_volume: numOrNull(v) })} inputMode="numeric" /></Field>
            <Field label="Объем: макс, см³"><TextInput value={String(editing.max_engine_volume ?? "")} onChange={(v) => f({ max_engine_volume: numOrNull(v) })} inputMode="numeric" /></Field>
            <Field label="Возраст: мин, лет"><TextInput value={String(editing.min_vehicle_age ?? "")} onChange={(v) => f({ min_vehicle_age: numOrNull(v) })} inputMode="numeric" /></Field>
            <Field label="Возраст: макс, лет"><TextInput value={String(editing.max_vehicle_age ?? "")} onChange={(v) => f({ max_vehicle_age: numOrNull(v) })} inputMode="numeric" /></Field>
            <Field label="Мощность: мин, л.с."><TextInput value={String(editing.min_power ?? "")} onChange={(v) => f({ min_power: numOrNull(v) })} inputMode="numeric" /></Field>
            <Field label="Мощность: макс, л.с."><TextInput value={String(editing.max_power ?? "")} onChange={(v) => f({ max_power: numOrNull(v) })} inputMode="numeric" /></Field>
            <Field label="Ставка (% или €/см³ или ₽/л.с.)"><TextInput value={editing.rate ?? ""} onChange={(v) => f({ rate: v || null })} inputMode="decimal" /></Field>
            <Field label="Фикс. сумма, ₽"><TextInput value={editing.fixed_amount ?? ""} onChange={(v) => f({ fixed_amount: v || null })} inputMode="decimal" /></Field>
            <Field label="Коэффициент"><TextInput value={editing.coefficient ?? ""} onChange={(v) => f({ coefficient: v || null })} inputMode="decimal" /></Field>
            <Field label="Версия"><TextInput value={editing.version} onChange={(v) => f({ version: v })} /></Field>
            <Field label="Действует с"><TextInput value={editing.effective_from} onChange={(v) => f({ effective_from: v })} placeholder="2025-01-01" /></Field>
            <Field label="Действует до (пусто — бессрочно)"><TextInput value={editing.effective_to ?? ""} onChange={(v) => f({ effective_to: v || null })} placeholder="2026-01-01" /></Field>
            <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-3">
              <Switch checked={editing.is_active} onChange={(v) => f({ is_active: v })} label="Правило активно" />
              <span className="text-[11.5px] text-ink-400 font-medium">выбор правила — по дате расчета</span>
            </div>
          </div>
        )}
        <div className="flex gap-2.5 mt-5">
          <Button onClick={() => void save()}>Сохранить правило</Button>
          <Button variant="ghost" onClick={() => setEditing(null)}>Отмена</Button>
        </div>
      </Modal>
    </div>
  );
}

/* ================= SETTINGS ================= */
function SettingsTab() {
  const { settings, refreshRules } = useApp();
  const toast = useToast();
  const [broker, setBroker] = useState(settings.broker_default_price);
  const [markup, setMarkup] = useState(settings.cny_markup);
  const [types, setTypes] = useState<ExpenseType[]>([]);
  const [newType, setNewType] = useState({ name: "", amount: "" });

  useEffect(() => {
    void db.listExpenseTypes().then(setTypes);
  }, []);

  const saveSettings = async () => {
    await db.saveSettings({ ...settings, broker_default_price: broker, cny_markup: markup });
    await refreshRules();
    toast("success", "Настройки сохранены");
  };

  const addType = async () => {
    if (!newType.name.trim()) return toast("error", "Укажите название шаблона");
    const t: ExpenseType = { id: `et-${Date.now()}`, name: newType.name.trim(), amount: parseAmount(newType.amount) || "0", currency: "RUB" };
    await db.saveExpenseType(t);
    setTypes(await db.listExpenseTypes());
    setNewType({ name: "", amount: "" });
    toast("success", "Шаблон расхода добавлен");
  };
  const removeType = async (id: string) => {
    await db.deleteExpenseType(id);
    setTypes(await db.listExpenseTypes());
  };

  return (
    <div className="anim-fade-up grid grid-cols-1 xl:grid-cols-2 gap-5">
      <div className="card p-5 sm:p-6">
        <SectionTitle sub="Значения по умолчанию для новых расчетов">Настройки калькулятора</SectionTitle>
        <Field label="Стандартная стоимость услуг брокера" suffix="₽">
          <MoneyInput value={broker} onChange={setBroker} suffix="₽" />
        </Field>
        <div className="mt-4">
          <Field label="Надбавка к курсу ВТБ" suffix="%">
            <MoneyInput value={markup} onChange={setMarkup} suffix="₽" />
          </Field>
        </div>
        <Button className="mt-5" onClick={() => void saveSettings()}>Сохранить настройки</Button>
      </div>

      <div className="card p-5 sm:p-6">
        <SectionTitle sub="Быстрые шаблоны для блока «Дополнительные расходы»">Шаблоны расходов</SectionTitle>
        <div className="flex gap-2.5">
          <div className="flex-1"><TextInput value={newType.name} onChange={(v) => setNewType((t) => ({ ...t, name: v }))} placeholder="Например: Страховка" /></div>
          <div className="w-32"><MoneyInput value={newType.amount} onChange={(v) => setNewType((t) => ({ ...t, amount: v }))} suffix="₽" /></div>
          <Button variant="outline" onClick={() => void addType()}><Plus size={15} /></Button>
        </div>
        <div className="divide-y divide-ink-700/60 mt-4 rounded-xl border border-ink-700 overflow-hidden">
          {types.map((t) => (
            <div key={t.id} className="px-4 py-3 flex items-center justify-between bg-ink-850">
              <span className="text-[13px] font-bold text-ink-100">{t.name}</span>
              <span className="flex items-center gap-3">
                <span className="tnum text-[13px] font-semibold text-ink-300">{fmtRub(t.amount)}</span>
                <button onClick={() => void removeType(t.id)} className="p-1.5 rounded-lg text-ink-400 hover:text-danger-400 hover:bg-danger-900 cursor-pointer"><Trash2 size={14} /></button>
              </span>
            </div>
          ))}
          {types.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-ink-400">Шаблонов нет</p>}
        </div>
      </div>
    </div>
  );
}
