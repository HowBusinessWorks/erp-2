"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { moveWorkUnitFunding } from "@/lib/cost-ledger";
import { contractComponents, fundingAllocations, workUnits } from "@/lib/db/schema";
import { parseInput, toDb } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { promoteToLucrare } from "@/lib/work-units";

/**
 * Ecranul 12 — mutarea finanțării (§13.1).
 *
 * Toată logica e în `lib/cost-ledger.ts`, inclusiv cele două comportamente după cum
 * luna e deschisă sau închisă. Aici e doar poarta de permisiuni și formularul.
 */
export async function moveFunding(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "cost.realoca")) return;

  const workUnitId = String(formData.get("workUnitId") ?? "");
  const toComponentId = String(formData.get("toComponentId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));

  // Motivul e obligatoriu. O mutare fără motiv e o mutare pe care nimeni nu o poate apăra.
  if (!workUnitId || !toComponentId || !reason) return;

  const [component] = await db
    .select()
    .from(contractComponents)
    .where(eq(contractComponents.id, toComponentId))
    .limit(1);
  if (!component) return;

  await moveWorkUnitFunding({
    workUnitId,
    toContractId: component.contractId,
    toComponentId,
    year,
    month,
    reason,
    actorId: session.id,
  });

  revalidatePath(`/lucrari/${workUnitId}`);
  revalidatePath("/realocari");
  revalidatePath("/cost");
  revalidatePath("/panou");
}

/**
 * Alocare suplimentară pe altă lună — o lucrare mare se împarte pe 2–3 luni de Delta
 * (§13). Alocările PARALELE coexistă; nu se înlocuiesc între ele.
 */
export async function addAllocation(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "cost.realoca")) return;

  const workUnitId = String(formData.get("workUnitId") ?? "");
  const componentId = String(formData.get("componentId") ?? "");
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const value = parseInput(String(formData.get("value") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!workUnitId || !componentId || value <= 0) return;

  const [component] = await db
    .select()
    .from(contractComponents)
    .where(eq(contractComponents.id, componentId))
    .limit(1);
  if (!component) return;

  await db.insert(fundingAllocations).values({
    workUnitId,
    contractId: component.contractId,
    componentId,
    year,
    month,
    allocatedValue: toDb(value),
    status: "activ",
    reason,
    createdBy: session.id,
  });

  revalidatePath(`/lucrari/${workUnitId}`);
  revalidatePath("/panou");
}

/** P7 — promovarea păstrează id-ul, deci și tot ce s-a strâns până acum pe el. */
export async function promoteWorkUnit(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "cereri.decide")) return;

  const workUnitId = String(formData.get("workUnitId") ?? "");
  const estimated = parseInput(String(formData.get("estimatedValue") ?? ""));
  if (!workUnitId || estimated <= 0) return;

  await promoteToLucrare({
    workUnitId,
    estimatedValue: estimated,
    stages: [
      { name: "Pregătire și organizare de șantier", percentOfWork: 15 },
      { name: "Execuție", percentOfWork: 70 },
      { name: "Finisaje și predare", percentOfWork: 15 },
    ],
    actorId: session.id,
  });

  revalidatePath(`/lucrari/${workUnitId}`);
  revalidatePath("/lucrari");
}

export async function setWorkUnitStatus(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "cereri.decide")) return;

  const workUnitId = String(formData.get("workUnitId") ?? "");
  const status = String(formData.get("status") ?? "") as
    | "propusa"
    | "planificata"
    | "in_lucru"
    | "finalizata"
    | "anulata";
  if (!workUnitId || !status) return;

  await db
    .update(workUnits)
    .set({ status, closedAt: status === "finalizata" ? new Date() : null })
    .where(eq(workUnits.id, workUnitId));

  revalidatePath(`/lucrari/${workUnitId}`);
  revalidatePath("/lucrari");
}
