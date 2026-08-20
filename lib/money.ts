/**
 * Banii, peste tot în aplicație, sunt un ÎNTREG în bani (1 leu = 100).
 * În Postgres stau ca numeric(14,2), pe care driverul îl dă ca string.
 * Conversia se face doar aici. Niciodată `float` — vezi CLAUDE.md, regula 3.
 */

export type Bani = number;

/** numeric(14,2) din Postgres -> bani */
export function fromDb(value: string | number | null | undefined): Bani {
  if (value === null || value === undefined || value === "") return 0;
  const s = String(value);
  const negative = s.trim().startsWith("-");
  const [whole, frac = ""] = s.trim().replace("-", "").split(".");
  const bani = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -bani : bani;
}

/** bani -> string pentru numeric(14,2) */
export function toDb(bani: Bani): string {
  const negative = bani < 0;
  const abs = Math.abs(Math.round(bani));
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${s}` : s;
}

/** ce scrie omul în formular ("1.234,56" sau "1234.56") -> bani */
export function parseInput(input: string): Bani {
  const cleaned = input.trim().replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

const leiFormatter = new Intl.NumberFormat("ro-RO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const leiCompactFormatter = new Intl.NumberFormat("ro-RO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 8333300 -> "83.333,00" */
export function format(bani: Bani): string {
  return leiFormatter.format(bani / 100);
}

/** 8333300 -> "83.333" — pentru tabele dense, unde bănuții sunt zgomot */
export function formatShort(bani: Bani): string {
  return leiCompactFormatter.format(Math.round(bani / 100));
}

/** 8333300 -> "83.333 lei" */
export function formatLei(bani: Bani, opts: { short?: boolean } = {}): string {
  return `${opts.short === false ? format(bani) : formatShort(bani)} lei`;
}

export function sum(values: Bani[]): Bani {
  return values.reduce((acc, v) => acc + v, 0);
}

/** procent aplicat pe o sumă, rotunjit la ban */
export function percentOf(bani: Bani, percent: number): Bani {
  return Math.round((bani * percent) / 100);
}

/** cât la sută e `part` din `whole`; 0 dacă whole e 0 */
export function ratio(part: Bani, whole: Bani): number {
  if (whole === 0) return 0;
  return (part / whole) * 100;
}

/** cantitate (poate fi fracționară) × preț unitar în bani */
export function multiplyQty(bani: Bani, qty: number): Bani {
  return Math.round(bani * qty);
}
