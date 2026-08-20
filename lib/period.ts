export const MONTHS = [
  "ianuarie",
  "februarie",
  "martie",
  "aprilie",
  "mai",
  "iunie",
  "iulie",
  "august",
  "septembrie",
  "octombrie",
  "noiembrie",
  "decembrie",
] as const;

export const MONTHS_SHORT = [
  "ian",
  "feb",
  "mar",
  "apr",
  "mai",
  "iun",
  "iul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

export type Period = { year: number; month: number };

export function currentPeriod(): Period {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Citește ?an=&luna= din URL, cu luna curentă ca implicit. */
export function periodFromParams(params: { an?: string; luna?: string }): Period {
  const now = currentPeriod();
  const year = Number(params.an);
  const month = Number(params.luna);
  return {
    year: Number.isFinite(year) && year > 2000 ? year : now.year,
    month: Number.isFinite(month) && month >= 1 && month <= 12 ? month : now.month,
  };
}

export function shiftPeriod({ year, month }: Period, delta: number): Period {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function labelPeriod({ year, month }: Period): string {
  return `${MONTHS[month - 1]} ${year}`;
}

/** Ultimele n perioade, cea mai veche prima. */
export function lastPeriods(n: number, from: Period = currentPeriod()): Period[] {
  const out: Period[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftPeriod(from, -i));
  return out;
}

export function monthRange({ year, month }: Period): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  return { from, to: `${year}-${String(month).padStart(2, "0")}-${last}` };
}
