/**
 * Blocul C2 — stoc și achiziții (ecranele 23–25, §16 și §17 din documentul de business).
 *
 * Trei reguli țin tot fișierul:
 *
 * 1. **Gestiunea e un LOC FIZIC.** Nu „gestiunea de mentenanță a contractului X" —
 *    marfa stă undeva, iar cine plătește se decide pe bonul de consum, nu pe raft.
 * 2. **Disponibil = cantitate − rezervat.** Rezervarea nu mută marfa, doar o promite.
 *    Fără linia asta, două echipe pleacă spre același palet.
 * 3. **Materialul devine cost la CONSUM, nu la recepție.** În magazie e activ, nu
 *    cheltuială. Comanda lansată scrie un angajament (`angajat`), recepția îl stinge,
 *    bonul de consum scrie costul real, la CMP. Așa nu se numără aceiași bani de două ori.
 */

import { and, asc, desc, eq, inArray, isNull, or, sql as raw } from "drizzle-orm";

import { recordCost, releaseCommitment } from "./cost-ledger";
import { db } from "./db";
import {
  consumptionLines,
  consumptionNotes,
  fundingAllocations,
  goodsReceipts,
  poLines,
  products,
  purchaseOrders,
  stock,
  stockMovements,
  warehouses,
  workUnits,
} from "./db/schema";
import { fromDb, toDb, type Bani } from "./money";

/* ─────────────────────────── etichete ─────────────────────────── */

export const WAREHOUSE_KIND_LABEL = {
  centrala: "Magazie centrală",
  santier: "Șantier",
  echipa: "Echipă",
  subcontractant: "Custodie subcontractant",
  consignatie: "Consignație",
  unelte: "Unelte",
} as const;

export const PO_STATUS_LABEL = {
  draft: "Necesar",
  lansata: "Lansată",
  confirmata: "Confirmată",
  receptionata_partial: "Recepționată parțial",
  receptionata: "Recepționată",
  anulata: "Anulată",
} as const;

export const PO_STATUS_TONE = {
  draft: "neutral",
  lansata: "blueprint",
  confirmata: "blueprint",
  receptionata_partial: "warn",
  receptionata: "fill",
  anulata: "neutral",
} as const;

/** Cele 3 canale din §16 — trei fluxuri diferite, nu trei etichete pe același flux. */
export const CHANNEL_LABEL = {
  replenishment: "A · Reaprovizionare",
  urgenta: "B · Urgență",
  lucrare: "C · Necesar de lucrare",
} as const;

export const CHANNEL_HINT = {
  replenishment: "Stocul scade sub minim, magazia propune, achizițiile comandă. Fără presiune de timp.",
  urgenta: "Cineva are nevoie azi. Se comandă întâi, se justifică pe urmă — dar se justifică.",
  lucrare: "Vine din teren cu analitică pe linie. Trece întâi prin magazie: 24h să acopere din stoc.",
} as const;

export const MOVEMENT_LABEL = {
  nir: "Recepție (NIR)",
  consum: "Consum",
  transfer: "Transfer",
  retur: "Retur",
  inventar: "Inventar",
} as const;

/* ─────────────────────────── funcții pure ─────────────────────────── */

export function available(quantity: string | number, reserved: string | number): number {
  return Number(quantity) - Number(reserved);
}

export type StockSignal = "sub_minim" | "peste_maxim" | "epuizat" | "ok";

export function stockSignal(
  quantity: string | number,
  reserved: string | number,
  minStock: string | number,
  maxStock: string | number,
): StockSignal {
  const free = available(quantity, reserved);
  if (free <= 0) return "epuizat";
  if (Number(minStock) > 0 && free < Number(minStock)) return "sub_minim";
  if (Number(maxStock) > 0 && Number(quantity) > Number(maxStock)) return "peste_maxim";
  return "ok";
}

export const SIGNAL_LABEL: Record<StockSignal, string> = {
  epuizat: "Epuizat",
  sub_minim: "Sub minim",
  peste_maxim: "Peste maxim",
  ok: "În bandă",
};

export const SIGNAL_TONE: Record<StockSignal, "over" | "warn" | "neutral" | "fill"> = {
  epuizat: "over",
  sub_minim: "warn",
  peste_maxim: "neutral",
  ok: "fill",
};

/** Cost mediu ponderat: (stoc vechi × CMP vechi + intrare × preț) / total. */
export function weightedAverage(
  oldQty: number,
  oldAvg: Bani,
  inQty: number,
  inPrice: Bani,
): Bani {
  const total = oldQty + inQty;
  if (total <= 0) return inPrice;
  return Math.round((oldQty * oldAvg + inQty * inPrice) / total);
}

/** Câte ore mai are magazia la dispoziție pe filtrul de 24h (§16, canalul C). */
export function hoursLeft(until: Date | null): number | null {
  if (!until) return null;
  return Math.round(((until.getTime() - Date.now()) / 3_600_000) * 10) / 10;
}

export function formatQty(value: string | number, unit?: string | null): string {
  const n = Number(value);
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return unit ? `${s} ${unit}` : s;
}

/* ─────────────────────────── mișcarea stocului ─────────────────────────── */

async function stockLine(warehouseId: string, productId: string, lot: string | null) {
  const [row] = await db
    .select()
    .from(stock)
    .where(
      and(
        eq(stock.warehouseId, warehouseId),
        eq(stock.productId, productId),
        lot ? eq(stock.lot, lot) : isNull(stock.lot),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Intrare în stoc, cu recalculul CMP. Singurul loc unde crește o cantitate.
 */
async function stockIn(
  warehouseId: string,
  productId: string,
  quantity: number,
  unitPrice: Bani,
  lot: string | null,
) {
  const existing = await stockLine(warehouseId, productId, lot);
  if (!existing) {
    await db.insert(stock).values({
      warehouseId,
      productId,
      quantity: String(quantity),
      avgCost: toDb(unitPrice),
      lot,
    });
    return unitPrice;
  }
  const avg = weightedAverage(
    Number(existing.quantity),
    fromDb(existing.avgCost),
    quantity,
    unitPrice,
  );
  await db
    .update(stock)
    .set({
      quantity: String(Number(existing.quantity) + quantity),
      avgCost: toDb(avg),
      updatedAt: new Date(),
    })
    .where(eq(stock.id, existing.id));
  return avg;
}

/** Ieșire din stoc. Întoarce CMP-ul la care a ieșit — el devine valoarea din registru. */
async function stockOut(
  warehouseId: string,
  productId: string,
  quantity: number,
  lot: string | null,
) {
  const existing = await stockLine(warehouseId, productId, lot);
  if (!existing) return null;
  const avg = fromDb(existing.avgCost);
  await db
    .update(stock)
    .set({
      quantity: String(Math.max(0, Number(existing.quantity) - quantity)),
      // ce iese nu mai are de ce să rămână rezervat
      reserved: String(Math.max(0, Number(existing.reserved) - quantity)),
      updatedAt: new Date(),
    })
    .where(eq(stock.id, existing.id));
  return avg;
}

/* ─────────────────────────── operațiuni ─────────────────────────── */

export type ReceiptLine = {
  poLineId?: string | null;
  productId: string;
  quantity: number;
  unitPrice: Bani;
  lot?: string | null;
};

/**
 * Ecranul 25 — recepție + NIR.
 *
 * NIR-ul mută marfa în gestiune la prețul de pe factură și recalculează CMP-ul.
 * NU scrie cost: materialul din magazie e activ, nu cheltuială. Ce face în schimb e
 * să stingă angajamentul lăsat de comanda lansată — un angajament recepționat nu mai
 * avertizează pe nimeni, doar dublează cifra.
 */
export async function receiveGoods(params: {
  firmId: string;
  warehouseId: string;
  poId?: string | null;
  supplierId?: string | null;
  day: string;
  deliveryNoteRef?: string | null;
  lines: ReceiptLine[];
  actorId?: string | null;
}) {
  const lines = params.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return null;

  const totalValue = lines.reduce((a, l) => a + Math.round(l.unitPrice * l.quantity), 0);

  const [receipt] = await db
    .insert(goodsReceipts)
    .values({
      code: `NIR-${Date.now().toString().slice(-6)}`,
      poId: params.poId ?? null,
      warehouseId: params.warehouseId,
      supplierId: params.supplierId ?? null,
      day: params.day,
      deliveryNoteRef: params.deliveryNoteRef ?? null,
      totalValue: toDb(totalValue),
      createdBy: params.actorId ?? null,
    })
    .returning();

  for (const line of lines) {
    await stockIn(
      params.warehouseId,
      line.productId,
      line.quantity,
      line.unitPrice,
      line.lot ?? null,
    );

    await db.insert(stockMovements).values({
      kind: "nir",
      productId: line.productId,
      toWarehouseId: params.warehouseId,
      quantity: String(line.quantity),
      unitCost: toDb(line.unitPrice),
      lot: line.lot ?? null,
      documentType: "goods_receipt",
      documentId: receipt.id,
      day: params.day,
      createdBy: params.actorId ?? null,
    });

    // prețul de pe ultima factură devine referința de cost pentru estimări
    await db
      .update(products)
      .set({ lastPrice: toDb(line.unitPrice) })
      .where(eq(products.id, line.productId));

    if (line.poLineId) {
      const [pl] = await db.select().from(poLines).where(eq(poLines.id, line.poLineId)).limit(1);
      if (pl) {
        await db
          .update(poLines)
          .set({ receivedQty: String(Number(pl.receivedQty) + line.quantity) })
          .where(eq(poLines.id, pl.id));
      }
    }
  }

  if (params.poId) await settlePurchaseOrder(params.poId, params.warehouseId, params.day, params.actorId);

  return receipt;
}

/**
 * După recepție: comanda e complet acoperită sau nu, angajamentul se stinge la fel de
 * mult, iar lucrările cu auto-consum (§22.1) își consumă materialul pe loc — pe un
 * șantier mic nimeni nu scrie bon de consum pentru sacul de ciment descărcat azi.
 */
async function settlePurchaseOrder(
  poId: string,
  warehouseId: string,
  day: string,
  actorId?: string | null,
) {
  const lines = await db.select().from(poLines).where(eq(poLines.poId, poId));
  if (lines.length === 0) return;

  const complete = lines.every((l) => Number(l.receivedQty) >= Number(l.quantity));
  await db
    .update(purchaseOrders)
    .set({ status: complete ? "receptionata" : "receptionata_partial" })
    .where(eq(purchaseOrders.id, poId));

  if (complete) await releaseCommitment("purchase_order", poId);

  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).limit(1);
  if (!po) return;

  const autoIds = new Set<string>();
  for (const line of lines) {
    if (!line.workUnitId) continue;
    const [unit] = await db
      .select()
      .from(workUnits)
      .where(eq(workUnits.id, line.workUnitId))
      .limit(1);
    if (unit?.autoConsumeOnReceipt) autoIds.add(line.workUnitId);
  }

  for (const workUnitId of autoIds) {
    const own = lines.filter((l) => l.workUnitId === workUnitId);
    await consumeStock({
      firmId: po.firmId,
      warehouseId,
      workUnitId,
      stageId: own[0]?.stageId ?? null,
      day,
      note: `Auto-consum la recepția ${po.code} (§22.1)`,
      lines: own.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
      actorId,
    });
  }
}

/**
 * Bonul de consum — momentul în care materialul devine cost.
 *
 * Valoarea e la CMP-ul gestiunii, nu la prețul de pe ultima factură: dacă ai în magazie
 * trei livrări la trei prețuri, ce iese pe ușă are prețul mediu, altfel ultima factură
 * rescrie retroactiv costul lucrărilor de luna trecută.
 */
export async function consumeStock(params: {
  firmId: string;
  warehouseId: string;
  workUnitId: string;
  stageId?: string | null;
  day: string;
  note?: string | null;
  lines: { productId: string; quantity: number; lot?: string | null }[];
  actorId?: string | null;
}) {
  const lines = params.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return null;

  const [unit] = await db
    .select()
    .from(workUnits)
    .where(eq(workUnits.id, params.workUnitId))
    .limit(1);
  if (!unit) return null;

  const [allocation] = await db
    .select()
    .from(fundingAllocations)
    .where(
      and(
        eq(fundingAllocations.workUnitId, params.workUnitId),
        eq(fundingAllocations.status, "activ"),
      ),
    )
    .limit(1);

  const [note] = await db
    .insert(consumptionNotes)
    .values({
      code: `BC-${Date.now().toString().slice(-6)}`,
      firmId: params.firmId,
      warehouseId: params.warehouseId,
      workUnitId: params.workUnitId,
      stageId: params.stageId ?? null,
      day: params.day,
      effectDate: params.day,
      note: params.note ?? null,
      createdBy: params.actorId ?? null,
    })
    .returning();

  for (const line of lines) {
    const avg = await stockOut(
      params.warehouseId,
      line.productId,
      line.quantity,
      line.lot ?? null,
    );
    if (avg === null) continue;
    const value = Math.round(avg * line.quantity);

    await db.insert(consumptionLines).values({
      noteId: note.id,
      productId: line.productId,
      quantity: String(line.quantity),
      unitCost: toDb(avg),
      value: toDb(value),
      lot: line.lot ?? null,
    });

    await db.insert(stockMovements).values({
      kind: "consum",
      productId: line.productId,
      fromWarehouseId: params.warehouseId,
      quantity: String(line.quantity),
      unitCost: toDb(avg),
      lot: line.lot ?? null,
      documentType: "consumption_note",
      documentId: note.id,
      day: params.day,
      createdBy: params.actorId ?? null,
    });

    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, line.productId))
      .limit(1);

    // Regula 1: fiecare leu trece pe aici.
    await recordCost({
      firmId: params.firmId,
      documentDate: params.day,
      objectiveId: unit.objectiveId,
      workUnitId: params.workUnitId,
      stageId: params.stageId ?? null,
      usedContractId: allocation?.contractId ?? null,
      usedComponentId: allocation?.componentId ?? null,
      costType: "material",
      stage: "consumat",
      value,
      quantity: line.quantity,
      unit: product?.unit ?? null,
      productId: line.productId,
      documentType: "consumption_note",
      documentId: note.id,
      note: params.note ?? null,
      createdBy: params.actorId ?? null,
    });
  }

  return note;
}

/** Transfer între gestiuni: marfa se mută, costul nu se atinge. */
export async function transferStock(params: {
  fromWarehouseId: string;
  toWarehouseId: string;
  productId: string;
  quantity: number;
  day: string;
  actorId?: string | null;
}) {
  if (params.quantity <= 0 || params.fromWarehouseId === params.toWarehouseId) return;
  const avg = await stockOut(params.fromWarehouseId, params.productId, params.quantity, null);
  if (avg === null) return;
  await stockIn(params.toWarehouseId, params.productId, params.quantity, avg, null);
  await db.insert(stockMovements).values({
    kind: "transfer",
    productId: params.productId,
    fromWarehouseId: params.fromWarehouseId,
    toWarehouseId: params.toWarehouseId,
    quantity: String(params.quantity),
    unitCost: toDb(avg),
    day: params.day,
    createdBy: params.actorId ?? null,
  });
}

/**
 * Filtrul de 24h (§16, canalul C): magazia răspunde „am pe stoc".
 * Marfa se rezervă, nu se mută — mutarea are nevoie de transport și de o zi.
 */
export async function coverFromStock(params: {
  poId: string;
  warehouseId: string;
  actorId?: string | null;
}) {
  const lines = await db.select().from(poLines).where(eq(poLines.poId, params.poId));
  for (const line of lines) {
    const row = await stockLine(params.warehouseId, line.productId, null);
    if (!row) continue;
    await db
      .update(stock)
      .set({
        reserved: String(Number(row.reserved) + Number(line.quantity)),
        updatedAt: new Date(),
      })
      .where(eq(stock.id, row.id));
  }
  await db
    .update(purchaseOrders)
    .set({
      warehouseCoveredFromStock: true,
      warehouseCheckUntil: null,
      status: "anulata",
      deliverToWarehouseId: params.warehouseId,
      approvedBy: params.actorId ?? null,
    })
    .where(eq(purchaseOrders.id, params.poId));
}

/**
 * Lansarea comenzii: aici se naște angajamentul. E singurul strat care te anunță
 * despre o depășire ÎNAINTE să se întâmple (P6) — la recepție e deja târziu.
 */
export async function launchPurchaseOrder(params: {
  poId: string;
  supplierId: string;
  deliverToWarehouseId?: string | null;
  orderedAt: string;
  confirmedDeliveryAt?: string | null;
  actorId?: string | null;
}) {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, params.poId))
    .limit(1);
  if (!po || po.status !== "draft") return;

  await db
    .update(purchaseOrders)
    .set({
      supplierId: params.supplierId,
      status: "lansata",
      orderedAt: params.orderedAt,
      confirmedDeliveryAt: params.confirmedDeliveryAt ?? null,
      deliverToWarehouseId: params.deliverToWarehouseId ?? po.deliverToWarehouseId,
      warehouseCheckUntil: null,
      approvedBy: params.actorId ?? null,
    })
    .where(eq(purchaseOrders.id, po.id));

  const lines = await db.select().from(poLines).where(eq(poLines.poId, po.id));
  for (const line of lines) {
    const [unit] = line.workUnitId
      ? await db.select().from(workUnits).where(eq(workUnits.id, line.workUnitId)).limit(1)
      : [null];
    await recordCost({
      firmId: po.firmId,
      documentDate: params.orderedAt,
      objectiveId: unit?.objectiveId ?? null,
      workUnitId: line.workUnitId,
      stageId: line.stageId,
      usedContractId: line.contractId,
      usedComponentId: line.componentId,
      costType: "material",
      stage: "angajat",
      value: fromDb(line.value),
      quantity: Number(line.quantity),
      productId: line.productId,
      documentType: "purchase_order",
      documentId: po.id,
      supplierId: params.supplierId,
      note: `Comandă ${po.code}`,
      createdBy: params.actorId ?? null,
    });
  }
}

/* ─────────────────────────── interogări ─────────────────────────── */

/** Canalul A: ce a scăzut sub minim în magazia centrală (§16). */
export async function replenishmentSuggestions(firmId: string) {
  return db
    .select({
      stockId: stock.id,
      warehouseId: stock.warehouseId,
      warehouseName: warehouses.name,
      product: products,
      quantity: stock.quantity,
      reserved: stock.reserved,
      avgCost: stock.avgCost,
    })
    .from(stock)
    .innerJoin(warehouses, eq(stock.warehouseId, warehouses.id))
    .innerJoin(products, eq(stock.productId, products.id))
    .where(
      and(
        eq(warehouses.firmId, firmId),
        eq(warehouses.kind, "centrala"),
        raw`${stock.quantity} - ${stock.reserved} < ${products.minStock}`,
      ),
    )
    .orderBy(desc(products.leadTimeDays), asc(products.name));
}

/** Necesarul din teren care încă e în fereastra de 24h a magaziei. */
export async function pendingFieldNeeds(firmId: string) {
  return db
    .select({ po: purchaseOrders, warehouse: warehouses })
    .from(purchaseOrders)
    .leftJoin(warehouses, eq(purchaseOrders.deliverToWarehouseId, warehouses.id))
    .where(
      and(
        eq(purchaseOrders.firmId, firmId),
        eq(purchaseOrders.status, "draft"),
        eq(purchaseOrders.channel, "lucrare"),
      ),
    )
    .orderBy(asc(purchaseOrders.warehouseCheckUntil));
}

export async function openPurchaseOrders(firmId: string) {
  return db
    .select()
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.firmId, firmId),
        or(
          eq(purchaseOrders.status, "lansata"),
          eq(purchaseOrders.status, "confirmata"),
          eq(purchaseOrders.status, "receptionata_partial"),
        ),
      ),
    )
    .orderBy(asc(purchaseOrders.orderedAt));
}

export async function linesOfOrders(poIds: string[]) {
  if (poIds.length === 0) return [];
  return db
    .select({ line: poLines, product: products })
    .from(poLines)
    .innerJoin(products, eq(poLines.productId, products.id))
    .where(inArray(poLines.poId, poIds));
}
