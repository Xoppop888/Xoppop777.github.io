import { useEffect, useRef, useState } from "react";
import { RefreshCw, PenLine, FlaskConical, AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { CalculationInput, RateSource } from "../../lib/types";
import { effectiveRate } from "../../lib/engine/customsEngine";
import { D, fmtRate, fmtDateTime, fmtDate, parseAmount } from "../../lib/money";
import { db } from "../../lib/db";
import { logError } from "../../lib/logger";
import { getRateProvider, demoRates } from "../../lib/providers/rates";
import { useApp } from "../../state/AppContext";
import { Button, Badge, MoneyInput, Field, Skeleton, SectionTitle, useToast } from "../ui";

type Status = "loading" | "ok" | "error" | "manual";
const FRESH_MS = 30 * 60 * 1000;
const isFresh = (iso: string) => Date.now() - new Date(iso).getTime() < FRESH_MS;

const sourceTone = (s: RateSource): "ok" | "gold" | "danger" | "eur" =>
  s === "Manual" ? "gold" : s === "Demo" ? "danger" : s === "CBR" ? "eur" : "ok";

export default function StepRates({
  input,
  update,
}: {
  input: CalculationInput;
  update: (p: Partial<CalculationInput>) => void;
}) {
  const { isDemo } = useApp();
  const toast = useToast();
  const provider = useRef(getRateProvider());

  const [cnyStatus, setCnyStatus] = useState<Status>("loading");
  const [eurStatus, setEurStatus] = useState<Status>("loading");
  const [cnyError, setCnyError] = useState("");
  const [eurError, setEurError] = useState("");
  const [cnyManual, setCnyManual] = useState("");
  const [eurManual, setEurManual] = useState("");

  const applyCny = (rate: string, source: RateSource, fetched_at: string) =>
    update({ cny_rate: rate, cny_rate_source: source, cny_fetched_at: fetched_at });
  const applyEur = (rate: string, source: RateSource, fetched_at: string) =>
    update({ eur_rate: rate, eur_rate_source: source, eur_fetched_at: fetched_at });

  const refreshCny = async () => {
    setCnyStatus("loading");
    setCnyError("");
    try {
      const res = await provider.current.fetchCnyRate();
      await db.saveRate({ currency: "CNY", rate: res.rate, source: res.source, fetched_at: res.fetched_at, is_manual: false });
      applyCny(res.rate, res.source, res.fetched_at);
      setCnyStatus("ok");
      toast("success", "Курс ВТБ обновлен");
    } catch (e) {
      logError("rates:vtb", e);
      const cached = await db.getLatestRate("CNY");
      if (cached && isFresh(cached.fetched_at)) {
        applyCny(cached.rate, cached.source, cached.fetched_at);
        setCnyStatus("ok");
        setCnyError("");
        toast("info", `Использован сохраненный курс от ${fmtDateTime(cached.fetched_at)}`);
      } else {
        setCnyError(e instanceof Error ? e.message : "Не удалось получить актуальный курс ВТБ");
        setCnyStatus("error");
      }
    }
  };

  const refreshEur = async () => {
    setEurStatus("loading");
    setEurError("");
    try {
      const res = await provider.current.fetchEurRate();
      await db.saveRate({ currency: "EUR", rate: res.rate, source: res.source, fetched_at: res.fetched_at, is_manual: false });
      applyEur(res.rate, res.source, res.fetched_at);
      setEurStatus("ok");
      toast("success", "Курс ЦБ РФ обновлен");
    } catch (e) {
      logError("rates:cbr", e);
      const cached = await db.getLatestRate("EUR");
      if (cached && isFresh(cached.fetched_at)) {
        applyEur(cached.rate, cached.source, cached.fetched_at);
        setEurStatus("ok");
        toast("info", `Использован сохраненный курс от ${fmtDateTime(cached.fetched_at)}`);
      } else {
        setEurError(e instanceof Error ? e.message : "Не удалось получить курс EUR ЦБ РФ");
        setEurStatus("error");
      }
    }
  };

  useEffect(() => {
    // если в черновике уже есть свежий курс — не перезапрашиваем и не перезаписываем его
    if (D(input.cny_rate).gt(0) && input.cny_fetched_at && isFresh(input.cny_fetched_at)) setCnyStatus("ok");
    else void refreshCny();
    if (D(input.eur_rate).gt(0) && input.eur_fetched_at && isFresh(input.eur_fetched_at)) setEurStatus("ok");
    else void refreshEur();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && cnyStatus !== "manual") void refreshCny();
    }, 30 * 60 * 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnyStatus]);

  const saveManualCny = async () => {
    const v = parseAmount(cnyManual);
    if (!D(v).gt(0)) return toast("error", "Введите корректный курс");
    const now = new Date().toISOString();
    await db.saveRate({ currency: "CNY", rate: v, source: "Manual", fetched_at: now, is_manual: true });
    applyCny(v, "Manual", now);
    setCnyStatus("ok");
    toast("success", "Курс сохранен вручную");
  };
  const saveManualEur = async () => {
    const v = parseAmount(eurManual);
    if (!D(v).gt(0)) return toast("error", "Введите корректный курс");
    const now = new Date().toISOString();
    await db.saveRate({ currency: "EUR", rate: v, source: "Manual", fetched_at: now, is_manual: true });
    applyEur(v, "Manual", now);
    setEurStatus("ok");
    toast("success", "Курс сохранен вручную");
  };
  const useDemoCny = async () => {
    const res = await demoRates.fetchCnyRate();
    await db.saveRate({ currency: "CNY", rate: res.rate, source: "Demo", fetched_at: res.fetched_at, is_manual: true });
    applyCny(res.rate, "Demo", res.fetched_at);
    setCnyStatus("ok");
  };

  const eff = effectiveRate(input.cny_rate, input.cny_markup);

  return (
    <div className="anim-fade-up">
      <SectionTitle sub="Курс юаня получается через backend из официального источника ВТБ и автоматически обновляется каждые 30 минут; курс евро — официальный курс ЦБ РФ. Устаревшие курсы не используются молча.">
        3. Курсы валют
      </SectionTitle>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* ===== CNY ===== */}
        <div className="card p-5 sm:p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-cny-500/70 to-transparent" />
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-[15px] font-semibold text-ink-50">Курс юаня</h3>
            <Badge tone="cny">CNY → RUB</Badge>
          </div>

          {cnyStatus === "loading" ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge tone={sourceTone(input.cny_rate_source)}>
                  {input.cny_rate_source === "VTB" ? "ВТБ" : input.cny_rate_source === "CBR" ? "ЦБ РФ" : input.cny_rate_source === "Manual" ? "Ручной ввод" : "DEMO DATA"}
                </Badge>
                <span className="text-[11.5px] text-ink-400 font-medium">получен {fmtDateTime(input.cny_fetched_at)}</span>
              </div>

              {cnyStatus === "error" ? (
                <div className="rounded-xl border border-danger-500/30 bg-danger-900/30 p-4">
                  <p className="flex items-center gap-2 text-[13.5px] font-semibold text-danger-400">
                    <AlertCircle size={16} /> {cnyError}
                  </p>
                  <p className="text-[12px] text-ink-300 mt-1.5">Введите курс вручную или повторите попытку.</p>
                  <div className="flex gap-2.5 mt-3.5 flex-wrap">
                    <Button size="sm" onClick={() => setCnyStatus("manual")}>
                      <PenLine size={14} /> Ввести курс вручную
                    </Button>
                    <Button size="sm" variant="dark" onClick={() => void refreshCny()}>
                      <RefreshCw size={14} /> Повторить
                    </Button>
                    {isDemo && (
                      <Button size="sm" variant="outline" onClick={() => void useDemoCny()}>
                        <FlaskConical size={14} /> Демо-курс
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] text-ink-300 font-medium">Курс ВТБ</span>
                    <span className="font-display text-lg font-semibold text-ink-50 tnum">1 CNY = {fmtRate(input.cny_rate)} ₽</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-[13px] text-ink-300 font-medium">
                      Надбавка <span className="text-ink-400 text-[11.5px]">от инвойса</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        className="w-16 h-8 px-2 rounded-lg bg-ink-800 border border-ink-600 text-[13px] tnum text-ink-100 text-right outline-none focus:border-gold-500"
                        value={input.cny_markup}
                        inputMode="decimal"
                        onChange={(e) => update({ cny_markup: e.target.value.replace(/[^\d.,]/g, "") })}
                      />
                      <span className="text-[13px] font-bold text-ink-300">%</span>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl bg-ink-800/80 border border-gold-700/30 px-4 py-3.5 flex items-baseline justify-between">
                    <span className="text-[12.5px] font-bold uppercase tracking-wider text-gold-400/80">Расчетный курс инвойса</span>
                    <span className="font-display text-xl font-bold text-gold-400 tnum">1 CNY = {fmtRate(eff)} ₽</span>
                  </div>
                  <p className="mt-2 text-right text-[11.5px] text-ink-400 font-medium tnum">
                    Формула: курс ВТБ {fmtRate(input.cny_rate)} × {D(1).plus(D(input.cny_markup).div(100)).toFixed(3)}
                  </p>
                  <p className="mt-1.5 text-[11.5px] text-ink-400 leading-relaxed">
                    К стоимости автомобиля прибавляется надбавка {input.cny_markup}% <span className="text-ink-300 font-semibold">от стоимости по инвойсу</span>.
                    Прочие суммы в юанях конвертируются по курсу ВТБ без надбавки.
                  </p>
                  {input.cny_rate_source === "Manual" && (
                    <p className="mt-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-gold-400">
                      <Info size={13} /> Используется введенный вручную курс
                    </p>
                  )}
                  {input.cny_rate_source === "Demo" && (
                    <p className="mt-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-danger-400">
                      <Info size={13} /> DEMO DATA — курс не является реальным
                    </p>
                  )}
                </>
              )}

              {cnyStatus === "manual" && (
                <div className="mt-4 rounded-xl border border-ink-600 bg-ink-800/60 p-4 anim-fade-up">
                  <Field label="Курс CNY к RUB, вручную">
                    <MoneyInput value={cnyManual} onChange={setCnyManual} suffix="₽" placeholder="12.45" />
                  </Field>
                  <div className="flex gap-2.5 mt-3">
                    <Button size="sm" onClick={() => void saveManualCny()}>Сохранить курс</Button>
                    <Button size="sm" variant="ghost" onClick={() => setCnyStatus(D(input.cny_rate).gt(0) ? "ok" : "error")}>Отмена</Button>
                  </div>
                </div>
              )}

              {cnyStatus === "ok" && (
                <button onClick={() => void refreshCny()} className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-300 hover:text-gold-400 transition-colors cursor-pointer">
                  <RefreshCw size={13} /> Обновить курс
                </button>
              )}
            </>
          )}
        </div>

        {/* ===== EUR ===== */}
        <div className="card p-5 sm:p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-eur-500/70 to-transparent" />
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-[15px] font-semibold text-ink-50">Курс евро</h3>
            <Badge tone="eur">EUR → RUB</Badge>
          </div>

          {eurStatus === "loading" ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : eurStatus === "error" ? (
            <div className="rounded-xl border border-danger-500/30 bg-danger-900/30 p-4">
              <p className="flex items-center gap-2 text-[13.5px] font-semibold text-danger-400">
                <AlertCircle size={16} /> {eurError}
              </p>
              <div className="flex gap-2.5 mt-3.5 flex-wrap">
                <Button size="sm" onClick={() => setEurStatus("manual")}>
                  <PenLine size={14} /> Ввести курс вручную
                </Button>
                <Button size="sm" variant="dark" onClick={() => void refreshEur()}>
                  <RefreshCw size={14} /> Повторить
                </Button>
                {isDemo && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void (async () => {
                        const res = await demoRates.fetchEurRate();
                        await db.saveRate({ currency: "EUR", rate: res.rate, source: "Demo", fetched_at: res.fetched_at, is_manual: true });
                        applyEur(res.rate, "Demo", res.fetched_at);
                        setEurStatus("ok");
                      })()
                    }
                  >
                    <FlaskConical size={14} /> Демо-курс
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge tone={sourceTone(input.eur_rate_source)}>
                  {input.eur_rate_source === "CBR" ? "ЦБ РФ" : input.eur_rate_source === "Manual" ? "Ручной ввод" : input.eur_rate_source === "Demo" ? "DEMO DATA" : "ВТБ"}
                </Badge>
                <span className="text-[11.5px] text-ink-400 font-medium">дата курса: {fmtDate(input.eur_fetched_at)}</span>
              </div>
              <p className="text-[13px] text-ink-300 font-medium">Курс EUR по ЦБ РФ</p>
              <p className="font-display text-2xl font-bold text-ink-50 tnum mt-1.5">
                1 EUR = {fmtRate(input.eur_rate)} ₽
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-400 font-medium">
                <CheckCircle2 size={13} className="text-ok-400" /> используется в формулах €/см³
              </p>
              {input.eur_rate_source === "Manual" && (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-gold-400">
                  <Info size={13} /> Используется введенный вручную курс
                </p>
              )}
            </>
          )}

          {eurStatus === "manual" && (
            <div className="mt-4 rounded-xl border border-ink-600 bg-ink-800/60 p-4 anim-fade-up">
              <Field label="Курс EUR к RUB, вручную">
                <MoneyInput value={eurManual} onChange={setEurManual} suffix="₽" placeholder="96.52" />
              </Field>
              <div className="flex gap-2.5 mt-3">
                <Button size="sm" onClick={() => void saveManualEur()}>Сохранить курс</Button>
                <Button size="sm" variant="ghost" onClick={() => setEurStatus(D(input.eur_rate).gt(0) ? "ok" : "error")}>Отмена</Button>
              </div>
            </div>
          )}

          {eurStatus === "ok" && (
            <Button size="sm" variant="outline" className="mt-4" onClick={() => void refreshEur()}>
              <RefreshCw size={14} /> Обновить
            </Button>
          )}
        </div>
      </div>

      <p className="mt-4 text-[12px] text-ink-400 leading-relaxed max-w-2xl">
        Курсы обновляются автоматически. Все использованные курсы сохраняются вместе с расчетом — вы всегда сможете увидеть,
        по какому курсу и на какую дату был выполнен конкретный расчет.
      </p>
    </div>
  );
}
