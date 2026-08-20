"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { contractComponents, contracts, requests } from "@/lib/db/schema";
import { fromDb, parseInput } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { RoutingDecision } from "@/lib/routing";
import { requireSession } from "@/lib/session";
import { createWorkUnit } from "@/lib/work-units";

/**
 * Decizia de rutare (§7). Trei lucruri se întâmplă simultan și nu au voie să se
 * despartă: cererea primește decizie CU AUTOR ȘI DATĂ, se naște unitatea de lucru
 * și se naște alocarea de finanțare pe componenta aleasă.
 *
 * P8: aprobarea produce direct obiectul următor. Nu rămâne „aprobat" fără urmare.
 */
export async function decideRequest(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "cereri.decide")) return;

  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "") as RoutingDecision;
  const componentId = String(formData.get("componentId") ?? "") || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const value = parseInput(String(formData.get("value") ?? ""));

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!request) return;

  let workUnitId: string | null = null;

  // „Contract nou" nu produce unitate de lucru — produce o ofertă, în afara abonamentului.
  if (decision !== "contract_nou" && componentId && request.objectiveId) {
    const [component] = await db
      .select()
      .from(contractComponents)
      .where(eq(contractComponents.id, componentId))
      .limit(1);
    if (!component) return;

    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, component.contractId))
      .limit(1);
    if (!contract) return;

    const estimated = value || fromDb(request.estimatedValue);

    const unit = await createWorkUnit({
      kind: decision === "interventie_mentenanta" ? "interventie" : "lucrare",
      title: request.title,
      description: request.description,
      firmId: contract.firmId,
      objectiveId: request.objectiveId,
      responsibleId: contract.ownerId ?? session.id,
      startDate: `${year}-${String(month).padStart(2, "0")}-01`,
      estimatedValue: estimated,
      // marja țintă a componentei dă bugetul de cost al unității
      budgetCost: Math.round(estimated * (1 - Number(component.targetMarginPercent) / 100)),
      status: "planificata",
      createdBy: session.id,
      funding: {
        contractId: contract.id,
        componentId: component.id,
        year,
        month,
        value: estimated,
        reason: `Rutare din cererea ${request.code}`,
      },
    });
    workUnitId = unit.id;
  }

  await db
    .update(requests)
    .set({
      status: "aprobata",
      decision,
      decidedBy: session.id,
      decidedAt: new Date(),
      decisionNote: note,
      workUnitId,
    })
    .where(eq(requests.id, requestId));

  revalidatePath("/cereri");
  revalidatePath("/backlog");
  revalidatePath("/lucrari");
  if (workUnitId) redirect(`/lucrari/${workUnitId}`);
  redirect(`/cereri/${requestId}`);
}

/** Respingerea și amânarea rămân decizii cu autor — altfel backlogul minte. */
export async function setRequestStatus(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "cereri.decide")) return;

  const requestId = String(formData.get("requestId") ?? "");
  const status = String(formData.get("status") ?? "") as "respinsa" | "amanata" | "evaluata";
  const note = String(formData.get("note") ?? "").trim() || null;

  await db
    .update(requests)
    .set({
      status,
      decidedBy: status === "evaluata" ? null : session.id,
      decidedAt: status === "evaluata" ? null : new Date(),
      decisionNote: note,
    })
    .where(eq(requests.id, requestId));

  revalidatePath("/cereri");
  revalidatePath(`/cereri/${requestId}`);
  revalidatePath("/backlog");
}
