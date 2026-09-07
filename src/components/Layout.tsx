import { useEffect, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Calculator, History, LayoutDashboard, User, LogOut } from "lucide-react";
import { useApp } from "../state/AppContext";
import { Badge, Button } from "./ui";

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#141821" stroke="#2a3242" />
        <path d="M8 21l3-9h10l3 9" stroke="#F2AE3C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="11.5" cy="22" r="1.9" fill="#F2AE3C" />
        <circle cx="20.5" cy="22" r="1.9" fill="#F2AE3C" />
        <path d="M13 12h6" stroke="#F2AE3C" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      </svg>
      <span className="leading-none">
        <span className="font-display font-bold text-[15px] tracking-tight text-ink-50 block">
          AUTO<span className="text-gold-500">·</span>CHINA
        </span>
        <span className="text-[10px] font-bold tracking-[0.22em] text-ink-400 uppercase">Calculator</span>
      </span>
    </span>
  );
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 px-3.5 h-10 rounded-[10px] text-[13.5px] font-semibold transition-colors cursor-pointer ${
    isActive ? "bg-ink-750 text-gold-400 border border-ink-600" : "text-ink-300 hover:text-ink-50 hover:bg-ink-800 border border-transparent"
  }`;

export default function Layout({ children }: { children: ReactNode }) {
  const { user, isDemo, signOut } = useApp();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-app flex flex-col">
      <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-900/85 backdrop-blur-md">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="shrink-0">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1.5">
            <NavLink to="/calculator" className={navCls}>
              <Calculator size={16} />
              <span className="hidden sm:inline">Калькулятор</span>
            </NavLink>
            <NavLink to="/calculations" className={navCls}>
              <History size={16} />
              <span className="hidden sm:inline">Мои расчеты</span>
            </NavLink>
            {user?.role === "admin" && (
              <NavLink to="/admin" className={navCls}>
                <LayoutDashboard size={16} />
                <span className="hidden sm:inline">Админ</span>
              </NavLink>
            )}
            {user ? (
              <div className="flex items-center gap-1.5 pl-1.5">
                <NavLink to="/profile" className={navCls}>
                  <User size={16} />
                  <span className="hidden md:inline max-w-[130px] truncate">{user.name}</span>
                </NavLink>
                <button
                  onClick={() => void signOut()}
                  className="p-2.5 rounded-[10px] text-ink-400 hover:text-danger-400 hover:bg-ink-800 transition-colors cursor-pointer"
                  title="Выйти"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <Link to="/login" className="ml-1.5">
                <Button size="sm" variant="outline">
                  Войти
                </Button>
              </Link>
            )}
          </nav>
        </div>
        {isDemo && (
          <div className="bg-gold-900/60 border-t border-gold-700/30">
            <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-1.5 flex items-center gap-2">
              <Badge tone="gold">DEMO DATA</Badge>
              <p className="text-[11.5px] text-gold-300/90 font-medium">
                Локальный демо-режим: данные хранятся в браузере, тарифы и курсы — демонстрационные. Подключите Supabase и Edge Functions для production.
              </p>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-ink-800 mt-16">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <Logo size={28} />
            <p className="text-[12px] text-ink-400 mt-3 max-w-md leading-relaxed">
              Расчет является предварительным и не является официальным таможенным расчетом. Итоговые платежи зависят от документов,
              таможенной стоимости, характеристик автомобиля и действующего законодательства.
            </p>
          </div>
          <div className="flex flex-col gap-1.5 text-[12.5px] text-ink-300 font-medium">
            <Link to="/calculator" className="hover:text-gold-400 transition-colors">Калькулятор</Link>
            <Link to="/calculations" className="hover:text-gold-400 transition-colors">Мои расчеты</Link>
            <Link to="/login" className="hover:text-gold-400 transition-colors">Вход</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
