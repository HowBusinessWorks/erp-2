"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull, or, sql as raw } from "drizzle-orm";

import { db } from "@/lib/db";
import { recordCost } from "@/lib/cost-ledger";
import {
  consumptionLines,
  consumptionNotes,
  contractObjectives,
  inspectionAnswers,
  interventionDetails,
  laborRates,
  mediaSlots,
  objectives,
  products,
  siteJournalEntries,
  stock,
  timesheets,
  warehouses,
  workUnits,
} from "@/lib/db/schema";
import { multiplyQty, type Bani } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { activeAllocation, createWorkUnit } from "@/lib/work-units";

/**
 * Mentenanța din teren (blocul F): inspecția și intervenția ca DOUĂ fluxuri.
 *
 * Diferența dintre ele nu e cosmetică. Inspecția e un act care se închide odată,
 * cu un verdict; intervenția e o fișă care stă DESCHISĂ cât durează lucrul și
 * primește ore, materiale și însemnări pe parcurs. Un singur ecran pentru amândouă
 * ar fi însemnat ori o inspecție care nu se închide, ori o intervenție care nu
 * poate fi completată a doua zi.
 *
 * Ca peste tot: costul trece prin `recordCost`, niciodată direct în `cost_entries`.
 */

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function hourlyRate(qualification: string, day: string): Promise<Bani> {
  const [rate] = await db
    .select()
    .from(laborRates)
    .where(
      and(
        eq(laborRates.qualification, qualification),
        raw`${laborRates.validFrom} <= ${day}`,
        or(isNull(laborRates.validTo), raw`${laborRates.validTo} >= ${day}`),
      ),
    )
    .orderBy(desc(laborRates.validFrom))
    .limit(1);
  return rate ? Number(rate.hourlyCost) * 100 : 0;
}

/**
 * Finanțarea unei fișe născute pe teren.
 *
 * P2: finanțarea e o legătură, nu un câmp. Fișa deschisă pe un obiectiv de mentenanță
 * cade pe contractul acelui obiectiv, pe componenta de mentenanță, în luna curentă.
 * Valoarea alocată e zero: omul din teren nu vede și nu decide bani — plafonul îl
 * mișcă biroul. Fără legătura asta, costul ar rămâne neatribuit și Delta nesocotită.
 */
async function fundingForObjective(objectiveId: string) {
  const rows = await db.execute<{ contract_id: string; component_id: string }>(
    raw`select c.id as contract_id, cc.id as component_id
        from contract_objectives co
        join contracts c on c.id = co.contract_id
        join contract_components cc on cc.contract_id = c.id
        where co.objective_id = ${objectiveId}
          and cc.kind in ('mentenanta', 'individual')
        order by case cc.kind when 'mentenanta' then 0 else 1 end, co.from_date desc
        limit 1`,
  );
  const row = [...rows][0];
  if (!row) return null;
  const now = new Date();
  return {
    contractId: row.contract_id,
    componentId: row.component_id,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    value: 0 as Bani,
    reason: "Fișă deschisă din teren",
  };
}

/**
 * Firma pe care cade fișa. Obiectivul nu are firmă — el aparține unui contract, iar
 * contractul unei firme. Dacă obiectivul nu e legat de niciun contract, fișa nu se
 * poate deschide: n-ar avea pe cine să apese.
 */
async function firmOfObjective(objectiveId: string): Promise<string | null> {
  const rows = await db.execute<{ firm_id: string }>(
    raw`select c.firm_id from contract_objectives co
        join contracts c on c.id = co.contract_id
        where co.objective_id = ${objectiveId}
        order by co.from_date desc limit 1`,
  );
  return [...rows][0]?.firm_id ?? null;
}

/** Pozele declarate: rândul există din clipa apăsării, conținutul vine cu R2. */
async function declareMedia(params: {
  ownerType: string;
  ownerId: string;
  workUnitId: string | null;
  slot: "inspectie" | "interventie" | "jurnal" | "inainte" | "dupa" | "pv" | "unealta";
  photos: number;
  videos?: number;
  userId: string;
}) {
  const rows: (typeof mediaSlots.$inferInsert)[] = [];
  for (let i = 0; i < params.photos; i += 1) {
    rows.push({
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      workUnitId: params.workUnitId,
      slot: params.slot,
      kind: "foto",
      label: String(i + 1),
      createdBy: params.userId,
    });
  }
  for (let i = 0; i < (params.videos ?? 0); i += 1) {
    rows.push({
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      workUnitId: params.workUnitId,
      slot: params.slot,
      kind: "video",
      label: "film",
      createdBy: params.userId,
    });
  }
  if (rows.length) await db.insert(mediaSlots).values(rows);
}

/* ═════════════════════════ inspecția (wizard 3 pași) ═════════════════════════ */

/**
 * Wizardul întreg pleacă într-un singur apel.
 *
 * Trei ieșiri posibile, după ce a găsit omul:
 *   fără probleme      → fișa se închide, atât;
 *   rezolvat pe loc    → orele și materialele intră ACUM, pe fișa de inspecție;
 *   rămâne de rezolvat → se naște o intervenție legată, cu `sourceUnitId` pe inspecție.
 *
 * A treia e motivul pentru care regula „fiecare NOK are o ieșire" chiar ține: constatarea
 * nu poate rămâne fără urmare, pentru că urmarea se creează în aceeași tranzacție.
 */
export async function submitInspectionSheet(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const objectiveId = String(formData.get("objectiveId") ?? "");
  if (!objectiveId) return;

  const day = String(formData.get("day") ?? today());
  const discipline = String(formData.get("discipline") ?? "HVAC");
  const inspectionKind = String(formData.get("inspectionType") ?? "lunara") as
    | "lunara"
    | "trimestriala"
    | "anuala"
    | "la_cerere";
  const subcontractorId = String(formData.get("subcontractorId") ?? "") || null;
  const foundProblem = String(formData.get("foundProblem") ?? "nu") === "da";
  const description = String(formData.get("description") ?? "").trim();
  const resolvedOnSite = String(formData.get("resolvedOnSite") ?? "") === "da";

  const [objective] = await db.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
  if (!objective) return;

  const firmId = await firmOfObjective(objectiveId);
  if (!firmId) return;

  const funding = await fundingForObjective(objectiveId);

  const unit = await createWorkUnit({
    kind: "inspectie",
    title: `${discipline} — ${objective.name}`,
    description: description || null,
    firmId,
    objectiveId,
    responsibleId: session.id,
    startDate: day,
    endDate: day,
    status: "finalizata",
    createdBy: session.id,
    funding,
  });

  await db
    .update(workUnits)
    .set({
      inspectionType: inspectionKind,
      discipline,
      subcontractorId,
      executant: subcontractorId ? "subcontractant" : "propriu",
      closedAt: new Date(),
    })
    .where(eq(workUnits.id, unit.id));

  await declareMedia({
    ownerType: "work_unit",
    ownerId: unit.id,
    workUnitId: unit.id,
    slot: "inspectie",
    photos: Number(formData.get("photoCount") ?? 0),
    userId: session.id,
  });

  // Constatarea propriu-zisă. Fără probleme = un singur punct OK, ca fișa să nu fie goală.
  if (!foundProblem) {
    await db.insert(inspectionAnswers).values({
      workUnitId: unit.id,
      itemText: `${discipline} — verificare completă`,
      ok: true,
      note: description || null,
    });
    revalidatePath("/teren/mentenanta");
    redirect(`/teren/inspectii/${unit.id}`);
  }

  let followUpId: string | null = null;

  if (!resolvedOnSite) {
    // Intervenția se naște ACUM, legată de inspecție. Altfel constatarea moare în fișă.
    const plannedDay = String(formData.get("plannedDay") ?? day);
    const followUp = await createWorkUnit({
      kind: "interventie",
      title: String(formData.get("followUpTitle") ?? "").trim() || `Remediere — ${discipline}`,
      description: description || null,
      firmId,
      objectiveId,
      responsibleId: session.id,
      startDate: plannedDay,
      status: "planificata",
      createdBy: session.id,
      funding,
    });
    await db
      .update(workUnits)
      .set({ sourceTag: "inspectie", sourceUnitId: unit.id, subcontractorId })
      .where(eq(workUnits.id, followUp.id));
    followUpId = followUp.id;
  }

  await db.insert(inspectionAnswers).values({
    workUnitId: unit.id,
    itemText: `${discipline} — problemă constatată`,
    ok: false,
    note: description || null,
    outcome: resolvedOnSite ? "rezolvat" : "interventie",
  });

  // Rezolvat pe loc: orele și materialele intră pe fișa de inspecție, nu se pierd.
  if (resolvedOnSite) {
    const hours =
      Number(formData.get("hours") ?? 0) + Number(formData.get("minutes") ?? 0) / 60;
    const qualification = String(formData.get("qualification") ?? "muncitor");
    const allocation = await activeAllocation(unit.id);

    await db.insert(interventionDetails).values({
      workUnitId: unit.id,
      description: description || null,
      hoursDeclared: hours.toFixed(2),
      peopleCount: 1,
      resolvedAt: new Date(),
    });

    if (hours > 0) {
      await db.insert(timesheets).values({
        userId: session.id,
        workUnitId: unit.id,
        day,
        hours: hours.toFixed(2),
        qualification,
        note: "Rezolvat pe loc la inspecție",
        createdBy: session.id,
      });
      const rate = await hourlyRate(qualification, day);
      if (rate > 0) {
        await recordCost({
          firmId,
          documentDate: day,
          objectiveId,
          workUnitId: unit.id,
          usedContractId: allocation?.contractId ?? null,
          usedComponentId: allocation?.componentId ?? null,
          costType: "manopera",
          stage: "consumat",
          value: multiplyQty(rate, hours),
          quantity: hours,
          unit: "ore",
          qualification,
          documentType: "pontaj",
          createdBy: session.id,
        });
      }
    }

    await consumeFromTeamStock({
      formData,
      workUnitId: unit.id,
      objectiveId,
      firmId,
      userId: session.id,
      day,
      note: "Rezolvat pe loc la inspecție",
    });
  }

  revalidatePath("/teren/mentenanta");
  redirect(followUpId ? `/teren/interventii/${followUpId}` : `/teren/inspectii/${unit.id}`);
}

/* ═════════════════════════ intervenția ═════════════════════════ */

/**
 * Fișa nouă de intervenție. Două plecări: „mă apuc acum" (in_lucru) și
 * „doar o planific" (planificata). Fișa NU se închide aici — se completează pe parcurs.
 */
export async function createInterventionSheet(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const objectiveId = String(formData.get("objectiveId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!objectiveId || !title) return;

  const [objective] = await db.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
  if (!objective) return;

  const firmId = await firmOfObjective(objectiveId);
  if (!firmId) return;

  const startNow = String(formData.get("startNow") ?? "") === "da";
  const day = String(formData.get("day") ?? today());
  const subcontractorId = String(formData.get("subcontractorId") ?? "") || null;

  const unit = await createWorkUnit({
    kind: "interventie",
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    firmId,
    objectiveId,
    responsibleId: session.id,
    startDate: day,
    status: startNow ? "in_lucru" : "planificata",
    createdBy: session.id,
    funding: await fundingForObjective(objectiveId),
  });

  await db
    .update(workUnits)
    .set({
      sourceTag: (String(formData.get("sourceTag") ?? "tichet") as "tichet" | "solicitare" | "inspectie"),
      sourceUnitId: String(formData.get("sourceUnitId") ?? "") || null,
      subcontractorId,
      executant: subcontractorId ? "subcontractant" : "propriu",
    })
    .where(eq(workUnits.id, unit.id));

  revalidatePath("/teren/mentenanta");
  redirect(`/teren/interventii/${unit.id}`);
}

/** „Începe intervenția" — planificată devine în lucru, de aici încolo se poate scrie pe ea. */
export async function startIntervention(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;
  const id = String(formData.get("workUnitId") ?? "");
  if (!id) return;

  await db
    .update(workUnits)
    .set({ status: "in_lucru", startDate: today() })
    .where(eq(workUnits.id, id));

  revalidatePath(`/teren/interventii/${id}`);
  revalidatePath("/teren/mentenanta");
}

/** O însemnare în firul intervenției. Nu produce bani, deci nu trece prin registrul de cost. */
export async function addInterventionNote(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const id = String(formData.get("workUnitId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!id || !text) return;

  await db.insert(siteJournalEntries).values({
    workUnitId: id,
    day: today(),
    text,
    createdBy: session.id,
  });

  await declareMedia({
    ownerType: "work_unit",
    ownerId: id,
    workUnitId: id,
    slot: "interventie",
    photos: Number(formData.get("photoCount") ?? 0),
    userId: session.id,
  });

  revalidatePath(`/teren/interventii/${id}`);
}

/** Ore adăugate pe fișa deschisă. Intră în pontaj — o singură sursă a orelor. */
export async function addInterventionHours(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const id = String(formData.get("workUnitId") ?? "");
  const hours = Number(formData.get("hours") ?? 0) + Number(formData.get("minutes") ?? 0) / 60;
  const people = Number(formData.get("people") ?? 1) || 1;
  if (!id || hours <= 0) return;

  const [unit] = await db.select().from(workUnits).where(eq(workUnits.id, id)).limit(1);
  if (!unit) return;

  const day = today();
  const qualification = String(formData.get("qualification") ?? "muncitor");
  const total = hours * people;
  const allocation = await activeAllocation(id);

  await db.insert(timesheets).values({
    userId: session.id,
    workUnitId: id,
    day,
    hours: total.toFixed(2),
    qualification,
    note: String(formData.get("note") ?? "").trim() || null,
    createdBy: session.id,
  });

  const rate = await hourlyRate(qualification, day);
  if (rate > 0) {
    await recordCost({
      firmId: unit.firmId,
      documentDate: day,
      objectiveId: unit.objectiveId,
      workUnitId: id,
      usedContractId: allocation?.contractId ?? null,
      usedComponentId: allocation?.componentId ?? null,
      costType: "manopera",
      stage: "consumat",
      value: multiplyQty(rate, total),
      quantity: total,
      unit: "ore",
      qualification,
      documentType: "pontaj",
      createdBy: session.id,
    });
  }

  revalidatePath(`/teren/interventii/${id}`);
}

/** Material scos din gestiunea echipei pe fișa deschisă. */
export async function addInterventionMaterial(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const id = String(formData.get("workUnitId") ?? "");
  if (!id) return;
  const [unit] = await db.select().from(workUnits).where(eq(workUnits.id, id)).limit(1);
  if (!unit) return;

  await consumeFromTeamStock({
    formData,
    workUnitId: id,
    objectiveId: unit.objectiveId,
    firmId: unit.firmId,
    userId: session.id,
    day: today(),
    note: "Material pe fișa de intervenție",
  });

  revalidatePath(`/teren/interventii/${id}`);
}

/** Închiderea fișei. După ea nu se mai adaugă nimic — de asta e buton separat. */
export async function finishIntervention(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const id = String(formData.get("workUnitId") ?? "");
  if (!id) return;

  const summary = String(formData.get("summary") ?? "").trim();
  if (summary) {
    await db.insert(interventionDetails).values({
      workUnitId: id,
      description: summary,
      hoursDeclared: "0",
      peopleCount: 1,
      resolvedAt: new Date(),
    });
  }

  await db
    .update(workUnits)
    .set({ status: "finalizata", closedAt: new Date(), endDate: today() })
    .where(eq(workUnits.id, id));

  revalidatePath(`/teren/interventii/${id}`);
  revalidatePath("/teren/mentenanta");
  redirect("/teren/mentenanta");
}

/* ═════════════════════════ ajutor comun ═════════════════════════ */

/**
 * Scoaterea de material din gestiunea ECHIPEI, cu bon și cu linie de cost.
 *
 * Materialul devine cost la CONSUM, nu la recepție: în magazie e activ, nu cheltuială.
 * Valoarea se ia la prețul produsului, nu la ultima factură — altfel a treia livrare
 * ar rescrie retroactiv costul lucrărilor de luna trecută.
 */
async function consumeFromTeamStock(params: {
  formData: FormData;
  workUnitId: string;
  objectiveId: string;
  firmId: string;
  userId: string;
  day: string;
  note: string;
}) {
  const { formData } = params;

  let warehouseId = String(formData.get("warehouseId") ?? "");
  if (!warehouseId) {
    const [teamWarehouse] = await db
      .select()
      .from(warehouses)
      .where(
        and(
          eq(warehouses.kind, "echipa"),
          eq(warehouses.active, true),
          raw`(${warehouses.keeperId} = ${params.userId} or ${warehouses.keeperId} is null)`,
        ),
      )
      .orderBy(raw`${warehouses.keeperId} nulls last`)
      .limit(1);
    warehouseId = teamWarehouse?.id ?? "";
  }
  if (!warehouseId) return;

  const lines = formData
    .getAll("productId")
    .map(String)
    .filter(Boolean)
    .map((productId) => ({ productId, quantity: Number(formData.get(`qty_${productId}`) ?? 0) }))
    .filter((line) => line.quantity > 0);
  if (lines.length === 0) return;

  const allocation = await activeAllocation(params.workUnitId);

  const [note] = await db
    .insert(consumptionNotes)
    .values({
      code: `BC-${Date.now().toString().slice(-6)}`,
      firmId: params.firmId,
      warehouseId,
      workUnitId: params.workUnitId,
      day: params.day,
      effectDate: params.day,
      note: params.note,
      createdBy: params.userId,
    })
    .returning();

  for (const line of lines) {
    const [productRow] = await db
      .select()
      .from(products)
      .where(eq(products.id, line.productId))
      .limit(1);
    const unitCost = productRow ? Number(productRow.lastPrice) * 100 : 0;
    const value = multiplyQty(unitCost, line.quantity);

    await db.insert(consumptionLines).values({
      noteId: note.id,
      productId: line.productId,
      quantity: String(line.quantity),
      unitCost: (unitCost / 100).toFixed(2),
      value: (value / 100).toFixed(2),
    });

    await db
      .update(stock)
      .set({ quantity: raw`${stock.quantity} - ${line.quantity}`, updatedAt: new Date() })
      .where(and(eq(stock.warehouseId, warehouseId), eq(stock.productId, line.productId)));

    await recordCost({
      firmId: params.firmId,
      documentDate: params.day,
      objectiveId: params.objectiveId,
      workUnitId: params.workUnitId,
      usedContractId: allocation?.contractId ?? null,
      usedComponentId: allocation?.componentId ?? null,
      costType: "material",
      stage: "consumat",
      value,
      quantity: line.quantity,
      unit: productRow?.unit ?? "buc",
      productId: line.productId,
      documentType: "bon_consum",
      documentId: note.id,
      createdBy: params.userId,
    });
  }
}

/** Obiectivele de mentenanță pe care le pot alege în fișele noi. */
export async function maintenanceObjectives() {
  return db
    .select({ id: objectives.id, name: objectives.name, code: objectives.code })
    .from(objectives)
    .innerJoin(contractObjectives, eq(contractObjectives.objectiveId, objectives.id))
    .groupBy(objectives.id, objectives.name, objectives.code)
    .orderBy(objectives.name)
    .limit(120);
}
