"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql as raw } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  objectives,
  poLines,
  products,
  purchaseOrders,
  requests,
  transports,
  warehouses,
  workUnits,
} from "@/lib/db/schema";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { activeAllocation } from "@/lib/work-units";

/**
 * Comenzile din teren (blocul F): coșul, utilajul și transportul.
 *
 * Toate patru tipurile — materiale, unelte, utilaj, transport — ajung în aceeași listă
 * „Comenzi", pentru că omul din teren nu vrea să știe în ce tabelă a aterizat cererea lui.
 * În spate aterizează unde trebuie: materialele și uneltele ca `purchase_orders` pe canalul
 * C (cu filtrul de 24 de ore al magaziei), utilajul ca `request` de rutat, transportul ca
 * `transport` în coada centrală.
 *
 * Zero prețuri pleacă de aici. Prețul îl pune achiziția, când alege furnizorul.
 */

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function code(prefix: string): string {
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

/**
 * Coșul, trimis într-o singură bucată.
 *
 * Analitica stă PE LINIE (contract, componentă, unitate de lucru, etapă) — pusă pe antet
 * ar face raportul pe etapă gol. Antetul poartă doar ce ține de livrare: când trebuie,
 * unde se descarcă, cât de tare arde.
 */
export async function submitCart(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const workUnitId = String(formData.get("workUnitId") ?? "");
  if (!workUnitId) return;

  const [unit] = await db.select().from(workUnits).where(eq(workUnits.id, workUnitId)).limit(1);
  if (!unit) return;

  const lines = formData
    .getAll("productId")
    .map(String)
    .filter(Boolean)
    .map((productId) => ({ productId, quantity: Number(formData.get(`qty_${productId}`) ?? 0) }))
    .filter((line) => line.quantity > 0);
  if (lines.length === 0) return;

  const allocation = await activeAllocation(workUnitId);

  // gestiunea de șantier a lucrării, dacă există — acolo se livrează
  const [siteWarehouse] = await db
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.workUnitId, workUnitId), eq(warehouses.active, true)))
    .limit(1);

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      code: code("N"),
      firmId: unit.firmId,
      channel: "lucrare",
      status: "draft",
      deliverToWarehouseId: siteWarehouse?.id ?? null,
      // filtrul de 24h: magazia are o zi să acopere din stoc înainte de comandă (§16)
      warehouseCheckUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      neededBy: String(formData.get("neededBy") ?? "") || null,
      dropPoint: String(formData.get("dropPoint") ?? "").trim() || null,
      urgency: (String(formData.get("urgency") ?? "normal") as
        | "poate_astepta"
        | "normal"
        | "urgent"),
      fieldNote: String(formData.get("fieldNote") ?? "").trim() || null,
      createdBy: session.id,
    })
    .returning();

  const stageId = String(formData.get("stageId") ?? "") || null;

  for (const line of lines) {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, line.productId))
      .limit(1);
    const unitPrice = product ? Number(product.lastPrice) : 0;

    await db.insert(poLines).values({
      poId: po.id,
      productId: line.productId,
      quantity: String(line.quantity),
      unitPrice: unitPrice.toFixed(2),
      value: (unitPrice * line.quantity).toFixed(2),
      contractId: allocation?.contractId ?? null,
      componentId: allocation?.componentId ?? null,
      workUnitId,
      stageId,
    });
  }

  revalidatePath("/teren/comenzi");
  revalidatePath("/achizitii");
  redirect(`/teren/comenzi/${po.id}`);
}

/**
 * Cererea de utilaj. Nu e comandă: trece prin aprobarea PM-ului, deci se naște ca
 * cerere de rutat, nu ca linie de achiziție (§18.1.2).
 */
export async function requestEquipmentFromField(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "flota.solicita")) return;

  const workUnitId = String(formData.get("workUnitId") ?? "");
  const category = String(formData.get("category") ?? "").trim();
  if (!workUnitId || !category) return;

  const [unit] = await db.select().from(workUnits).where(eq(workUnits.id, workUnitId)).limit(1);
  if (!unit) return;

  const allocation = await activeAllocation(workUnitId);
  const from = String(formData.get("fromDate") ?? today());
  const to = String(formData.get("toDate") ?? from);
  const details = String(formData.get("details") ?? "").trim();

  await db.insert(requests).values({
    code: code("U"),
    kind: "solicitare_utilaj",
    source: "manual",
    title: `${category}${details ? ` — ${details}` : ""}`,
    description: [
      `Perioada ${from} – ${to}.`,
      String(formData.get("purpose") ?? "").trim(),
    ]
      .filter(Boolean)
      .join(" "),
    firmId: unit.firmId,
    objectiveId: unit.objectiveId,
    contractId: allocation?.contractId ?? null,
    status: "neprocesata",
    requestedBy: session.id,
  });

  revalidatePath("/teren/comenzi");
  revalidatePath("/utilaje/solicitari");
  redirect("/teren/comenzi");
}

/** Cererea de transport — intră direct în coada centrală de transporturi (§18). */
export async function requestTransportFromField(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const workUnitId = String(formData.get("workUnitId") ?? "");
  if (!workUnitId) return;

  const [unit] = await db.select().from(workUnits).where(eq(workUnits.id, workUnitId)).limit(1);
  if (!unit) return;

  const toObjectiveId = String(formData.get("toObjectiveId") ?? "") || null;
  const [target] = toObjectiveId
    ? await db.select().from(objectives).where(eq(objectives.id, toObjectiveId)).limit(1)
    : [];

  await db.insert(transports).values({
    code: code("T"),
    kind: (String(formData.get("kind") ?? "livrare_material") as
      | "livrare_material"
      | "transfer_santiere"
      | "retur_magazie"
      | "evacuare_moloz"
      | "transport_utilaj"),
    status: "ceruta",
    fromText: String(formData.get("fromText") ?? "").trim() || null,
    toText: target?.name ?? (String(formData.get("toText") ?? "").trim() || null),
    toObjectiveId,
    workUnitId,
    day: String(formData.get("day") ?? today()),
    description: String(formData.get("description") ?? "").trim() || null,
    requestedBy: session.id,
  });

  revalidatePath("/teren/comenzi");
  revalidatePath("/transporturi");
  redirect("/teren/comenzi");
}

/** Confirmarea din teren că marfa a sosit: doar semnalul, recepția o face magazia. */
export async function confirmOrderArrival(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const id = String(formData.get("poId") ?? "");
  if (!id) return;

  await db
    .update(purchaseOrders)
    .set({ fieldNote: raw`coalesce(${purchaseOrders.fieldNote} || ' · ', '') || 'confirmat sosit din teren'` })
    .where(eq(purchaseOrders.id, id));

  revalidatePath(`/teren/comenzi/${id}`);
  revalidatePath("/receptii");
}
