import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import StepCar from "../components/calculator/StepCar";
import StepPrice from "../components/calculator/StepPrice";
import StepRates from "../components/calculator/StepRates";
import StepExpenses from "../components/calculator/StepExpenses";
import StepResult from "../components/calculator/StepResult";
import SummaryPanel from "../components/SummaryPanel";
import { useApp } from "../state/AppContext";
import { Button, useToast } from "../components/ui";
import { emptyCar } from "../lib/types";
import type { CalculationInput, OcrConfidence, OcrResult } from "../lib/types";
import { computeFullCalculation, validateForCalculation, makeSnapshot } from "../lib/engine/customsEngine";
import { db } from "../lib/db";
import { D } from "../lib/money";
import { logError } from "../lib/logger";

const STEPS = ["Автомобиль", "Цена", "Курсы", "Расходы", "Результат"];
const DRAFT_KEY = "acc_draft_v1";

const defaultInput = (brokerDefault: string, markup: string): CalculationInput => ({
  car: emptyCar(),
  china_price_cny: "",
  price_equals_invoice: true,
  invoice_price_cny: "",
  china_costs: { delivery_cny: "", china_russia_cny: "", seller_fee_cny: "", other_cny: "" },
  cny_rate: "",
  cny_rate_source: "Manual",
  cny_fetched_at: "",
  eur_rate: "",
  eur_rate_source: "Manual",
  eur_fetched_at: "",
  cny_markup: markup,
  broker_cost_rub: brokerDefault,
  shipping: { china_russia_rub: "", russia_rub: "", other_rub: "" },
  expenses: [],
  image_data: null,
});

const loadDraft = (brokerDefault: string, markup: string): { input: CalculationInput; confidence: OcrConfidence | null; ocrDemo: boolean } => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = JSON.parse(raw) as { input: CalculationInput; confidence: OcrConfidence | null; ocrDemo: boolean };
      if (d?.input?.car) {
        return {
          input: { ...defaultInput(brokerDefault, markup), ...d.input, car: { ...emptyCar(), ...d.input.car } },
          confidence: d.confidence ?? null,
          ocrDemo: Boolean(d.ocrDemo),
        };
      }
    }
  } catch {
    /* поврежденный черновик игнорируем */
  }
  return { input: defaultInput(brokerDefault, markup), confidence: null, ocrDemo: false };
};

export default function CalculatorPage() {
  const { user, settings, rules, ruleVersion } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const inited = useRef(false);

  const [{ input, confidence, ocrDemo }, setDraft] = useState(() =>
    loadDraft(DEMO_FALLBACK.broker, DEMO_FALLBACK.markup)
  );
  const [step, setStep] = useState(() => {
    const s = Number(sessionStorage.getItem("acc_step") ?? 0);
    return s >= 0 && s <= 4 ? s : 0;
  });
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  // подставляем настройки приложения после загрузки (брокер по умолчанию, надбавка)
  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    setDraft((d) => ({
      ...d,
      input: {
        ...d.input,
        broker_cost_rub: d.input.broker_cost_rub || settings.broker_default_price,
        cny_markup: d.input.cny_markup || settings.cny_markup,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ input, confidence, ocrDemo }));
    } catch {
      /* quota */
    }
  }, [input, confidence, ocrDemo]);

  useEffect(() => {
    sessionStorage.setItem("acc_step", String(step));
  }, [step]);

  const update = (p: Partial<CalculationInput>) => {
    setSavedId(null);
    setDraft((d) => ({ ...d, input: { ...d.input, ...p } }));
  };

  const onRecognized = (r: OcrResult) => {
    setSavedId(null);
    setDraft((d) => ({ ...d, input: { ...d.input, car: { ...d.input.car, ...r.data } }, confidence: r.confidence, ocrDemo: r.demo }));
  };

  const missing = useMemo(
    () => validateForCalculation(input.car, input.china_price_cny, input.broker_cost_rub),
    [input.car, input.china_price_cny, input.broker_cost_rub]
  );
  const ratesMissing = !D(input.cny_rate).gt(0) || !D(input.eur_rate).gt(0);

  const result = useMemo(() => {
    if (missing.length > 0 || ratesMissing || rules.length === 0) return null;
    try {
      return computeFullCalculation(input, rules, ruleVersion.version);
    } catch {
      return null;
    }
  }, [input, rules, ruleVersion.version, missing.length, ratesMissing]);

  const goto = (target: number) => {
    if (target === 4 && !result) {
      if (missing.length > 0) {
        toast("error", `Для расчета необходимо указать: ${missing.join(", ")}.`);
        setStep(missing.some((m) => m.includes("цена")) ? 1 : 0);
      } else if (ratesMissing) {
        toast("error", "Укажите курсы валют — без них расчет невозможен.");
        setStep(2);
      }
      return;
    }
    setStep(target);
  };

  const handleSave = async () => {
    if (!result) return;
    if (!user) {
      toast("info", "Войдите в аккаунт, чтобы сохранить расчет");
      navigate("/login");
      return;
    }
    setSaving(true);
    try {
      const snap = makeSnapshot(crypto.randomUUID ? crypto.randomUUID() : `calc-${Date.now()}`, user.id, input, result, ruleVersion.version);
      await db.saveCalculation(snap);
      setSavedId(snap.id);
      toast("success", "Расчет сохранен в «Мои расчеты»");
    } catch (e) {
      logError("save-calculation", e);
      toast("error", "Не удалось сохранить расчет");
    } finally {
      setSaving(false);
    }
  };

  const handleNew = () => {
    setDraft({ input: defaultInput(settings.broker_default_price, settings.cny_markup), confidence: null, ocrDemo: false });
    setSavedId(null);
    setStep(0);
    toast("info", "Начат новый расчет");
  };

  const allDone = missing.length === 0 && !ratesMissing;

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-8">
      {/* -------- Progress -------- */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((label, i) => {
            const done = i < step || (i === 4 && Boolean(result));
            const activeStep = i === step;
            const reachable = i <= step || (i < 4 ? allDone || i <= 2 : Boolean(result));
            return (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => reachable && goto(i)}
                  className={`flex items-center gap-2.5 group ${reachable ? "cursor-pointer" : "cursor-not-allowed"}`}
                >
                  <span
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-display text-[13px] font-bold border-2 transition-all ${
                      activeStep
                        ? "bg-gold-500 border-gold-500 text-ink-950 shadow-[0_0_24px_-4px_rgba(242,174,60,0.6)]"
                        : done
                          ? "bg-gold-900 border-gold-700 text-gold-400"
                          : "bg-ink-850 border-ink-600 text-ink-400"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={`hidden md:block text-[13px] font-bold transition-colors ${
                      activeStep ? "text-ink-50" : done ? "text-gold-400" : "text-ink-400"
                    } group-hover:text-ink-200`}
                  >
                    {label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-[2px] mx-2 sm:mx-3 rounded ${i < step ? "bg-gold-600" : "bg-ink-700"}`} />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 h-1 rounded-full bg-ink-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-gold-600 to-gold-400 rounded-full transition-all duration-500"
            style={{ width: `${((step + (result ? 1 : 0.4)) / 5) * 100}%` }}
          />
        </div>
      </div>

      {/* -------- Контент -------- */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_370px] gap-6 items-start">
        <div className="min-w-0">
          {step === 0 && (
            <StepCar
              car={input.car}
              onChange={(car) => update({ car })}
              image={input.image_data}
              onImage={(image_data) => update({ image_data })}
              confidence={confidence}
              ocrDemo={ocrDemo}
              onRecognized={onRecognized}
            />
          )}
          {step === 1 && <StepPrice input={input} update={update} />}
          {step === 2 && <StepRates input={input} update={update} />}
          {step === 3 && <StepExpenses input={input} update={update} result={result} />}
          {step === 4 && result && (
            <StepResult
              input={input}
              result={result}
              user={user}
              onSave={() => void handleSave()}
              onNew={handleNew}
              saving={saving}
              saved={Boolean(savedId)}
            />
          )}
          {step === 4 && !result && (
            <div className="card p-8 text-center">
              <Lock size={26} className="text-ink-500 mx-auto mb-3" />
              <p className="font-display text-[15px] font-semibold text-ink-100">Результат пока недоступен</p>
              <p className="text-[13px] text-ink-300 mt-2">
                {missing.length > 0 ? `Для расчета необходимо указать: ${missing.join(", ")}.` : "Укажите курсы валют на шаге 3."}
              </p>
              <Button className="mt-5" onClick={() => goto(missing.length > 0 ? 0 : 2)}>
                Вернуться к данным
              </Button>
            </div>
          )}

          {/* -------- Навигация по шагам -------- */}
          {step < 4 && (
            <div className="flex items-center justify-between mt-7">
              <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
                <ChevronLeft size={17} /> Назад
              </Button>
              <div className="flex items-center gap-3">
                {missing.length > 0 && step >= 1 && (
                  <span className="hidden sm:block text-[12px] text-ink-400 font-medium">
                    Осталось: {missing.join(", ")}
                  </span>
                )}
                <Button size="lg" onClick={() => goto(step + 1)}>
                  {step === 3 ? "Рассчитать стоимость в России" : "Далее"} <ChevronRight size={17} />
                </Button>
              </div>
            </div>
          )}
        </div>

        <aside className="lg:order-2">
          <SummaryPanel input={input} result={result} missing={[...missing, ...(ratesMissing ? ["курсы валют"] : [])]} />
        </aside>
      </div>
    </div>
  );
}

// начальные значения до загрузки настроек
const DEMO_FALLBACK = { broker: "40000", markup: "2.5" };
