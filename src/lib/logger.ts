/**
 * Легкое клиентское логирование ошибок: кольцевой буфер в localStorage
 * (последние 50 записей), доступен администратору в панели управления.
 * Никаких stack trace в интерфейсе пользователя.
 */
export interface LogEntry {
  ts: string;
  scope: string;
  message: string;
}

const KEY = "acc_error_log_v1";
const MAX = 50;

export const logError = (scope: string, err: unknown) => {
  try {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Неизвестная ошибка";
    const list = getLogs();
    list.unshift({ ts: new Date().toISOString(), scope, message });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* логирование не должно ломать приложение */
  }
  // eslint-disable-next-line no-console
  console.error(`[acc:${scope}]`, err);
};

export const getLogs = (): LogEntry[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LogEntry[]) : [];
  } catch {
    return [];
  }
};

export const clearLogs = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
};
