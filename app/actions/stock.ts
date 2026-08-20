"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  poLines,
  products,
  purchaseOrders,
  stock,
  stockMovements,
  warehouses,
} from "@/lib/db/schema";
import { fromDb, parseInput, toDb } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import {
  consumeStock,
  coverFromStock,
  launchPurchaseOrder,
  receiveGoods,
  transferStock,
} from "@/lib/stock";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ───────────────────────── ecranul 23 — stoc ───────────────────────── */

export async function transferStockAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "stoc.opereaza")) return;

  const fromWarehouseId = String(formData.get("fromWarehouseId") ?? "");
  const toWarehouseId = String(formData.get("toWarehouseId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  if (!fromWarehouseId || !toWarehouseId || !productId) return;

  await transferStock({
    fromWarehouseId,
    toWarehouseId,
    productId,
    quantity,
    day: today(),
    actorId: session.id,
  });

  revalidatePath("/stoc");
}

/** Bonul de consum vine cu liniile într-un singur câmp JSON — o apăsare, un document. */
export async function createConsumption(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "stoc.opereaza")) return;

  const warehouseId = String(formData.get("warehouseId") ?? "");
  const workUnitId = String(formData.get("workUnitId") ?? "");
  const stageId = String(formData.get("stageId") ?? "") || null;
  const day = String(formData.get("day") ?? "") || today();
  const note = String(formData.get("note") ?? "") || null;
  const payload = String(formData.get("lines") ?? "[]");
  if (!warehouseId || !workUnitId) return;

  let lines: { productId: string; quantity: number }[];
  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) return;
    lines = parsed
      .map((l) => ({ productId: String(l.productId ?? ""), quantity: Number(l.quantity) || 0 }))
      .filter((l) => l.productId && l.quantity > 0);
  } catch {
    return;
  }
  if (lines.length === 0) return;

  const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
  if (!wh) return;

  await consumeStock({
    firmId: wh.firmId,
    warehouseId,
    workUnitId,
    stageId,
    day,
    note,
    lines,
    actorId: session.id,
  });

  revalidatePath("/stoc");
  revalidatePath("/stoc/consum");
  revalidatePath(`/lucrari/${workUnitId}`);
  redirect("/stoc/consum");
}

/* ───────────────────────── ecranul 24 — achiziții ───────────────────────── */

/** Canalul C: magazia spune „am pe stoc". Se rezervă, comanda nu se mai lansează. */
export async function coverNeedFromStock(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "stoc.opereaza")) return;

  const poId = String(formData.get("poId") ?? "");
  const warehouseId = String(formData.get("warehouseId") ?? "");
  if (!poId || !warehouseId) return;

  await coverFromStock({ poId, warehouseId, actorId: session.id });
  revalidatePath("/achizitii");
  revalidatePath("/stoc");
}

export async function launchOrder(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "achizitii.gestioneaza")) return;

  const poId = String(formData.get("poId") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  const deliverToWarehouseId = String(formData.get("deliverToWarehouseId") ?? "") || null;
  const confirmedDeliveryAt = String(formData.get("confirmedDeliveryAt") ?? "") || null;
  if (!poId || !supplierId) return;

  await launchPurchaseOrder({
    poId,
    supplierId,
    deliverToWarehouseId,
    orderedAt: today(),
    confirmedDeliveryAt,
    actorId: session.id,
  });

  revalidatePath("/achizitii");
  revalidatePath(`/achizitii/${poId}`);
  revalidatePath("/cost");
}

/** Analitica stă pe linie, altfel raportul pe etapă e gol (§9, §22.4). */
export async function setLineAnalytics(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "achizitii.gestioneaza")) return;

  const lineId = String(formData.get("lineId") ?? "");
  const poId = String(formData.get("poId") ?? "");
  const componentId = String(formData.get("componentId") ?? "") || null;
  const workUnitId = String(formData.get("workUnitId") ?? "") || null;
  if (!lineId) return;

  await db
    .update(poLines)
    .set({ componentId, workUnitId })
    .where(eq(poLines.id, lineId));

  revalidatePath(`/achizitii/${poId}`);
}

/** Canalul A: propunerea magaziei devine o comandă în stare de necesar. */
export async function createReplenishmentOrder(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "achizitii.gestioneaza")) return;

  const warehouseId = String(formData.get("warehouseId") ?? "");
  const productIds = formData.getAll("productId").map(String).filter(Boolean);
  if (!warehouseId || productIds.length === 0) return;

  const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
  if (!wh) return;

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      code: `PO-${Date.now().toString().slice(-6)}`,
      firmId: wh.firmId,
      channel: "replenishment",
      status: "draft",
      deliverToWarehouseId: warehouseId,
      createdBy: session.id,
    })
    .returning();

  for (const productId of productIds) {
    const qty = Number(formData.get(`qty_${productId}`) ?? 0);
    if (qty <= 0) continue;
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) continue;
    const price = fromDb(product.lastPrice);
    await db.insert(poLines).values({
      poId: po.id,
      productId,
      quantity: String(qty),
      unitPrice: toDb(price),
      value: toDb(Math.round(price * qty)),
    });
  }

  revalidatePath("/achizitii");
  redirect(`/achizitii/${po.id}`);
}

export async function cancelOrder(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "achizitii.gestioneaza")) return;
  const poId = String(formData.get("poId") ?? "");
  if (!poId) return;
  await db.update(purchaseOrders).set({ status: "anulata" }).where(eq(purchaseOrders.id, poId));
  revalidatePath("/achizitii");
  revalidatePath(`/achizitii/${poId}`);
}

/* ───────────────────────── ecranul 25 — recepție + NIR ───────────────────────── */

export async function receiveOrder(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "stoc.opereaza")) return;

  const poId = String(formData.get("poId") ?? "");
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const day = String(formData.get("day") ?? "") || today();
  const deliveryNoteRef = String(formData.get("deliveryNoteRef") ?? "") || null;
  if (!poId || !warehouseId) return;

  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).limit(1);
  if (!po) return;

  const lines = await db.select().from(poLines).where(eq(poLines.poId, poId));
  const received = lines
    .map((line) => {
      const qty = Number(formData.get(`qty_${line.id}`) ?? 0);
      const priceRaw = String(formData.get(`price_${line.id}`) ?? "");
      const lot = String(formData.get(`lot_${line.id}`) ?? "") || null;
      return {
        poLineId: line.id,
        productId: line.productId,
        quantity: qty,
        unitPrice: priceRaw ? parseInput(priceRaw) : fromDb(line.unitPrice),
        lot,
      };
    })
    .filter((l) => l.quantity > 0);

  if (received.length === 0) return;

  await receiveGoods({
    firmId: po.firmId,
    warehouseId,
    poId,
    supplierId: po.supplierId,
    day,
    deliveryNoteRef,
    lines: received,
    actorId: session.id,
  });

  revalidatePath("/receptii");
  revalidatePath("/stoc");
  revalidatePath("/cost");
}

/** Inventar: cantitatea numărată bate cantitatea din sistem. */
export async function adjustStock(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "stoc.opereaza")) return;

  const stockId = String(formData.get("stockId") ?? "");
  const counted = Number(formData.get("counted") ?? -1);
  if (!stockId || counted < 0) return;

  const [row] = await db.select().from(stock).where(eq(stock.id, stockId)).limit(1);
  if (!row) return;
  const delta = counted - Number(row.quantity);
  if (delta === 0) return;

  await db
    .update(stock)
    .set({ quantity: String(counted), updatedAt: new Date() })
    .where(eq(stock.id, stockId));

  // Diferența de inventar rămâne scrisă: o cantitate care se schimbă fără document
  // e o cantitate pe care nimeni nu o mai poate explica peste trei luni.
  await db.insert(stockMovements).values({
    kind: "inventar",
    productId: row.productId,
    fromWarehouseId: delta < 0 ? row.warehouseId : null,
    toWarehouseId: delta > 0 ? row.warehouseId : null,
    quantity: String(Math.abs(delta)),
    unitCost: row.avgCost,
    lot: row.lot,
    day: today(),
    createdBy: session.id,
  });

  revalidatePath("/stoc");
}
