import { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { LogIn, ShieldCheck } from "lucide-react";
import { useApp } from "../state/AppContext";
import { Button, Field, TextInput, useToast, Badge } from "../components/ui";
import { Logo } from "../components/Layout";

export default function LoginPage() {
  const { signIn, isDemo } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const from = (location.state as { from?: string } | null)?.from ?? "/calculations";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@") || password.length < 4) {
      setError("Введите корректный email и пароль (минимум 4 символа)");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const u = await signIn(email, password);
      toast("success", `Добро пожаловать, ${u.name}!`);
      navigate(from);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-14 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
      <div className="hidden lg:block">
        <Logo size={44} />
        <h1 className="font-display text-3xl font-bold text-ink-50 mt-8 leading-tight">
          Ваши расчеты — <span className="text-gold-400">всегда под рукой</span>
        </h1>
        <ul className="mt-7 space-y-4">
          {[
            "Сохранение расчетов с полным snapshot курсов и тарифов",
            "История всех автомобилей и итоговых стоимостей",
            "PDF-отчет по каждому сохраненному расчету",
          ].map((t) => (
            <li key={t} className="flex items-start gap-3 text-[14px] text-ink-200 font-medium">
              <ShieldCheck size={18} className="text-ok-400 shrink-0 mt-0.5" /> {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-6 sm:p-8 max-w-md w-full mx-auto lg:mx-0">
        <div className="lg:hidden mb-6">
          <Logo />
        </div>
        <h2 className="font-display text-xl font-bold text-ink-50">Вход в аккаунт</h2>
        <p className="text-[13px] text-ink-300 mt-1.5">
          Расчет можно делать без регистрации — вход нужен только для сохранения.
        </p>

        {isDemo && (
          <div className="mt-4 rounded-xl border border-ink-600 bg-ink-800/70 p-3.5 text-[12px] text-ink-300 leading-relaxed">
            <Badge tone="gold" className="mb-1.5">DEMO</Badge>
            <p>
              Локальный режим: подойдет любой email и пароль, аккаунт создается автоматически. Роль администратора —{" "}
              <button className="text-gold-400 font-bold cursor-pointer" onClick={() => { setEmail("admin@autochina.ru"); setPassword("admin1234"); }}>
                admin@autochina.ru
              </button>
              {" "}(пароль admin1234).
            </p>
          </div>
        )}

        <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-4">
          <Field label="Email">
            <TextInput value={email} onChange={setEmail} placeholder="you@example.com" />
          </Field>
          <Field label="Пароль">
            <input
              type="password"
              className="w-full h-11 px-3.5 rounded-[10px] bg-ink-800 border border-ink-600 text-[15px] text-ink-50 placeholder:text-ink-400 outline-none focus:border-gold-500"
              value={password}
              placeholder="••••••••"
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <p className="text-[12.5px] font-semibold text-danger-400">{error}</p>}
          <Button size="lg" type="submit" disabled={busy} className="w-full">
            <LogIn size={18} /> {busy ? "Входим..." : "Войти"}
          </Button>
        </form>
        <p className="text-[12.5px] text-ink-400 text-center mt-5">
          <Link to="/calculator" className="text-gold-400 font-semibold hover:underline">
            Продолжить без входа →
          </Link>
        </p>
      </div>
    </div>
  );
}
