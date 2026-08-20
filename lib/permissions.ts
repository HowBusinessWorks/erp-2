/**
 * SINGURA poartă de permisiuni din aplicație (CLAUDE.md, regula 5).
 *
 * În producție, o parte din astea trebuie să fie constrângeri de DATE, nu de ecran —
 * mai ales `preturi.vezi`. Vezi §10.3 și §21.8 din documentul de business și PLAN.md §7.
 * Aici sunt verificări în cod, ceea ce e suficient pentru prototip și demonstrabil pe ecran.
 */

export type Role =
  | "admin"
  | "pm"
  | "sef_santier"
  | "devizist"
  | "achizitii"
  | "magazie"
  | "flota"
  | "client";

export type Capability =
  /** vede lei oriunde: SL, pachete, devize, utilaje, registru de cost */
  | "preturi.vezi"
  | "contracte.vezi"
  | "contracte.editeaza"
  /** decizia de rutare mentenanță / Delta / lucrare / contract nou */
  | "cereri.decide"
  | "cost.vezi"
  | "cost.realoca"
  | "perioada.inchide"
  | "deviz.client.editeaza"
  | "deviz.intern.editeaza"
  | "pachete.gestioneaza"
  | "sl.verifica"
  | "sl.aproba"
  | "suplimentari.decide"
  | "stoc.vezi"
  | "stoc.opereaza"
  | "achizitii.gestioneaza"
  | "flota.gestioneaza"
  | "flota.solicita"
  | "teren.opereaza"
  | "raport.aproba"
  | "facturi.gestioneaza"
  | "nomenclatoare.editeaza";

const OFFICE_FINANCIAL: Capability[] = [
  "preturi.vezi",
  "contracte.vezi",
  "cost.vezi",
];

const MATRIX: Record<Role, Capability[]> = {
  admin: ["*" as Capability],

  pm: [
    ...OFFICE_FINANCIAL,
    "contracte.editeaza",
    "cereri.decide",
    "cost.realoca",
    "perioada.inchide",
    "deviz.client.editeaza",
    "deviz.intern.editeaza",
    "pachete.gestioneaza",
    "sl.aproba",
    "suplimentari.decide",
    "stoc.vezi",
    "achizitii.gestioneaza",
    "flota.solicita",
    "raport.aproba",
    "facturi.gestioneaza",
    "nomenclatoare.editeaza",
  ],

  /**
   * Șeful de șantier NU are `preturi.vezi`. Nicăieri: nici la situații de lucrări,
   * nici la utilaje, nici la stoc. Vede cantități, litri, ore — nu lei.
   */
  sef_santier: ["contracte.vezi", "sl.verifica", "teren.opereaza", "flota.solicita", "stoc.vezi"],

  devizist: [
    "preturi.vezi",
    "contracte.vezi",
    "deviz.client.editeaza",
    "deviz.intern.editeaza",
    "nomenclatoare.editeaza",
  ],

  achizitii: ["preturi.vezi", "stoc.vezi", "stoc.opereaza", "achizitii.gestioneaza", "nomenclatoare.editeaza"],

  magazie: ["stoc.vezi", "stoc.opereaza", "preturi.vezi"],

  flota: ["flota.gestioneaza", "preturi.vezi", "stoc.vezi"],

  /** clientul vede doar rapoartele lui, prin link — nimic din interior */
  client: [],
};

export function can(role: Role | undefined | null, capability: Capability): boolean {
  if (!role) return false;
  const caps = MATRIX[role];
  if (!caps) return false;
  if (caps.includes("*" as Capability)) return true;
  return caps.includes(capability);
}

/** Prescurtarea folosită cel mai des — de ea atârnă jumătate din ecrane. */
export function canSeePrices(role: Role | undefined | null): boolean {
  return can(role, "preturi.vezi");
}

/** Terenul e o interfață separată, nu aceleași ecrane cu mai puține butoane (§18.1.1). */
export function isFieldRole(role: Role | undefined | null): boolean {
  return role === "sef_santier";
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  pm: "Manager de proiect",
  sef_santier: "Șef de șantier",
  devizist: "Devizier",
  achizitii: "Achiziții",
  magazie: "Magazie",
  flota: "Manager de flotă",
  client: "Client",
};

/** Perspectivele pe care le poate încerca contul de admin, din bara de sus. */
export const PERSPECTIVES: { role: Role; label: string; hint: string }[] = [
  { role: "admin", label: "Administrator", hint: "vede tot" },
  { role: "pm", label: "Manager de proiect", hint: "contracte, plafoane, marjă, aprobări" },
  { role: "sef_santier", label: "Șef de șantier", hint: "teren — cantități, fără lei" },
  { role: "devizist", label: "Devizier", hint: "devize și articole normate" },
  { role: "achizitii", label: "Achiziții", hint: "comenzi, furnizori, lead-time" },
  { role: "magazie", label: "Magazie", hint: "gestiuni, recepții, consum" },
  { role: "flota", label: "Manager de flotă", hint: "utilaje, planificări, PV-uri" },
];
