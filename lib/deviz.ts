/**
 * Blocul A2 — devize, pachete, situații de lucrări, suplimentări, garanții.
 *
 * Patru reguli care nu se negociază, pentru că ele fac diferența față de orice soft
 * de devize de pe piață:
 *
 *  1. **Devizul client și devizul intern sunt documente diferite**, legate N:M. O
 *     poziție din oferta către client se poate executa din trei articole interne, iar
 *     un articol intern poate servi două poziții. Legătura are coeficient.
 *  2. **Materialele NU intră în pachetul de subcontractant.** Subcontractantul dă
 *     manoperă; materialul îl dă firma. Regula e impusă de sistem, nu lăsată la
 *     bunăvoința celui care compune pachetul (§8.3).
 *  3. **Cumulatul nu poate depăși cantitatea contractată.** O situație de lucrări
 *     care declară mai mult decât s-a contractat se blochează la introducere, nu la
 *     factură (§10.1).
 *  4. **Suplimentarea e atomică**: linia de deviz și linia de SL se creează în aceeași
 *     tranzacție, altfel apar situații facturabile fără acoperire în deviz (§10.2).
 */

import type { Bani } from "./money";

type Tone = "neutral" | "blueprint" | "fill" | "warn" | "over";

/* ───────────────────────────── etichete ───────────────────────────── */

export const DEVIZ_KIND_LABEL: Record<string, string> = {
  client: "Deviz client",
  intern: "Deviz intern",
};

export const DEVIZ_STATUS_LABEL: Record<string, string> = {
  draft: "Ciornă",
  trimis: "Trimis",
  acceptat: "Acceptat",
  respins: "Respins",
};

export const DEVIZ_STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  trimis: "warn",
  acceptat: "fill",
  respins: "over",
};

export const SL_STATUS_LABEL: Record<string, string> = {
  draft: "Ciornă",
  declarata: "Declarată",
  verificata: "Verificată",
  aprobata: "Aprobată",
  facturata: "Facturată",
};

export const SL_STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  declarata: "warn",
  verificata: "blueprint",
  aprobata: "fill",
  facturata: "fill",
};

/** Cele cinci cumulate din §10.1, în ordinea în care se citesc pe ecran. */
export const CUMULATIVE_LABELS = [
  { key: "contracted", label: "Contractat", hint: "cantitatea din pachet" },
  { key: "executed", label: "Executat", hint: "declarat de subcontractant, cumulat" },
  { key: "approved", label: "Aprobat", hint: "confirmat de noi, cumulat" },
  { key: "invoiced", label: "Facturat", hint: "intrat pe factură, cumulat" },
  { key: "remaining", label: "Rest", hint: "contractat − aprobat" },
] as const;

export const VERDICT_LABEL: Record<string, string> = {
  neverificat: "Neverificat",
  ok: "OK",
  suspect: "Suspect",
};

export const VERDICT_TONE: Record<string, Tone> = {
  neverificat: "neutral",
  ok: "fill",
  suspect: "over",
};

export const SUPPLEMENT_STATUS_LABEL: Record<string, string> = {
  propus: "Propusă",
  acceptat: "Acceptată",
  respins: "Respinsă",
};

export const PACKAGE_STATUS_LABEL: Record<string, string> = {
  draft: "Ciornă",
  trimis: "Trimis",
  acceptat: "Acceptat",
  incheiat: "Încheiat",
};

/* ───────────────────── materialele nu intră în pachet ───────────────────── */

/**
 * Categoriile care sunt material curat. O linie de deviz intern din categoriile astea
 * nu are ce căuta într-un pachet de subcontractant (§8.3).
 */
const MATERIAL_CATEGORIES = ["material", "materiale", "aprovizionare"];

/**
 * Poate linia asta să intre într-un pachet?
 *
 * Regula e simplă și absolută: dacă linia are preț de material și nu are manoperă,
 * e material. Materialul îl dă firma, subcontractantul dă manoperă. Un pachet care
 * conține material înseamnă că plătești de două ori aceeași țeavă — o dată la
 * furnizor și o dată în prețul subcontractantului.
 */
export function canEnterPackage(line: {
  category: string | null;
  materialUnitPrice: string | null;
  laborUnitPrice: string | null;
}): { allowed: boolean; reason: string } {
  const category = (line.category ?? "").toLowerCase();
  if (MATERIAL_CATEGORIES.some((c) => category.includes(c))) {
    return { allowed: false, reason: "Categoria e material — materialul îl dă firma." };
  }

  const material = Number(line.materialUnitPrice ?? 0);
  const labor = Number(line.laborUnitPrice ?? 0);

  if (labor <= 0 && material > 0) {
    return {
      allowed: false,
      reason: "Linia are doar material, fără manoperă. Subcontractantul dă manoperă.",
    };
  }
  if (labor <= 0) {
    return { allowed: false, reason: "Linia nu are manoperă, deci nu are ce subcontracta." };
  }

  return { allowed: true, reason: "" };
}

/* ───────────────── cumulatul nu depășește contractatul ───────────────── */

export type CumulativeCheck = {
  /** cumulat aprobat + ce se declară acum */
  wouldBe: number;
  contracted: number;
  /** depășire în cantitate; 0 dacă intră */
  over: number;
  blocked: boolean;
};

/**
 * Verificarea din §10.1, făcută la INTRODUCERE, nu la facturare.
 *
 * Motivul e practic: dacă afli la factură că s-au declarat 120 m² pe un pachet de
 * 100 m², ai deja o lună de discuții în urmă. La introducere, discuția e cu omul
 * care tocmai a scris cifra, iar ieșirea corectă e o suplimentare, nu o corecție.
 */
export function checkCumulative(line: {
  contractedQty: string | null;
  approvedCumulative: string | null;
  declaredQty: string | null;
}): CumulativeCheck {
  const contracted = Number(line.contractedQty ?? 0);
  const approved = Number(line.approvedCumulative ?? 0);
  const declared = Number(line.declaredQty ?? 0);
  const wouldBe = approved + declared;
  const over = Math.max(0, wouldBe - contracted);
  return { wouldBe, contracted, over, blocked: over > 0 };
}

/* ───────────────────────── trasabilitatea (§8.4) ───────────────────────── */

export type TraceSegment = {
  label: string;
  value: Bani;
  tone: "client" | "mapat" | "nemapat" | "pachet";
};

/**
 * Bara de trasabilitate: din valoarea devizului client, cât e acoperit de deviz
 * intern și cât din intern a intrat deja în pachete.
 *
 * Partea NEMAPATĂ e cea care contează. O poziție de client fără corespondent intern
 * înseamnă că ai ofertat ceva pentru care nu ai calculat costul — adică nu știi dacă
 * ai marjă pe ea sau pierzi bani.
 */
export function traceability(input: {
  clientTotal: Bani;
  mappedClientTotal: Bani;
  internalTotal: Bani;
  packagedTotal: Bani;
}) {
  const unmapped = Math.max(0, input.clientTotal - input.mappedClientTotal);
  return {
    ...input,
    unmapped,
    mappedPercent: input.clientTotal === 0 ? 0 : (input.mappedClientTotal / input.clientTotal) * 100,
    packagedPercent:
      input.internalTotal === 0 ? 0 : (input.packagedTotal / input.internalTotal) * 100,
    /** marja brută dintre ce ceri de la client și ce te costă intern */
    margin: input.clientTotal - input.internalTotal,
    marginPercent:
      input.clientTotal === 0
        ? 0
        : ((input.clientTotal - input.internalTotal) / input.clientTotal) * 100,
  };
}

/* ───────────────────────── calcule de deviz ───────────────────────── */

/** Valoarea unei linii de deviz intern: cele patru componente × cantitate. */
export function internalLineTotal(line: {
  quantity: string | null;
  materialUnitPrice: string | null;
  laborUnitPrice: string | null;
  equipmentUnitPrice: string | null;
  transportUnitPrice: string | null;
}): { material: number; labor: number; equipment: number; transport: number; total: number } {
  const q = Number(line.quantity ?? 0);
  const material = Number(line.materialUnitPrice ?? 0) * q;
  const labor = Number(line.laborUnitPrice ?? 0) * q;
  const equipment = Number(line.equipmentUnitPrice ?? 0) * q;
  const transport = Number(line.transportUnitPrice ?? 0) * q;
  return {
    material,
    labor,
    equipment,
    transport,
    total: material + labor + equipment + transport,
  };
}

/**
 * Indirectele și profitul se aplică pe TOTALUL devizului, ca pachet, nu pe fiecare
 * linie. Altfel o rotunjire pe linie se înmulțește cu numărul de linii.
 */
export function devizTotals(
  subtotal: Bani,
  overheadPercent: string | number | null,
  profitPercent: string | number | null,
) {
  const overhead = Math.round((subtotal * Number(overheadPercent ?? 0)) / 100);
  const profit = Math.round(((subtotal + overhead) * Number(profitPercent ?? 0)) / 100);
  return { subtotal, overhead, profit, total: subtotal + overhead + profit };
}

/* ───────────────────────── garanții (§10.4) ───────────────────────── */

export type RetentionBucket = {
  label: string;
  value: Bani;
  count: number;
};

/** Scadențarul: ce se eliberează acum, ce vine în 90 de zile, ce e mai departe. */
export function retentionSchedule(
  rows: { value: string | null; dueDate: string | null; releasedAt: Date | null }[],
  today: string,
  toBani: (v: string | null) => Bani,
): { scadente: RetentionBucket; curand: RetentionBucket; mai_tarziu: RetentionBucket; eliberate: RetentionBucket } {
  const buckets = {
    scadente: { label: "Scadente acum", value: 0, count: 0 },
    curand: { label: "În 90 de zile", value: 0, count: 0 },
    mai_tarziu: { label: "Mai târziu", value: 0, count: 0 },
    eliberate: { label: "Eliberate", value: 0, count: 0 },
  };

  const horizon = new Date(Date.parse(today + "T00:00:00Z") + 90 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  for (const r of rows) {
    const value = toBani(r.value);
    if (r.releasedAt) {
      buckets.eliberate.value += value;
      buckets.eliberate.count += 1;
    } else if (!r.dueDate || r.dueDate <= today) {
      buckets.scadente.value += value;
      buckets.scadente.count += 1;
    } else if (r.dueDate <= horizon) {
      buckets.curand.value += value;
      buckets.curand.count += 1;
    } else {
      buckets.mai_tarziu.value += value;
      buckets.mai_tarziu.count += 1;
    }
  }

  return buckets;
}
