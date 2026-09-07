import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export const D = (v: string | number | Decimal | null | undefined): Decimal => {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  try {
    if (v instanceof Decimal) return v;
    const s = String(v).replace(/\s/g, "").replace(",", ".");
    if (s === "" || isNaN(Number(s))) return new Decimal(0);
    return new Decimal(s);
  } catch {
    return new Decimal(0);
  }
};

export const round2 = (v: Decimal): string => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

const rubFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const rubFmt2 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const rateFmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** 1234567.8 -> "1 234 568 ₽" */
export const fmtRub = (v: string | number | Decimal | null | undefined): string =>
  `${rubFmt.format(Math.round(D(v).toNumber()))} ₽`;

export const fmtRub2 = (v: string | number | Decimal | null | undefined): string =>
  `${rubFmt2.format(D(v).toNumber())} ₽`;

export const fmtNum = (v: string | number | Decimal | null | undefined): string =>
  numFmt.format(Math.round(D(v).toNumber()));

export const fmtRate = (v: string | number | Decimal | null | undefined): string =>
  rateFmt.format(D(v).toNumber());

export const fmtCny = (v: string | number | Decimal | null | undefined): string =>
  `${numFmt.format(Math.round(D(v).toNumber()))} ¥`;

export const fmtPercent = (v: string | number | Decimal | null | undefined): string =>
  `${rateFmt.format(D(v).toNumber())}%`;

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ru-RU");
  } catch {
    return "—";
  }
};

export const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

/** parse user input like "3 000 000,50" into raw numeric string for storage */
export const parseAmount = (raw: string): string => {
  const s = raw.replace(/[^\d.,-]/g, "").replace(/\s/g, "").replace(",", ".");
  if (s === "" || s === "-" || s === "." || isNaN(Number(s))) return "";
  return s;
};

export const isPositive = (v: string | number | null | undefined): boolean => D(v).gt(0);
