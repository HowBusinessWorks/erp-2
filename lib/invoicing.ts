/**
 * Facturarea către client — partea de calcul.
 *
 * Cât de puțin e aici e intenționat. Factura nu inventează nicio cifră: abonamentul
 * vine din anul de contract (indexat la aniversare, §4.1), TVA-ul e o înmulțire, iar
 * scadența e data emiterii plus zilele de plată din contract. Tot ce ar mai putea fi
 * calculat aici — e-Factura, trimiterea în SPV, sincronizarea cu Saga — e schelet
 * declarat, nu cod care se preface. Vezi `/integrari` și `PLAN.md` §7.
 */

import { monthlySubscription } from "./budget";
import { type Bani, percentOf } from "./money";

type Tone = "neutral" | "blueprint" | "fill" | "warn" | "over";

export const VAT_PERCENT = 19;

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  emisa: "Emisă",
  trimisa: "Trimisă",
  incasata: "Încasată",
};

export const INVOICE_STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  emisa: "blueprint",
  trimisa: "warn",
  incasata: "fill",
};

/** Statusul din e-Factura. `null` = neatins de conector, pentru că nu există conector. */
export const EFACTURA_LABEL: Record<string, string> = {
  in_asteptare: "În așteptare SPV",
  trimis: "Acceptat SPV",
  respins: "Respins SPV",
};

export function vatOf(net: Bani): Bani {
  return percentOf(net, VAT_PERCENT);
}

/** Abonamentul lunii, din anul de contract corect. Nu din `contracts.monthlyValue`. */
export async function subscriptionFor(
  contractId: string,
  year: number,
  month: number,
): Promise<Bani> {
  return monthlySubscription(contractId, year, month);
}

/**
 * Vechimea unei creanțe. Nu e un raport de aging complet — e răspunsul la singura
 * întrebare care contează dimineața: cine a trecut de scadență și de câte zile.
 */
export function daysOverdue(dueDate: string, today: string): number {
  const a = Date.parse(dueDate + "T00:00:00Z");
  const b = Date.parse(today + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export type AgingBucket = "in_termen" | "0_30" | "31_60" | "peste_60";

export const AGING_LABEL: Record<AgingBucket, string> = {
  in_termen: "În termen",
  "0_30": "1–30 zile",
  "31_60": "31–60 zile",
  peste_60: "peste 60 zile",
};

export function agingBucket(dueDate: string, today: string): AgingBucket {
  const d = daysOverdue(dueDate, today);
  if (d <= 0) return "in_termen";
  if (d <= 30) return "0_30";
  if (d <= 60) return "31_60";
  return "peste_60";
}
