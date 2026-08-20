/**
 * Partea pură a rutării (§7) — tipuri și etichete, fără acces la bază.
 *
 * Stă separat de `routing.ts` pentru că `RoutingForm.tsx` e componentă de client:
 * dacă ar importa din modulul cu interogări, `postgres` ar ajunge în pachetul de browser.
 */

import type { Bani } from "./money";

export type RoutingDecision =
  | "interventie_mentenanta"
  | "lucrare_delta"
  | "lucrare_componenta"
  | "contract_nou";

export const ROUTING_LABELS: Record<RoutingDecision, string> = {
  interventie_mentenanta: "Intervenție pe mentenanță",
  lucrare_delta: "Lucrare finanțată din Delta",
  lucrare_componenta: "Lucrare pe componenta Lucrări",
  contract_nou: "Contract nou / ofertă separată",
};

export const ROUTING_EFFECT: Record<RoutingDecision, string> = {
  interventie_mentenanta:
    "Consumă plafonul de cost al mentenanței. Nu aduce venit suplimentar — sub prag, e mai ieftin decât birocrația unei lucrări.",
  lucrare_delta:
    "Umple Delta lunii. Aduce venit peste abonament. Ce nu se umple până la 31 e venit pierdut, nu se reportează.",
  lucrare_componenta:
    "Consumă plafonul anual al componentei Lucrări, defalcat lunar. Venitul e deja în abonament.",
  contract_nou:
    "Iese din abonament. Se ofertează separat, cu deviz client și contract propriu.",
};

export type RoutingBranch = {
  decision: RoutingDecision;
  /** recomandarea sistemului */
  recommended: boolean;
  /** de ce da sau de ce nu — se afișează lângă buton */
  reason: string;
  /** ramura e posibilă? Delta plină înseamnă că nu e */
  possible: boolean;
  /** componenta pe care ar ateriza finanțarea */
  componentId: string | null;
};

export type RoutingContext = {
  contractId: string;
  contractCode: string;
  estimated: Bani;
  threshold: Bani;
  /** Delta lunii: plafon, umplut, liber */
  delta: { componentId: string; cap: Bani; filled: Bani; free: Bani } | null;
  works: { componentId: string; cap: Bani; used: Bani; free: Bani } | null;
  maintenance: { componentId: string; cap: Bani; used: Bani; free: Bani } | null;
  branches: RoutingBranch[];
  suggestion: RoutingDecision;
};
