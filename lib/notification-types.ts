/**
 * Partea pură a semnalelor — tipuri și etichete, fără nicio interogare.
 *
 * `NotificationBell.tsx` e componentă de client. Dacă ar importa din `lib/notifications.ts`,
 * Turbopack ar trage `postgres` în pachetul de browser și tot shell-ul ar da 500 — exact
 * accidentul din blocul B, rezolvat atunci cu `lib/routing-types.ts`. `tsc` nu-l prinde.
 */

export type SignalKind =
  | "buget_80"
  | "delta_neumpluta"
  | "sl_de_aprobat"
  | "pv_deschis"
  | "revizie_scadenta"
  | "contract_expira"
  | "stoc_minim"
  | "solicitare_utilaj";

export type Severity = "info" | "atentie" | "critic";

export type Signal = {
  kind: SignalKind;
  title: string;
  body?: string;
  href: string;
  severity: Severity;
};

export const SIGNAL_LABEL: Record<SignalKind, string> = {
  buget_80: "Buget",
  delta_neumpluta: "Delta",
  sl_de_aprobat: "Situații",
  pv_deschis: "PV",
  revizie_scadenta: "Revizii",
  contract_expira: "Contracte",
  stoc_minim: "Stoc",
  solicitare_utilaj: "Utilaje",
};

export const SEVERITY_ORDER: Record<Severity, number> = { critic: 0, atentie: 1, info: 2 };
