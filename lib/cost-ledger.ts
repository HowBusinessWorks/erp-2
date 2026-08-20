/**
 * SINGURUL loc care scrie în `cost_entries` (CLAUDE.md, regula 1; documentul de business P3).
 *
 * Dacă un modul nou are nevoie să înregistreze un cost, cheamă `recordCost` cu un
 * `documentType` nou. Nu face `insert` paralel — de asta depinde faptul că toate
 * rapoartele se leagă între ele.
 */

import { and, eq, inArray, isNotNull, ne, sql as raw } from "drizzle-orm";

import { db } from "./db";
import {
  contractComponents,
  costEntries,
  fundingAllocations,
  periods,
  reallocations,
  workUnits,
} from "./db/schema";
import { fromDb, toDb, type Bani } from "./money";

type CostType =
  | "material"
  | "manopera"
  | "servicii_subc"
  | "utilaj"
  | "motorina"
  | "transport"
  | "reparatii"
  | "alte";

type CostStage = "angajat" | "receptionat" | "consumat" | "facturat";

export type CostInput = {
  firmId: string;
  documentDate: Date | string;
  /** luna de raportare; implicit = data documentului (§11) */
  effectDate?: Date | string;

  // analitica „folosit" — unde s-a întâmplat fizic munca
  objectiveId?: string | null;
  workUnitId?: string | null;
  stageId?: string | null;
  usedContractId?: string | null;
  usedComponentId?: string | null;

  // analitica „descărcat" — cine plătește. Implicit = folosit.
  chargedContractId?: string | null;
  chargedComponentId?: string | null;
  /** obligatoriu când descărcat ≠ folosit */
  splitReason?: string | null;

  costType: CostType;
  stage: CostStage;
  value: Bani;
  quantity?: number | null;
  unit?: string | null;
  productId?: string | null;
  qualification?: string | null;

  documentType: string;
  documentId?: string | null;
  supplierId?: string | null;
  note?: string | null;
  createdBy?: string | null;
};

function asDateString(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/**
 * Scrie o linie în registru.
 *
 * Dacă unitatea de lucru are alocări de finanțare active și nu s-a dat explicit
 * analitica „descărcat", o deduce din alocarea activă — asta e ce face ca banii să
 * ajungă singuri pe componenta corectă (P2).
 */
export async function recordCost(input: CostInput) {
  const documentDate = asDateString(input.documentDate);
  const effectDate = asDateString(input.effectDate ?? input.documentDate);

  let charged = {
    contractId: input.chargedContractId ?? input.usedContractId ?? null,
    componentId: input.chargedComponentId ?? input.usedComponentId ?? null,
  };

  if (!charged.componentId && input.workUnitId) {
    const allocation = await activeAllocationFor(input.workUnitId);
    if (allocation) {
      charged = { contractId: allocation.contractId, componentId: allocation.componentId };
    }
  }

  const splitsAnalytics =
    charged.componentId !== null &&
    input.usedComponentId != null &&
    charged.componentId !== input.usedComponentId;

  if (splitsAnalytics && !input.splitReason) {
    throw new Error(
      'Când analitica „descărcat” diferă de „folosit”, motivul e obligatoriu (§12).',
    );
  }

  const [row] = await db
    .insert(costEntries)
    .values({
      firmId: input.firmId,
      documentDate,
      effectDate,
      objectiveId: input.objectiveId ?? null,
      workUnitId: input.workUnitId ?? null,
      stageId: input.stageId ?? null,
      usedContractId: input.usedContractId ?? null,
      usedComponentId: input.usedComponentId ?? null,
      chargedContractId: charged.contractId,
      chargedComponentId: charged.componentId,
      splitReason: input.splitReason ?? null,
      costType: input.costType,
      stage: input.stage,
      value: toDb(input.value),
      quantity: input.quantity != null ? String(input.quantity) : null,
      unit: input.unit ?? null,
      productId: input.productId ?? null,
      qualification: input.qualification ?? null,
      documentType: input.documentType,
      documentId: input.documentId ?? null,
      supplierId: input.supplierId ?? null,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  return row;
}

export async function recordCosts(inputs: CostInput[]) {
  const out = [];
  for (const input of inputs) out.push(await recordCost(input));
  return out;
}

async function activeAllocationFor(workUnitId: string) {
  const [row] = await db
    .select({
      contractId: fundingAllocations.contractId,
      componentId: fundingAllocations.componentId,
    })
    .from(fundingAllocations)
    .where(and(eq(fundingAllocations.workUnitId, workUnitId), eq(fundingAllocations.status, "activ")))
    .limit(1);
  return row ?? null;
}

/* ─────────────────────── închiderea de perioadă ─────────────────────── */

export async function isPeriodClosed(firmId: string, year: number, month: number): Promise<boolean> {
  const [row] = await db
    .select({ closedAt: periods.closedAt })
    .from(periods)
    .where(and(eq(periods.firmId, firmId), eq(periods.year, year), eq(periods.month, month)))
    .limit(1);
  return Boolean(row?.closedAt);
}

/* ─────────────────────── mutarea finanțării (§13.1) ─────────────────────── */

/**
 * „Costurile urmează unitatea de lucru."
 *
 * Luna DESCHISĂ  → se rescrie `charged_*` pe liniile existente. Direct.
 * Luna ÎNCHISĂ   → liniile rămân datate în luna lor; se emite un document de
 *                  realocare în luna curentă. Ambele mișcări rămân vizibile.
 *
 * Ce NU se schimbă niciodată: `documentDate` și analitica „folosit". Istoricul
 * obiectivului rămâne intact indiferent de câte ori se mută finanțarea.
 */
export async function moveWorkUnitFunding(params: {
  workUnitId: string;
  toContractId: string;
  toComponentId: string;
  year: number;
  month: number;
  reason: string;
  actorId?: string | null;
}) {
  const { workUnitId, toContractId, toComponentId, year, month, reason, actorId } = params;

  const [unit] = await db.select().from(workUnits).where(eq(workUnits.id, workUnitId)).limit(1);
  if (!unit) throw new Error("Unitatea de lucru nu există.");

  const entries = await db
    .select()
    .from(costEntries)
    .where(and(eq(costEntries.workUnitId, workUnitId), isNotNull(costEntries.chargedComponentId)));

  const moved: { open: number; viaDocument: number } = { open: 0, viaDocument: 0 };
  const perComponentClosed = new Map<string, Bani>();

  for (const entry of entries) {
    if (entry.chargedComponentId === toComponentId) continue;

    const [y, m] = entry.effectDate.split("-").map(Number);
    const closed = await isPeriodClosed(entry.firmId, y, m);

    if (!closed) {
      await db
        .update(costEntries)
        .set({ chargedContractId: toContractId, chargedComponentId: toComponentId })
        .where(eq(costEntries.id, entry.id));
      moved.open += 1;
    } else {
      const key = entry.chargedComponentId!;
      perComponentClosed.set(key, (perComponentClosed.get(key) ?? 0) + fromDb(entry.value));
      moved.viaDocument += 1;
    }
  }

  // Pentru lunile închise: un document de realocare per componentă sursă.
  for (const [fromComponentId, value] of perComponentClosed) {
    if (value === 0) continue;
    await db.insert(reallocations).values({
      workUnitId,
      fromComponentId,
      toComponentId,
      value: toDb(value),
      year,
      month,
      reason,
      createdBy: actorId ?? null,
    });
  }

  // Alocarea veche se închide, se deschide una nouă. Nimic nu se rescrie (P2).
  await db
    .update(fundingAllocations)
    .set({ status: "inlocuit" })
    .where(
      and(eq(fundingAllocations.workUnitId, workUnitId), eq(fundingAllocations.status, "activ")),
    );

  await db.insert(fundingAllocations).values({
    workUnitId,
    contractId: toContractId,
    componentId: toComponentId,
    year,
    month,
    allocatedValue: unit.estimatedValue,
    status: "activ",
    reason,
    createdBy: actorId ?? null,
  });

  return moved;
}

/* ─────────────────────── interogări ─────────────────────── */

export type Analytic = "descarcat" | "folosit";

/** Consumul unei componente într-o lună. Implicit pe analitica „descărcat" (§12). */
export async function consumedByComponent(
  componentId: string,
  year: number,
  month: number,
  opts: { analytic?: Analytic; stages?: CostStage[] } = {},
): Promise<Bani> {
  const analytic = opts.analytic ?? "descarcat";
  const column =
    analytic === "descarcat" ? costEntries.chargedComponentId : costEntries.usedComponentId;
  const stages = opts.stages ?? ["receptionat", "consumat", "facturat"];

  const [row] = await db
    .select({ total: raw<string>`coalesce(sum(${costEntries.value}), 0)` })
    .from(costEntries)
    .where(
      and(
        eq(column, componentId),
        raw`extract(year from ${costEntries.effectDate}) = ${year}`,
        raw`extract(month from ${costEntries.effectDate}) = ${month}`,
        inArray(costEntries.stage, stages),
      ),
    );

  return fromDb(row?.total ?? "0");
}

/** Ce s-a angajat dar încă nu s-a consumat — stratul care te anunță la timp (P6). */
export async function committedByComponent(
  componentId: string,
  year: number,
  month: number,
): Promise<Bani> {
  return consumedByComponent(componentId, year, month, { stages: ["angajat"] });
}

export async function costForWorkUnit(workUnitId: string): Promise<Bani> {
  const [row] = await db
    .select({ total: raw<string>`coalesce(sum(${costEntries.value}), 0)` })
    .from(costEntries)
    .where(and(eq(costEntries.workUnitId, workUnitId), ne(costEntries.stage, "angajat")));
  return fromDb(row?.total ?? "0");
}

/** Liniile unde „folosit" ≠ „descărcat" — raportul de reconciliere din §12. */
export async function splitAnalyticsEntries(year: number, month: number) {
  return db
    .select()
    .from(costEntries)
    .where(
      and(
        isNotNull(costEntries.splitReason),
        raw`extract(year from ${costEntries.effectDate}) = ${year}`,
        raw`extract(month from ${costEntries.effectDate}) = ${month}`,
      ),
    );
}

export async function componentsOfContract(contractId: string) {
  return db
    .select()
    .from(contractComponents)
    .where(eq(contractComponents.contractId, contractId));
}
