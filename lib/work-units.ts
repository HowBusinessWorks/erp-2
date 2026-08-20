/**
 * Unitatea de lucru (§6) — inima modelului. Trei tipuri, identitate comună.
 *
 * Aici stau cele două operații care nu au voie să existe în două variante:
 *   `createWorkUnit`   — naște UL-ul ÎMPREUNĂ cu alocarea de finanțare (P2: finanțarea
 *                        e o legătură, nu un câmp).
 *   `promoteToLucrare` — intervenție → lucrare PĂSTRÂND id-ul, deci și pozele, orele
 *                        și consumurile deja înregistrate (P7).
 */

import { and, eq, sql as raw } from "drizzle-orm";

import { db } from "./db";
import {
  fileNodes,
  fundingAllocations,
  workUnits,
  workUnitStages,
} from "./db/schema";
import { toDb, type Bani } from "./money";

export type WorkUnitKind = "inspectie" | "interventie" | "lucrare";

export const KIND_LABEL: Record<WorkUnitKind, string> = {
  inspectie: "Inspecție",
  interventie: "Intervenție",
  lucrare: "Lucrare",
};

export const STATUS_LABEL: Record<string, string> = {
  propusa: "Propusă",
  planificata: "Planificată",
  in_lucru: "În lucru",
  finalizata: "Finalizată",
  anulata: "Anulată",
};

const PREFIX: Record<WorkUnitKind, string> = {
  inspectie: "I",
  interventie: "T",
  lucrare: "L",
};

/** Cod secvențial pe tip. În producție ar fi o secvență Postgres per firmă și an. */
export async function nextWorkUnitCode(kind: WorkUnitKind): Promise<string> {
  const prefix = PREFIX[kind];
  const [row] = await db
    .select({
      max: raw<string>`coalesce(max(nullif(regexp_replace(${workUnits.code}, '\\D', '', 'g'), '')::int), 1000)`,
    })
    .from(workUnits)
    .where(raw`${workUnits.code} like ${prefix + "-%"}`);
  return `${prefix}-${Number(row?.max ?? 1000) + 1}`;
}

export type CreateWorkUnitInput = {
  kind: WorkUnitKind;
  title: string;
  description?: string | null;
  firmId: string;
  objectiveId: string;
  responsibleId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  estimatedValue?: Bani;
  budgetCost?: Bani;
  status?: "propusa" | "planificata" | "in_lucru" | "finalizata";
  createdBy?: string | null;
  /** finanțarea. Fără ea, UL-ul există dar nu apasă pe niciun plafon. */
  funding?: {
    contractId: string;
    componentId: string;
    year: number;
    month: number;
    value: Bani;
    reason?: string | null;
  } | null;
};

export async function createWorkUnit(input: CreateWorkUnitInput) {
  const code = await nextWorkUnitCode(input.kind);

  const [unit] = await db
    .insert(workUnits)
    .values({
      code,
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      firmId: input.firmId,
      objectiveId: input.objectiveId,
      status: input.status ?? "planificata",
      responsibleId: input.responsibleId ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      estimatedValue: toDb(input.estimatedValue ?? 0),
      budgetCost: toDb(input.budgetCost ?? 0),
      createdBy: input.createdBy ?? null,
    })
    .returning();

  if (input.funding) {
    await db.insert(fundingAllocations).values({
      workUnitId: unit.id,
      contractId: input.funding.contractId,
      componentId: input.funding.componentId,
      year: input.funding.year,
      month: input.funding.month,
      allocatedValue: toDb(input.funding.value),
      status: "activ",
      reason: input.funding.reason ?? null,
      createdBy: input.createdBy ?? null,
    });
  }

  // Folderul de documente al unității se naște odată cu ea (§19.1, ecranul 32).
  await db.insert(fileNodes).values({
    kind: "folder",
    name: `${unit.code} — ${unit.title}`,
    workUnitId: unit.id,
    objectiveId: unit.objectiveId,
    createdBy: input.createdBy ?? null,
  });

  return unit;
}

/**
 * P7 — promovarea intervenție → lucrare.
 *
 * Se schimbă `kind`, nu id-ul. Tot ce atârnă de id (poze, ore, consumuri, linii de
 * cost, folderul de documente) rămâne pe loc, fără nicio copiere. Ăsta e singurul
 * motiv pentru care cele trei tipuri stau în aceeași tabelă.
 */
export async function promoteToLucrare(params: {
  workUnitId: string;
  estimatedValue: Bani;
  stages?: { name: string; startDate?: string | null; endDate?: string | null; percentOfWork: number }[];
  actorId?: string | null;
}) {
  const [unit] = await db
    .update(workUnits)
    .set({
      kind: "lucrare",
      promotedFrom: "interventie",
      promotedAt: new Date(),
      estimatedValue: toDb(params.estimatedValue),
      status: "in_lucru",
    })
    .where(eq(workUnits.id, params.workUnitId))
    .returning();

  if (params.stages?.length) {
    await db.insert(workUnitStages).values(
      params.stages.map((stage, i) => ({
        workUnitId: params.workUnitId,
        position: i + 1,
        name: stage.name,
        startDate: stage.startDate ?? null,
        endDate: stage.endDate ?? null,
        percentOfWork: String(stage.percentOfWork),
      })),
    );
  }

  return unit;
}

/** Alocarea activă a unei unități de lucru — de ea atârnă pe ce buget cad costurile. */
export async function activeAllocation(workUnitId: string) {
  const [row] = await db
    .select()
    .from(fundingAllocations)
    .where(
      and(eq(fundingAllocations.workUnitId, workUnitId), eq(fundingAllocations.status, "activ")),
    )
    .limit(1);
  return row ?? null;
}
