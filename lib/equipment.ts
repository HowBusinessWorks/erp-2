/**
 * Blocul C — resursele (utilaje, unelte, transporturi, PV).
 *
 * Aici stau etichetele și cele patru reguli care fac diferența față de un simplu
 * registru de mijloace fixe:
 *
 *  1. Revizia e scadentă pe DATĂ **sau** pe ORE de funcționare — care vine prima.
 *     Un utilaj care sapă 12 ore pe zi ajunge la revizie în trei săptămâni, nu în șase luni.
 *  2. Cât e imobilizat, utilajul NU produce cost de exploatare. Altfel plătești
 *     amortizare pentru un excavator care stă în service.
 *  3. Costul reparației se raportează la ORE, nu la zile.
 *  4. Șeful de șantier vede ore, litri și cantități — niciodată lei.
 */

import type { Bani } from "./money";

type Tone = "neutral" | "blueprint" | "fill" | "warn" | "over";

/* ───────────────────────────── etichete ───────────────────────────── */

export const EQUIPMENT_STATUS_LABEL: Record<string, string> = {
  disponibil: "Disponibil",
  service: "În service",
  indisponibil: "Indisponibil",
  casat: "Casat",
};

export const EQUIPMENT_STATUS_TONE: Record<string, Tone> = {
  disponibil: "fill",
  service: "warn",
  indisponibil: "over",
  casat: "neutral",
};

export const PLANNING_STATUS_LABEL: Record<string, string> = {
  planificata: "Planificată",
  in_derulare: "În derulare",
  incheiata: "Încheiată",
  anulata: "Anulată",
};

export const PLANNING_STATUS_TONE: Record<string, Tone> = {
  planificata: "blueprint",
  in_derulare: "warn",
  incheiata: "fill",
  anulata: "neutral",
};

export const REPAIR_KIND_LABEL: Record<string, string> = {
  interventie: "Intervenție",
  revizie: "Revizie",
  gresare: "Gresare",
  capitala: "Reparație capitală",
};

export const TOOL_STATUS_LABEL: Record<string, string> = {
  activ: "Activă",
  la_reparatii: "La reparații",
  casat: "Casată",
  pierdut: "Pierdută",
};

export const TOOL_STATUS_TONE: Record<string, Tone> = {
  activ: "fill",
  la_reparatii: "warn",
  casat: "neutral",
  pierdut: "over",
};

export const TRANSPORT_KIND_LABEL: Record<string, string> = {
  livrare_material: "Livrare material",
  transfer_santiere: "Transfer între șantiere",
  retur_magazie: "Retur la magazie",
  evacuare_moloz: "Evacuare moloz",
  transport_utilaj: "Transport utilaj",
};

export const TRANSPORT_STATUS_LABEL: Record<string, string> = {
  ceruta: "Cerută",
  planificata: "Planificată",
  efectuata: "Efectuată",
  anulata: "Anulată",
};

export const TRANSPORT_STATUS_TONE: Record<string, Tone> = {
  ceruta: "warn",
  planificata: "blueprint",
  efectuata: "fill",
  anulata: "neutral",
};

export const PV_STATUS_LABEL: Record<string, string> = {
  draft: "Ciornă",
  trimis: "Trimis",
  semnat: "Semnat",
};

export const PV_STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  trimis: "warn",
  semnat: "fill",
};

export const PROTOCOL_STATUS_LABEL: Record<string, string> = {
  deschis: "Deschis",
  inchis: "Închis",
};

/* ───────────────────────── scadențe și alerte ───────────────────────── */

export type Alert = {
  kind: "itp" | "rca" | "iscir" | "revizie_data" | "revizie_ore";
  label: string;
  /** zile până la scadență; negativ = depășit. La revizia pe ore, e null. */
  days: number | null;
  /** ore rămase până la revizie; negativ = depășit. La scadențele pe dată, e null. */
  hours: number | null;
  severity: "expirat" | "aproape";
};

function daysUntil(date: string | null, today: string): number | null {
  if (!date) return null;
  const a = Date.parse(date + "T00:00:00Z");
  const b = Date.parse(today + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

/**
 * Scadențele unui utilaj, inclusiv **revizia pe ore** (§18.1.7).
 *
 * Un utilaj poate fi în regulă calendaristic și totuși scadent la revizie pentru că
 * a lucrat 400 de ore în două luni. Cele două praguri se evaluează separat și se
 * raportează amândouă — nu se alege cel mai apropiat în tăcere.
 */
export function equipmentAlerts(
  eq: {
    itpExpiry: string | null;
    rcaExpiry: string | null;
    iscirExpiry: string | null;
    nextServiceDate: string | null;
    nextServiceHours: string | null;
    hourMeter: string | null;
  },
  today: string,
  opts: { warnDays?: number; warnHours?: number } = {},
): Alert[] {
  const warnDays = opts.warnDays ?? 30;
  const warnHours = opts.warnHours ?? 50;
  const out: Alert[] = [];

  const dated: [Alert["kind"], string, string | null][] = [
    ["itp", "ITP", eq.itpExpiry],
    ["rca", "RCA", eq.rcaExpiry],
    ["iscir", "ISCIR", eq.iscirExpiry],
    ["revizie_data", "Revizie (dată)", eq.nextServiceDate],
  ];
  for (const [kind, label, value] of dated) {
    const d = daysUntil(value, today);
    if (d === null || d > warnDays) continue;
    out.push({ kind, label, days: d, hours: null, severity: d < 0 ? "expirat" : "aproape" });
  }

  // Revizia pe ore: pragul e o citire de contor, nu o dată din calendar.
  if (eq.nextServiceHours != null && eq.hourMeter != null) {
    const remaining = Number(eq.nextServiceHours) - Number(eq.hourMeter);
    if (Number.isFinite(remaining) && remaining <= warnHours) {
      out.push({
        kind: "revizie_ore",
        label: "Revizie (ore)",
        days: null,
        hours: Math.round(remaining),
        severity: remaining < 0 ? "expirat" : "aproape",
      });
    }
  }

  return out.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "expirat" ? -1 : 1,
  );
}

/** Cât e imobilizat, utilajul nu produce cost de exploatare (§18.1.3). */
export function isImmobilized(eq: { immobilizedFrom: string | null }): boolean {
  return eq.immobilizedFrom !== null;
}

/**
 * Costul de exploatare pentru un număr de ore.
 *
 * Rata internă înseamnă amortizare + reparații + asigurări împărțite la orele
 * anuale. Fără ea, costul cu utilajul ar fi doar motorina — și fiecare lucrare
 * ar părea mai profitabilă decât e.
 */
export function operatingCost(internalHourlyRate: Bani, hours: number): Bani {
  return Math.round(internalHourlyRate * hours);
}

/* ───────────────────────── zile și intervale ───────────────────────── */

/** Suprapunerea a două intervale de planificare — inclusiv la capete. */
export function overlaps(
  a: { fromDate: string; toDate: string },
  b: { fromDate: string; toDate: string },
): boolean {
  return a.fromDate <= b.toDate && b.fromDate <= a.toDate;
}

/** Zilele dintre două date, cu ambele capete incluse. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Mută o dată cu n zile, păstrând formatul ISO scurt. */
export function shiftDate(date: string, days: number): string {
  const t = Date.parse(date + "T00:00:00Z");
  if (Number.isNaN(t)) return date;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Ziua de luni a săptămânii în care cade data — începutul benzii de calendar. */
export function startOfWeek(date: string): string {
  const t = Date.parse(date + "T00:00:00Z");
  if (Number.isNaN(t)) return date;
  const dow = (new Date(t).getUTCDay() + 6) % 7; // luni = 0
  return shiftDate(date, -dow);
}

const dayFormatter = new Intl.DateTimeFormat("ro-RO", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function formatDay(date: string | null): string {
  if (!date) return "—";
  const t = Date.parse(date + "T00:00:00Z");
  if (Number.isNaN(t)) return date;
  return dayFormatter.format(new Date(t));
}

const qtyFormatter = new Intl.NumberFormat("ro-RO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** Cantități — ore, litri, km. Se văd de toată lumea, spre deosebire de lei. */
export function formatQty(value: string | number | null | undefined, unit?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return unit ? `${qtyFormatter.format(n)} ${unit}` : qtyFormatter.format(n);
}
