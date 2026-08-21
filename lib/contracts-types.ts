/**
 * Contracte și obiective — etichete, derivări și VALIDATOARE PURE (PLAN.md §9.2, §9.3).
 *
 * Fișier pur, ca `lib/nomenclatoare-types.ts`: fără `lib/db`, deci îl poate importa și
 * asistentul din client. Principiul 4 din §9.0 — aceeași funcție păzește formularul și
 * server action-ul.
 *
 * Banii circulă aici ca **întregi, în bani** (regula 3 din CLAUDE.md). Nimic `float`.
 */

export type FormErrors = Record<string, string>;

/* ─────────────────────────── etichete ─────────────────────────── */

export const CONTRACT_KINDS = [
  { value: "mentenanta", label: "Mentenanță multianuală" },
  { value: "individual_deviz", label: "Individual — pe deviz" },
  { value: "individual_inversa", label: "Individual — cu taxare inversă" },
] as const;

export const COMPONENT_KINDS = [
  { value: "mentenanta", label: "Mentenanță" },
  { value: "lucrari", label: "Lucrări" },
  { value: "delta", label: "Delta" },
  { value: "individual", label: "Individual" },
] as const;

export const OBJECTIVE_KINDS = [
  { value: "statie", label: "Stație" },
  { value: "rezervor", label: "Rezervor" },
  { value: "gura_canal", label: "Gură de canal" },
  { value: "cladire_administrativa", label: "Clădire administrativă" },
  { value: "conducta", label: "Conductă" },
  { value: "put_forat", label: "Puț forat" },
  { value: "camin", label: "Cămin" },
  { value: "alt_tip", label: "Alt tip" },
] as const;

export const MONTH_NAMES = [
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
];

/**
 * §4.3 din documentul de business: contractul de mentenanță se rupe în trei.
 * Ponderile sunt punctul de plecare al asistentului, nu o lege — se ajustează la pasul 2.
 */
export const DEFAULT_COMPONENTS: {
  kind: string;
  name: string;
  revenuePercent: number;
  targetMarginPercent: number;
}[] = [
  { kind: "mentenanta", name: "Mentenanță curentă", revenuePercent: 60, targetMarginPercent: 25 },
  { kind: "lucrari", name: "Lucrări din abonament", revenuePercent: 30, targetMarginPercent: 25 },
  { kind: "delta", name: "Delta — venit suplimentar", revenuePercent: 10, targetMarginPercent: 25 },
];

/** Contractul individual n-are trei componente: are una singură, care ia tot. */
export const INDIVIDUAL_COMPONENT = {
  kind: "individual",
  name: "Execuție",
  revenuePercent: 100,
  targetMarginPercent: 25,
};

/* ─────────────────────── ajutoare pure ─────────────────────── */

function blank(v: string | undefined): boolean {
  return !v || v.trim() === "";
}

/** „1.234,56" sau „1234.56" -> număr. Doar pentru validare și pentru derivări în UI. */
export function numberOf(input: string | undefined): number {
  if (blank(input)) return 0;
  const cleaned = String(input)
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function req(v: Record<string, string>, e: FormErrors, field: string, message: string) {
  if (blank(v[field])) e[field] = message;
}

function percent(v: Record<string, string>, e: FormErrors, field: string, label: string) {
  if (blank(v[field])) return;
  const n = numberOf(v[field]);
  if (Number.isNaN(n)) e[field] = `${label} nu e un număr.`;
  else if (n < 0 || n > 100) e[field] = `${label} trebuie să fie între 0 și 100.`;
}

/* ─────────────────── derivarea plafoanelor (pasul 3) ─────────────────── */

export type ComponentDraft = {
  kind: string;
  name: string;
  revenuePercent: number;
  targetMarginPercent: number;
};

/**
 * Plafonul de COST al unei luni, în bani.
 *
 * `venit lunar × pondere × (100 − marjă)/100`. Cu marja implicită de 25% iese exact
 * regula din PROGRESS §5: plafonul de cost e 75% din venitul componentei.
 *
 * Rotunjire pe bani, la sfârșit — nu pe pași, ca să nu se piardă lei pe drum.
 */
export function monthlyCostCap(monthlyRevenue: number, c: ComponentDraft): number {
  const revenue = (monthlyRevenue * c.revenuePercent) / 100;
  return Math.round((revenue * (100 - c.targetMarginPercent)) / 100);
}

/** Cele 12 luni de contract care încep la `startDate`. `{ year, month }`, month 1–12. */
export function twelveMonths(startDate: string): { year: number; month: number }[] {
  const [y, m] = startDate.split("-").map(Number);
  if (!y || !m) return [];
  const out: { year: number; month: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const total = (m - 1) + i;
    out.push({ year: y + Math.floor(total / 12), month: (total % 12) + 1 });
  }
  return out;
}

/** Eticheta scurtă a unei luni de plafon: „mar 2026". */
export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? "?"} ${year}`;
}

/** Grila de plafoane pornită de la valoarea lunară: componentă × 12 luni, în bani. */
export function initialPlanGrid(
  startDate: string,
  monthlyRevenue: number,
  components: ComponentDraft[],
): number[][] {
  const months = twelveMonths(startDate);
  return components.map((c) => months.map(() => monthlyCostCap(monthlyRevenue, c)));
}

/* ─────────────────────── validatoare ─────────────────────── */

export function validateContract(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "code", "Codul contractului e obligatoriu.");
  req(v, e, "name", "Denumirea e obligatorie.");
  req(v, e, "firmId", "Alege firma care semnează.");
  req(v, e, "clientId", "Alege clientul.");
  req(v, e, "kind", "Alege tipul contractului.");
  req(v, e, "startDate", "Data de început e obligatorie.");
  req(v, e, "endDate", "Data de sfârșit e obligatorie.");
  if (!blank(v.startDate) && !blank(v.endDate) && v.endDate <= v.startDate) {
    e.endDate = "Sfârșitul contractului e înaintea începutului.";
  }

  const monthly = numberOf(v.monthlyValue);
  const total = numberOf(v.totalValue);
  if (Number.isNaN(monthly) || monthly < 0) e.monthlyValue = "Abonamentul nu e un număr valid.";
  if (Number.isNaN(total) || total < 0) e.totalValue = "Valoarea nu e un număr valid.";

  if (v.kind === "mentenanta" && !e.monthlyValue && monthly === 0) {
    // Fără abonament, panoul PM n-are din ce calcula plafoanele — pasul 3 iese pe zero.
    e.monthlyValue = "Un contract de mentenanță fără abonament lasă plafoanele pe zero.";
  }
  if (v.kind !== "mentenanta" && !e.totalValue && total === 0) {
    e.totalValue = "Un contract individual fără valoare n-are ce finanța.";
  }

  percent(v, e, "indexationPercent", "Indexarea");
  percent(v, e, "targetMarginPercent", "Marja țintă");
  if (!blank(v.paymentDays)) {
    const days = numberOf(v.paymentDays);
    if (Number.isNaN(days) || days < 0 || days > 365) {
      e.paymentDays = "Termenul de plată e în zile, între 0 și 365.";
    }
  }
  return e;
}

/** Pasul 2: suma ponderilor trebuie să dea 100. Altfel abonamentul se pierde pe drum. */
export function validateComponents(components: ComponentDraft[]): FormErrors {
  const e: FormErrors = {};
  if (components.length === 0) {
    e.components = "Un contract fără componente rupe panoul PM.";
    return e;
  }
  components.forEach((c, i) => {
    if (blank(c.name)) e[`component.${i}.name`] = "Denumirea componentei e obligatorie.";
    if (c.revenuePercent < 0 || c.revenuePercent > 100) {
      e[`component.${i}.revenuePercent`] = "Ponderea e între 0 și 100.";
    }
    if (c.targetMarginPercent < 0 || c.targetMarginPercent > 100) {
      e[`component.${i}.targetMarginPercent`] = "Marja e între 0 și 100.";
    }
  });
  const sum = components.reduce((s, c) => s + c.revenuePercent, 0);
  // Toleranță de o sutime: ponderile se scriu cu două zecimale.
  if (Math.abs(sum - 100) > 0.01) {
    e.components = `Ponderile însumează ${sum.toFixed(2)}%. Trebuie exact 100%.`;
  }
  return e;
}

export function validateObjective(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "code", "Codul obiectivului e obligatoriu.");
  req(v, e, "name", "Denumirea e obligatorie.");
  // Tipul nu e decorativ: operațiunile din catalog se filtrează pe el (PROGRESS §4, D4).
  req(v, e, "kind", "Tipul decide ce operațiuni se pot ruta pe obiectiv.");
  for (const [field, label, limit] of [
    ["lat", "Latitudinea", 90],
    ["lng", "Longitudinea", 180],
  ] as const) {
    if (blank(v[field])) continue;
    const n = numberOf(v[field]);
    if (Number.isNaN(n)) e[field] = `${label} nu e un număr.`;
    else if (Math.abs(n) > limit) e[field] = `${label} e în afara intervalului.`;
  }
  if (!blank(v.surface)) {
    const n = numberOf(v.surface);
    if (Number.isNaN(n) || n < 0) e.surface = "Suprafața nu e un număr valid.";
  }
  return e;
}

/** Arondarea unui obiectiv la contract (`contract_objectives`). */
export function validateContractObjective(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "objectiveId", "Alege obiectivul.");
  req(v, e, "fromDate", "De când intră obiectivul pe contract?");
  if (!blank(v.fromDate) && !blank(v.toDate) && v.toDate < v.fromDate) {
    e.toDate = "Ieșirea de pe contract e înaintea intrării.";
  }
  if (!blank(v.inspectionFrequencyMonths)) {
    const n = numberOf(v.inspectionFrequencyMonths);
    if (Number.isNaN(n) || n < 1 || n > 60) {
      e.inspectionFrequencyMonths = "Frecvența e în luni, între 1 și 60.";
    }
  }
  return e;
}

/** Anul contractual următor (`contract_years`) — §22.6. Anul curent nu se rescrie. */
export function validateContractYear(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "startDate", "Data de început a anului e obligatorie.");
  req(v, e, "endDate", "Data de sfârșit a anului e obligatorie.");
  if (!blank(v.startDate) && !blank(v.endDate) && v.endDate <= v.startDate) {
    e.endDate = "Anul contractual se termină înainte să înceapă.";
  }
  percent(v, e, "indexationPercent", "Indexarea");
  return e;
}
