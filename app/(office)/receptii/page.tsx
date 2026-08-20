import Link from "next/link";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";

import { receiveOrder } from "@/app/actions/stock";
import { Badge, Button, EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { Money } from "@/components/ui/gauge";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import {
  goodsReceipts,
  partners,
  poLines,
  products,
  purchaseOrders,
  warehouses,
  workUnits,
} from "@/lib/db/schema";
import { fromDb, toDb } from "@/lib/money";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { CHANNEL_LABEL, PO_STATUS_LABEL, PO_STATUS_TONE, formatQty } from "@/lib/stock";

export const dynamic = "force-dynamic";

/**
 * Ecranul 25 — recepție și NIR.
 *
 * Trei lucruri se întâmplă la o apăsare: marfa intră în gestiune, CMP-ul se
 * recalculează cu prețul de pe factură, iar angajamentul comenzii se stinge. Ce NU se
 * întâmplă e o linie de cheltuială — materialul din magazie e activ. Cheltuiala apare
 * pe bonul de consum, altfel aceiași bani se numără de două ori.
 */
export default async function ReceptiiPage() {
  const session = await requireSession();
  const showPrices = canSeePrices(session.role);
  const today = new Date().toISOString().slice(0, 10);

  const [open, warehouseRows, receipts] = await Promise.all([
    db
      .select({ po: purchaseOrders, supplier: partners, warehouse: warehouses })
      .from(purchaseOrders)
      .leftJoin(partners, eq(purchaseOrders.supplierId, partners.id))
      .leftJoin(warehouses, eq(purchaseOrders.deliverToWarehouseId, warehouses.id))
      .where(
        or(
          eq(purchaseOrders.status, "lansata"),
          eq(purchaseOrders.status, "confirmata"),
          eq(purchaseOrders.status, "receptionata_partial"),
        ),
      )
      .orderBy(asc(purchaseOrders.confirmedDeliveryAt))
      .limit(40),
    db
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.active, true)))
      .orderBy(asc(warehouses.code)),
    db
      .select({ receipt: goodsReceipts, warehouse: warehouses, supplier: partners })
      .from(goodsReceipts)
      .innerJoin(warehouses, eq(goodsReceipts.warehouseId, warehouses.id))
      .leftJoin(partners, eq(goodsReceipts.supplierId, partners.id))
      .orderBy(desc(goodsReceipts.createdAt))
      .limit(15),
  ]);

  const poIds = open.map((o) => o.po.id);
  const lines = poIds.length
    ? await db
        .select({ line: poLines, product: products, unit: workUnits })
        .from(poLines)
        .innerJoin(products, eq(poLines.productId, products.id))
        .leftJoin(workUnits, eq(poLines.workUnitId, workUnits.id))
        .where(inArray(poLines.poId, poIds))
    : [];

  const late = open.filter(
    (o) => o.po.confirmedDeliveryAt && o.po.confirmedDeliveryAt < today,
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Aprovizionare · ecranul 25"
        title="Recepții și NIR"
        meta="Se recepționează ce s-a descărcat efectiv, la prețul de pe factură — nu ce scria pe comandă. Din diferența dintre cele două se vede furnizorul care livrează 90% și facturează 100%."
      />

      {late > 0 ? (
        <p className="border-l-2 border-over bg-over-soft px-3 py-2 text-tiny text-over">
          {late} {late === 1 ? "comandă a depășit" : "comenzi au depășit"} data de livrare
          confirmată. Un termen depășit și netratat devine un șantier oprit peste o săptămână.
        </p>
      ) : null}

      <section className="space-y-3">
        <span className="eyebrow">Comenzi de recepționat</span>
        {open.length === 0 ? (
          <EmptyState
            title="Nicio comandă în așteptare"
            hint="Aici ajung comenzile lansate. Se lansează din ecranul de achiziții, pe unul din cele trei canale."
          />
        ) : (
          open.map(({ po, supplier, warehouse }) => {
            const own = lines.filter((l) => l.line.poId === po.id);
            const isLate = Boolean(po.confirmedDeliveryAt && po.confirmedDeliveryAt < today);
            return (
              <Sheet key={po.id} className="px-4 py-3">
                <form action={receiveOrder} className="space-y-3">
                  <input type="hidden" name="poId" value={po.id} />

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/achizitii/${po.id}`}
                        className="font-medium hover:text-blueprint"
                      >
                        {po.code}
                      </Link>
                      <Badge tone={PO_STATUS_TONE[po.status]}>{PO_STATUS_LABEL[po.status]}</Badge>
                      <span className="text-tiny text-ink-2">
                        {supplier?.name ?? "fără furnizor"} · {CHANNEL_LABEL[po.channel]}
                      </span>
                      {isLate ? <Badge tone="over">întârziat</Badge> : null}
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="block">
                        <span className="eyebrow mb-1 block">În gestiunea</span>
                        <Select
                          name="warehouseId"
                          defaultValue={po.deliverToWarehouseId ?? warehouse?.id ?? ""}
                          required
                          className="h-8 w-52 text-tiny"
                        >
                          <option value="" disabled>
                            Alege gestiunea
                          </option>
                          {warehouseRows.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.code} · {w.name}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="block">
                        <span className="eyebrow mb-1 block">Zi</span>
                        <Input
                          type="date"
                          name="day"
                          defaultValue={today}
                          className="h-8 w-36 text-tiny"
                        />
                      </label>
                      <label className="block">
                        <span className="eyebrow mb-1 block">Aviz</span>
                        <Input
                          name="deliveryNoteRef"
                          placeholder="serie / nr."
                          className="h-8 w-32 text-tiny"
                        />
                      </label>
                      <Button type="submit" variant="primary" size="sm">
                        Fac NIR-ul
                      </Button>
                    </div>
                  </div>

                  <Table>
                    <THead>
                      <TR>
                        <TH>Produs</TH>
                        <TH>Pentru</TH>
                        <TH numeric>Comandat</TH>
                        <TH numeric>Primit deja</TH>
                        <TH numeric>Primesc acum</TH>
                        {showPrices ? <TH numeric>Preț facturat</TH> : null}
                        <TH>Lot</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {own.map(({ line, product, unit }) => {
                        const rest = Number(line.quantity) - Number(line.receivedQty);
                        return (
                          <TR key={line.id}>
                            <TD>
                              <span className="font-medium">{product.name}</span>
                              <span className="ml-2 text-micro text-ink-3">{product.code}</span>
                            </TD>
                            <TD muted>{unit ? unit.code : "stoc"}</TD>
                            <TD numeric>{formatQty(line.quantity, product.unit)}</TD>
                            <TD numeric muted>{formatQty(line.receivedQty)}</TD>
                            <TD numeric>
                              <Input
                                name={`qty_${line.id}`}
                                type="number"
                                step="0.01"
                                min="0"
                                defaultValue={rest > 0 ? String(rest) : "0"}
                                className="h-8 w-24 text-right text-tiny tabular"
                              />
                            </TD>
                            {showPrices ? (
                              <TD numeric>
                                <Input
                                  name={`price_${line.id}`}
                                  defaultValue={toDb(fromDb(line.unitPrice))}
                                  className="h-8 w-24 text-right text-tiny tabular"
                                />
                              </TD>
                            ) : null}
                            <TD>
                              {product.tracksLots ? (
                                <Input
                                  name={`lot_${line.id}`}
                                  placeholder="lot"
                                  className="h-8 w-28 text-tiny"
                                />
                              ) : (
                                <span className="text-micro text-ink-3">—</span>
                              )}
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>

                  {own.some((l) => l.unit?.autoConsumeOnReceipt) ? (
                    <p className="text-micro text-ink-3">
                      Lucrarea are auto-consum la recepție (§22.1): materialul intră în gestiune și
                      iese pe bon de consum în aceeași apăsare. Pe un șantier mic nimeni nu scrie
                      două hârtii pentru același sac de ciment.
                    </p>
                  ) : null}
                </form>
              </Sheet>
            );
          })
        )}
      </section>

      <section className="space-y-2">
        <span className="eyebrow">NIR-uri emise</span>
        {receipts.length === 0 ? (
          <EmptyState title="Niciun NIR încă" />
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>NIR</TH>
                  <TH>Zi</TH>
                  <TH>Gestiune</TH>
                  <TH>Furnizor</TH>
                  <TH>Aviz</TH>
                  {showPrices ? <TH numeric>Valoare</TH> : null}
                </TR>
              </THead>
              <TBody>
                {receipts.map(({ receipt, warehouse, supplier }) => (
                  <TR key={receipt.id}>
                    <TD className="font-medium">{receipt.code}</TD>
                    <TD muted>{receipt.day}</TD>
                    <TD muted>{warehouse.code}</TD>
                    <TD muted>{supplier?.name ?? "—"}</TD>
                    <TD muted>{receipt.deliveryNoteRef ?? "—"}</TD>
                    {showPrices ? (
                      <TD numeric>
                        <Money value={fromDb(receipt.totalValue)} unit={null} />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          </Sheet>
        )}
      </section>
    </div>
  );
}
