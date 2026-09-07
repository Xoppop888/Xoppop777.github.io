import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, LogOut, History, CalendarDays } from "lucide-react";
import { useApp } from "../state/AppContext";
import { db } from "../lib/db";
import { Button, Badge, Skeleton, useToast } from "../components/ui";
import { fmtDate } from "../lib/money";

export default function ProfilePage() {
  const { user, authReady, signOut } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    void db.listCalculations(user.id).then((l) => setCount(l.length));
  }, [user]);

  if (!authReady) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-14 space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <User size={30} className="text-ink-500 mx-auto mb-4" />
        <h1 className="font-display text-xl font-bold text-ink-50">Вы не вошли в аккаунт</h1>
        <p className="text-[13.5px] text-ink-300 mt-2">Войдите, чтобы видеть профиль и сохраненные расчеты.</p>
        <Link to="/login">
          <Button className="mt-6">Войти</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-gold-400">Профиль</p>
      <div className="card p-6 sm:p-8 mt-4">
        <div className="flex items-start gap-5">
          <span className="w-16 h-16 rounded-2xl bg-gold-900 border border-gold-700/40 flex items-center justify-center font-display text-2xl font-bold text-gold-400 shrink-0">
            {(user.name || user.email)[0]?.toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-display text-xl font-bold text-ink-50 truncate">{user.name}</h1>
              <Badge tone={user.role === "admin" ? "gold" : "neutral"}>{user.role === "admin" ? "Администратор" : "Пользователь"}</Badge>
            </div>
            <p className="text-[13.5px] text-ink-300 font-medium mt-1">{user.email}</p>
            <p className="flex items-center gap-1.5 text-[12px] text-ink-400 font-medium mt-2">
              <CalendarDays size={13} /> в сервисе с {fmtDate(user.created_at)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-7">
          <div className="rounded-xl border border-ink-700 bg-ink-800/60 p-4">
            <p className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-wider text-ink-400">
              <History size={13} /> Сохраненные расчеты
            </p>
            <p className="font-display text-2xl font-bold text-ink-50 tnum mt-1.5">{count === null ? "…" : count}</p>
          </div>
          <div className="rounded-xl border border-ink-700 bg-ink-800/60 p-4">
            <p className="text-[11.5px] font-bold uppercase tracking-wider text-ink-400">Доступ</p>
            <p className="font-display text-2xl font-bold text-ink-50 mt-1.5">{user.role === "admin" ? "Админ-панель" : "Стандартный"}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-7">
          <Link to="/calculations" className="flex-1">
            <Button variant="outline" className="w-full">
              <History size={16} /> Мои расчеты
            </Button>
          </Link>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => {
              void signOut();
              toast("info", "Вы вышли из аккаунта");
              navigate("/");
            }}
          >
            <LogOut size={16} /> Выйти
          </Button>
        </div>
      </div>
    </div>
  );
}
