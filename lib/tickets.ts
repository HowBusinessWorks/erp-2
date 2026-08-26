/**
 * Logica pură a modulului de tichete: etichete, tonuri, validatori, formatări.
 * Fără acces la DB — o folosesc și acțiunile de server, și componentele de client.
 */

export type TicketUrgency = "scazuta" | "normala" | "ridicata" | "critica";

export type Tone = "neutral" | "blueprint" | "fill" | "warn" | "over";

/** Ordinea în care se oferă și se sortează urgențele: cea care arde, prima. */
export const URGENCY_ORDER: TicketUrgency[] = ["critica", "ridicata", "normala", "scazuta"];

export const URGENCY_LABELS: Record<TicketUrgency, string> = {
  scazuta: "Scăzută",
  normala: "Normală",
  ridicata: "Ridicată",
  critica: "Critică",
};

export const URGENCY_TONE: Record<TicketUrgency, Tone> = {
  scazuta: "neutral",
  normala: "blueprint",
  ridicata: "warn",
  critica: "over",
};

/** Dunga colorată din stânga cardului. */
export const URGENCY_BAR: Record<TicketUrgency, string> = {
  scazuta: "bg-rule-strong",
  normala: "bg-blueprint",
  ridicata: "bg-warn",
  critica: "bg-over",
};

export const STAGE_TONES: { value: Tone; label: string }[] = [
  { value: "neutral", label: "Neutru" },
  { value: "blueprint", label: "Albastru" },
  { value: "fill", label: "Verde" },
  { value: "warn", label: "Galben" },
  { value: "over", label: "Roșu" },
];

/** Punctul colorat din antetul coloanei — tonul etapei, redus la o culoare. */
export const TONE_DOT: Record<string, string> = {
  neutral: "bg-ink-3",
  blueprint: "bg-blueprint",
  fill: "bg-fill",
  warn: "bg-warn",
  over: "bg-over",
};

export function asTone(value: string | null | undefined): Tone {
  return value === "blueprint" || value === "fill" || value === "warn" || value === "over"
    ? value
    : "neutral";
}

export function asUrgency(value: string | null | undefined): TicketUrgency {
  return value === "scazuta" || value === "ridicata" || value === "critica" ? value : "normala";
}

/** Setul implicit propus când un contract nu are nicio etapă. */
export const DEFAULT_STAGES: { name: string; tone: Tone; isFinal: boolean }[] = [
  { name: "Primit", tone: "neutral", isFinal: false },
  { name: "În evaluare", tone: "blueprint", isFinal: false },
  { name: "Atribuit", tone: "blueprint", isFinal: false },
  { name: "În lucru", tone: "warn", isFinal: false },
  { name: "Verificare", tone: "warn", isFinal: false },
  { name: "Rezolvat", tone: "fill", isFinal: true },
  { name: "Anulat", tone: "neutral", isFinal: true },
];

export const DUE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Orice termen" },
  { value: "depasit", label: "Depășit" },
  { value: "azi", label: "Scadent azi" },
  { value: "7", label: "În 7 zile" },
  { value: "fara", label: "Fără termen" },
];

/* ───────────────────────── validatori ───────────────────────── */

export function validateTicket(v: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  if ((v.title ?? "").trim().length < 3) errors.title = "Titlul are nevoie de cel puțin 3 caractere.";
  if (!(v.contractId ?? "").trim()) errors.contractId = "Tichetul aparține unui contract.";
  return errors;
}

export function validateStage(v: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  if ((v.name ?? "").trim().length < 2) errors.name = "Numele etapei are nevoie de 2 caractere.";
  return errors;
}

export function validateTicketType(v: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  if ((v.name ?? "").trim().length < 2) errors.name = "Numele tipului are nevoie de 2 caractere.";
  return errors;
}

/* ───────────────────────── formatări ───────────────────────── */

/** „de 6 zile în etapa asta" — sub 2 zile e zgomot, deci întoarce null. */
export function daysIn(since: Date | string | null | undefined): number | null {
  if (!since) return null;
  const then = typeof since === "string" ? new Date(since) : since;
  const ms = Date.now() - then.getTime();
  if (Number.isNaN(ms)) return null;
  const days = Math.floor(ms / 86_400_000);
  return days >= 2 ? days : null;
}

/** Codul tichetului: TCK-0042. Se calculează în acțiune, din count. */
export function ticketCode(n: number): string {
  return `TCK-${String(n).padStart(4, "0")}`;
}

const DATE_FMT = new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "short" });

export function formatDay(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(`${value}T00:00:00`) : value;
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

/** Ziua de azi în format ISO, ca să se compare cu `dueDate` fără fus orar. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isOverdue(due: string | null | undefined): boolean {
  return Boolean(due) && due! < todayIso();
}

export function formatSize(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace(".", ",")} kB`;
  return `${(kb / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** „acum 2 ore", „acum 3 zile" — istoricul citit ca o frază, nu ca un timestamp. */
export function timeAgo(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 90) return "acum câteva momente";
  const m = Math.floor(s / 60);
  if (m < 60) return `acum ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `acum ${h} ${h === 1 ? "oră" : "ore"}`;
  const days = Math.floor(h / 24);
  if (days < 30) return `acum ${days} ${days === 1 ? "zi" : "zile"}`;
  const months = Math.floor(days / 30);
  return `acum ${months} ${months === 1 ? "lună" : "luni"}`;
}

export const EVENT_LABELS: Record<string, string> = {
  creat: "Tichet creat",
  mutat: "Mutat",
  atribuit: "Atribuire schimbată",
  comentariu: "Comentariu",
  document: "Document adăugat",
  camp: "Câmp modificat",
};
