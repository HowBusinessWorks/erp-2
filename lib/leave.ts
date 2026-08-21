/**
 * Concedii — partea pură.
 *
 * Fișierul ăsta NU importă `lib/db`. Se importă și din componente de client
 * (wizardul de concediu calculează zilele în timp ce omul mișcă datele), iar
 * accidentul care se repetă e exact ăsta: un `lib/` cu `postgres` în spate ajunge
 * în pachetul de browser și cade tot blocul. Vezi PROGRESS.md §5.
 */

export type LeaveKind = "odihna" | "medical" | "fara_plata" | "eveniment_familial";
export type LeaveState = "ceruta" | "aprobata" | "respinsa" | "anulata";

export const LEAVE_KIND_LABEL: Record<LeaveKind, string> = {
  odihna: "Odihnă",
  medical: "Medical",
  fara_plata: "Fără plată",
  eveniment_familial: "Eveniment familial",
};

export const LEAVE_KIND_HINT: Record<LeaveKind, string> = {
  odihna: "Din zilele de concediu pe an",
  medical: "Cu certificat de la medic",
  fara_plata: "Nu scade din zilele pe an",
  eveniment_familial: "Nuntă, deces, naștere",
};

export const LEAVE_STATE_LABEL: Record<LeaveState, string> = {
  ceruta: "În aprobare",
  aprobata: "Aprobat",
  respinsa: "Respins",
  anulata: "Anulat",
};

/** Doar odihna consumă din cele 21 de zile. Restul se evidențiază, nu se scad. */
export function consumesQuota(kind: LeaveKind): boolean {
  return kind === "odihna";
}

/**
 * Sărbătorile legale din România, pe zi fixă. Paștele ortodox e mobil, deci
 * intră cu datele lui pentru anii pe care îi acoperă prototipul — o formulă
 * pascală întreagă ar fi mai mult cod decât adevăr aici.
 */
const FIXED_HOLIDAYS = [
  "01-01", "01-02", "01-06", "01-07", "01-24",
  "05-01", "06-01", "08-15", "11-30", "12-01", "12-25", "12-26",
];

const EASTER_HOLIDAYS: Record<number, string[]> = {
  2025: ["04-18", "04-20", "04-21", "06-08", "06-09"],
  2026: ["04-10", "04-12", "04-13", "05-31", "06-01"],
  2027: ["04-30", "05-02", "05-03", "06-20", "06-21"],
  2028: ["04-14", "04-16", "04-17", "06-04", "06-05"],
};

export function isHoliday(iso: string): boolean {
  const year = Number(iso.slice(0, 4));
  const md = iso.slice(5);
  return FIXED_HOLIDAYS.includes(md) || (EASTER_HOLIDAYS[year] ?? []).includes(md);
}

/** Zilele lucrătoare din interval, inclusiv capetele. Weekendul și sărbătorile nu se scad. */
export function workingDaysBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let days = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (isHoliday(cursor.toISOString().slice(0, 10))) continue;
    days += 1;
  }
  return days;
}

/** Prima zi lucrătoare de după interval — „revin la lucru pe". */
export function nextWorkingDay(to: string): string {
  const cursor = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime())) return to;
  do {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  } while (
    cursor.getUTCDay() === 0 ||
    cursor.getUTCDay() === 6 ||
    isHoliday(cursor.toISOString().slice(0, 10))
  );
  return cursor.toISOString().slice(0, 10);
}

export type LeaveRow = {
  kind: string;
  status: string;
  workingDays: number;
  fromDate: string;
};

export type LeaveBalance = {
  entitled: number;
  taken: number;
  pending: number;
  remaining: number;
};

/**
 * Soldul anului. `pending` se scade din rămas: dacă omul are 3 zile cerute și
 * neaprobate, nu are voie să vadă că mai are 14 și să mai ceară încă 14.
 */
export function leaveBalance(rows: LeaveRow[], entitled: number, year: number): LeaveBalance {
  let taken = 0;
  let pending = 0;
  for (const row of rows) {
    if (Number(row.fromDate.slice(0, 4)) !== year) continue;
    if (!consumesQuota(row.kind as LeaveKind)) continue;
    if (row.status === "aprobata") taken += row.workingDays;
    else if (row.status === "ceruta") pending += row.workingDays;
  }
  return { entitled, taken, pending, remaining: entitled - taken - pending };
}

const MONTHS = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

/** „3–7 septembrie" sau „29 august – 2 septembrie". Cum ar scrie omul pe hârtie. */
export function formatRange(from: string, to: string): string {
  const [, fm, fd] = from.split("-").map(Number);
  const [, tm, td] = to.split("-").map(Number);
  if (fm === tm) {
    return fd === td ? `${fd} ${MONTHS[fm - 1]}` : `${fd}–${td} ${MONTHS[tm - 1]}`;
  }
  return `${fd} ${MONTHS[fm - 1]} – ${td} ${MONTHS[tm - 1]}`;
}

export function formatDayLong(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
