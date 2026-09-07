import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { X, AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";

/* ---------- Button ---------- */
export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "ghost" | "danger" | "dark";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold rounded-[10px] transition-all duration-200 select-none whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] cursor-pointer";
  const sizes = {
    sm: "text-[13px] px-3.5 h-9",
    md: "text-sm px-5 h-11",
    lg: "text-[15px] px-7 h-[52px]",
  };
  const variants = {
    primary:
      "bg-gold-500 text-ink-950 hover:bg-gold-400 shadow-[0_8px_24px_-10px_rgba(242,174,60,0.55)]",
    outline: "border border-ink-500 text-ink-100 hover:border-gold-500 hover:text-gold-400",
    ghost: "text-ink-200 hover:text-ink-50 hover:bg-ink-750",
    danger: "border border-danger-500/40 text-danger-400 hover:bg-danger-900",
    dark: "bg-ink-700 text-ink-100 hover:bg-ink-600 border border-ink-600",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

/* ---------- Field ---------- */
export function Field({
  label,
  children,
  hint,
  warning,
  suffix,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  warning?: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="flex items-center justify-between text-[12.5px] font-semibold text-ink-300 mb-1.5">
        <span>{label}</span>
        {suffix && <span className="text-ink-400 font-medium">{suffix}</span>}
      </span>
      {children}
      {warning ? (
        <span className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-gold-400">
          <AlertTriangle size={13} /> {warning}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-[12px] text-ink-400">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputCls = (warning?: boolean) =>
  `w-full h-11 px-3.5 rounded-[10px] bg-ink-800 border text-[15px] tnum text-ink-50 placeholder:text-ink-400 outline-none transition-colors focus:border-gold-500 ${
    warning ? "border-gold-600/70 bg-gold-900/20" : "border-ink-600"
  }`;

export function TextInput({
  value,
  onChange,
  placeholder,
  warning,
  inputMode,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  warning?: boolean;
  inputMode?: "decimal" | "numeric" | "text";
  maxLength?: number;
}) {
  return (
    <input
      className={inputCls(warning)}
      value={value}
      placeholder={placeholder}
      inputMode={inputMode ?? "text"}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select className={`${inputCls()} cursor-pointer appearance-none`} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ---------- Money input ---------- */
export function MoneyInput({
  value,
  onChange,
  suffix,
  placeholder = "0",
  warning,
  big,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix: "₽" | "¥" | "€";
  placeholder?: string;
  warning?: boolean;
  big?: boolean;
}) {
  return (
    <div className="relative">
      <input
        className={`${warning ? inputCls(true) : inputCls()} pr-10 ${big ? "h-14 text-lg font-bold" : ""}`}
        value={value}
        placeholder={placeholder}
        inputMode="decimal"
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d\s.,]/g, "");
          onChange(v);
        }}
      />
      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 font-bold text-[15px] pointer-events-none">
        {suffix}
      </span>
    </div>
  );
}

/* ---------- Switch ---------- */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 group cursor-pointer text-left"
    >
      <span
        className={`relative w-11 h-6.5 rounded-full transition-colors shrink-0 ${checked ? "bg-gold-500" : "bg-ink-600"}`}
      >
        <span
          className={`absolute top-0.5 w-5.5 h-5.5 rounded-full bg-ink-950 transition-all duration-200 ${
            checked ? "left-[22px]" : "left-0.5 bg-ink-300"
          }`}
        />
      </span>
      <span className="text-sm font-semibold text-ink-100 group-hover:text-gold-400 transition-colors">{label}</span>
    </button>
  );
}

/* ---------- Badge ---------- */
export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "gold" | "ok" | "danger" | "eur" | "cny";
  className?: string;
}) {
  const tones = {
    neutral: "bg-ink-700 text-ink-200 border-ink-600",
    gold: "bg-gold-900 text-gold-400 border-gold-700/50",
    ok: "bg-ok-900 text-ok-400 border-ok-500/30",
    danger: "bg-danger-900 text-danger-400 border-danger-500/30",
    eur: "bg-eur-500/10 text-eur-500 border-eur-500/25",
    cny: "bg-cny-500/10 text-cny-500 border-cny-500/25",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 h-6 rounded-md border text-[11.5px] font-bold tracking-wide ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${wide ? "max-w-3xl" : "max-w-lg"} card rounded-t-2xl sm:rounded-2xl p-6 max-h-[88vh] overflow-y-auto anim-fade-up`}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-lg font-semibold text-ink-50">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-ink-700 text-ink-300 cursor-pointer" aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Toasts ---------- */
export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-[60] flex flex-col gap-2 sm:w-[380px]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in flex items-start gap-3 px-4 py-3.5 rounded-xl border shadow-xl backdrop-blur bg-ink-850/95 ${
              t.kind === "success" ? "border-ok-500/40" : t.kind === "error" ? "border-danger-500/40" : "border-ink-500"
            }`}
          >
            {t.kind === "success" ? (
              <CheckCircle2 size={19} className="text-ok-400 shrink-0 mt-0.5" />
            ) : t.kind === "error" ? (
              <AlertTriangle size={19} className="text-danger-400 shrink-0 mt-0.5" />
            ) : (
              <Info size={19} className="text-eur-500 shrink-0 mt-0.5" />
            )}
            <p className="text-[13.5px] font-medium text-ink-100 leading-snug">{t.text}</p>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Misc ---------- */
export function Spinner({ size = 18 }: { size?: number }) {
  return <Loader2 size={size} className="spin text-gold-400" />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-display text-[17px] sm:text-lg font-semibold text-ink-50">{children}</h2>
      {sub && <p className="text-[13px] text-ink-300 mt-1">{sub}</p>}
    </div>
  );
}

export function Stat({ label, value, accent, sub }: { label: string; value: ReactNode; accent?: boolean; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-400">{label}</p>
      <p className={`font-display text-xl sm:text-2xl font-bold mt-1.5 tnum ${accent ? "text-gold-400" : "text-ink-50"}`}>{value}</p>
      {sub && <p className="text-[12px] text-ink-300 mt-1">{sub}</p>}
    </div>
  );
}
