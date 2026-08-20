"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull, or, sql as raw } from "drizzle-orm";

import { db } from "@/lib/db";
import { recordCost } from "@/lib/cost-ledger";
import {
  consumptionLines,
  consumptionNotes,
  inspectionAnswers,
  interventionDetails,
  laborRates,
  poLines,
  products,
  purchaseOrders,
  requests,
  siteJournalEntries,
  stock,
  timesheets,
  workUnits,
} from "@/lib/db/schema";
import { multiplyQty, type Bani } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { activeAllocation } from "@/lib/work-units";

/**
 * Acțiunile de teren (T2–T6).
 *
 * Regula de atingeri: ＋ costă una, alegerea acțiunii încă una, deci ecranul are voie
 * la o singură atingere — cea de Trimite. De asta fiecare acțiune de aici primește
 * tot formularul deodată și face toată treaba într-un singur apel, inclusiv costurile.
 *
 * Costurile trec prin `recordCost`. Nimic nu scrie direct în `cost_entries`.
 */

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Rata orară valabilă la ziua dată, pentru calificarea dată (rate card istoricizat, §9). */
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

async function unitContext(workUnitId: string) {
  const [unit] = await db.select().from(workUnits).where(eq(workUnits.id, workUnitId)).limit(1);
  if (!unit) return null;
  const allocation = await activeAllocation(workUnitId);
  return { unit, allocation };
}

/* ─────────────────────────── T2 — inspecție ─────────────────────────── */

/**
 * Fiecare punct NOK trebuie să aibă o IEȘIRE. Fără ea, constatarea moare în fișă
 * și Delta rămâne neumplută (§7). Ieșirea „propunere” sau „intervenție” produce
 * automat o cerere, care intră în inboxul de rutare.
 */
export async function submitInspection(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const workUnitId = String(formData.get("workUnitId") ?? "");
  const ctx = await unitContext(workUnitId);
  if (!ctx) return;
  const { unit, allocation } = ctx;

  const itemIds = formData.getAll("itemId").map(String);
  const day = today();
  let reqCounter = 0;

  for (const itemId of itemIds) {
    const verdict = String(formData.get(`ok_${itemId}`) ?? "");
    if (!verdict) continue;
    const ok = verdict === "ok";
    const note = String(formData.get(`note_${itemId}`) ?? "").trim() || null;
    const outcome = ok ? null : String(formData.get(`outcome_${itemId}`) ?? "propunere");
    const itemText = String(formData.get(`text_${itemId}`) ?? "");

    let outcomeRequestId: string | null = null;

    // Ieșirea care produce ceva o produce ACUM, nu „mai târziu, dacă își amintește cineva".
    if (!ok && outcome !== "rezolvat") {
      const [created] = await db
        .insert(requests)
        .values({
          code: `C-${Date.now().toString().slice(-6)}-${++reqCounter}`,
          kind: outcome === "interventie" ? "solicitare" : "propunere",
          source: "fisa_inspectie",
          title: itemText,
          description: note ?? `Punct NOK la inspecția ${unit.code}.`,
          firmId: unit.firmId,
          objectiveId: unit.objectiveId,
          contractId: allocation?.contractId ?? null,
          status: "neprocesata",
          requestedBy: session.id,
        })
        .returning();
      outcomeRequestId = created.id;
    }

    await db.insert(inspectionAnswers).values({
      workUnitId,
      itemId: itemId.startsWith("liber") ? null : itemId,
      itemText,
      ok,
      note,
      outcome,
      outcomeRequestId,
    });
  }

  await db
    .update(workUnits)
    .set({ status: "finalizata", closedAt: new Date(), endDate: day })
    .where(eq(workUnits.id, workUnitId));

  revalidatePath("/teren");
  revalidatePath(`/lucrari/${workUnitId}`);
  redirect("/teren");
}

/* ────────────────────────── T3 — intervenție ────────────────────────── */

/**
 * Un singur Trimite: orele, materialele consumate din gestiunea echipei și costurile
 * corespunzătoare, toate deodată. Materialul iese din stoc, manopera intră în pontaj,
 * ambele produc linii în registrul de cost.
 */
export async function submitIntervention(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const workUnitId = String(formData.get("workUnitId") ?? "");
  const ctx = await unitContext(workUnitId);
  if (!ctx) return;
  const { unit, allocation } = ctx;

  const day = today();
  const hours = Number(formData.get("hours") ?? 0);
  const people = Number(formData.get("people") ?? 1);
  const description = String(formData.get("description") ?? "").trim();
  const qualification = String(formData.get("qualification") ?? "muncitor");

  await db.insert(interventionDetails).values({
    workUnitId,
    description,
    hoursDeclared: String(hours),
    peopleCount: people,
    resolvedAt: new Date(),
  });

  // manopera — prin pontaj, ca să existe o singură sursă a orelor
  if (hours > 0) {
    await db.insert(timesheets).values({
      userId: session.id,
      workUnitId,
      day,
      hours: String(hours * people),
      qualification,
      note: description || null,
      createdBy: session.id,
    });

    const rate = await hourlyRate(qualification, day);
    if (rate > 0) {
      await recordCost({
        firmId: unit.firmId,
        documentDate: day,
        objectiveId: unit.objectiveId,
        workUnitId,
        usedContractId: allocation?.contractId ?? null,
        usedComponentId: allocation?.componentId ?? null,
        costType: "manopera",
        stage: "consumat",
        value: multiplyQty(rate, hours * people),
        quantity: hours * people,
        unit: "ore",
        qualification,
        documentType: "pontaj",
        createdBy: session.id,
      });
    }
  }

  // materialele consumate din gestiunea echipei
  const warehouseId = String(formData.get("warehouseId") ?? "") || null;
  const productIds = formData.getAll("productId").map(String).filter(Boolean);
  const consumed = productIds
    .map((productId) => ({
      productId,
      quantity: Number(formData.get(`qty_${productId}`) ?? 0),
    }))
    .filter((line) => line.quantity > 0);

  if (warehouseId && consumed.length) {
    const [note] = await db
      .insert(consumptionNotes)
      .values({
        code: `BC-${Date.now().toString().slice(-6)}`,
        firmId: unit.firmId,
        warehouseId,
        workUnitId,
        day,
        effectDate: day,
        note: description || null,
        createdBy: session.id,
      })
      .returning();

    for (const line of consumed) {
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
        firmId: unit.firmId,
        documentDate: day,
        objectiveId: unit.objectiveId,
        workUnitId,
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
        createdBy: session.id,
      });
    }
  }

  await db
    .update(workUnits)
    .set({ status: "finalizata", closedAt: new Date(), endDate: day })
    .where(eq(workUnits.id, workUnitId));

  revalidatePath("/teren");
  revalidatePath(`/lucrari/${workUnitId}`);
  redirect("/teren");
}

/* ──────────────────────── T4 — necesar material ──────────────────────── */

/**
 * Necesarul din teren e intrarea canalului C din §16: se naște ca draft fără furnizor
 * și stă 24 de ore la magazie, care poate să-l acopere din stoc înainte să se comande
 * ceva. Analitica stă PE LINIE, altfel raportul pe etapă rămâne gol.
 */
export async function submitMaterialNeed(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const workUnitId = String(formData.get("workUnitId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const warehouseId = String(formData.get("warehouseId") ?? "") || null;
  if (!workUnitId || !productId || quantity <= 0) return;

  const ctx = await unitContext(workUnitId);
  if (!ctx) return;
  const { unit, allocation } = ctx;

  const [productRow] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  const unitPrice = productRow ? Number(productRow.lastPrice) : 0;

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      code: `N-${Date.now().toString().slice(-6)}`,
      firmId: unit.firmId,
      channel: "lucrare",
      status: "draft",
      deliverToWarehouseId: warehouseId,
      // filtrul de 24h: magazia are o zi să acopere din stoc înainte de comandă
      warehouseCheckUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdBy: session.id,
    })
    .returning();

  await db.insert(poLines).values({
    poId: po.id,
    productId,
    quantity: String(quantity),
    unitPrice: unitPrice.toFixed(2),
    value: (unitPrice * quantity).toFixed(2),
    contractId: allocation?.contractId ?? null,
    componentId: allocation?.componentId ?? null,
    workUnitId,
  });

  revalidatePath("/teren");
  revalidatePath("/achizitii");
  redirect("/teren");
}

/* ─────────────────────────── T5 — pontaj ─────────────────────────── */

/**
 * Ziua unui om se împarte pe mai multe unități de lucru. Fără asta, alocarea costului
 * de manoperă e falsă: opt ore puse pe o singură lucrare când s-a lucrat la trei.
 */
export async function submitTimesheet(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const day = String(formData.get("day") ?? today());
  const qualification = String(formData.get("qualification") ?? "muncitor");
  const rate = await hourlyRate(qualification, day);
  const unitIds = formData.getAll("workUnitId").map(String);

  for (const workUnitId of unitIds) {
    const hours = Number(formData.get(`hours_${workUnitId}`) ?? 0);
    if (hours <= 0) continue;

    const ctx = await unitContext(workUnitId);
    if (!ctx) continue;
    const { unit, allocation } = ctx;

    await db.insert(timesheets).values({
      userId: session.id,
      workUnitId,
      day,
      hours: String(hours),
      qualification,
      createdBy: session.id,
    });

    if (rate > 0) {
      await recordCost({
        firmId: unit.firmId,
        documentDate: day,
        objectiveId: unit.objectiveId,
        workUnitId,
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

  revalidatePath("/teren");
  redirect("/teren");
}

/* ─────────────────── constatare rapidă din teren ─────────────────── */

/**
 * P8: cine are nevoie de resursă, acela deschide cererea; biroul decide.
 * Omul din teren vede ceva, îl scrie și pleacă mai departe — nu evaluează, nu rutează,
 * nu deschide lucrare. Cererea aterizează în inboxul de la ecranul 7.
 */
export async function submitObservation(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const title = String(formData.get("title") ?? "").trim();
  const objectiveId = String(formData.get("objectiveId") ?? "");
  if (!title || !objectiveId) return;

  const workUnitId = String(formData.get("workUnitId") ?? "") || null;
  const ctx = workUnitId ? await unitContext(workUnitId) : null;

  await db.insert(requests).values({
    code: `C-${Date.now().toString().slice(-6)}`,
    kind: "constatare",
    source: "manual",
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    firmId: ctx?.unit.firmId ?? null,
    objectiveId,
    contractId: ctx?.allocation?.contractId ?? null,
    status: "neprocesata",
    requestedBy: session.id,
  });

  revalidatePath("/teren");
  revalidatePath("/cereri");
  redirect("/teren");
}

/* ────────────────────── T6 — jurnal de șantier ────────────────────── */

export async function submitJournal(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const workUnitId = String(formData.get("workUnitId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!workUnitId || !text) return;

  await db.insert(siteJournalEntries).values({
    workUnitId,
    day: today(),
    text,
    weather: String(formData.get("weather") ?? "") || null,
    peopleCount: Number(formData.get("people") ?? 0) || null,
    blocker: String(formData.get("blocker") ?? "").trim() || null,
    createdBy: session.id,
  });

  revalidatePath("/teren");
  revalidatePath(`/lucrari/${workUnitId}`);
  redirect("/teren");
}
