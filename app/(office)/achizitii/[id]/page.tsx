import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, ne, sql as raw } from "drizzle-orm";

import { cancelOrder, launchOrder, setLineAnalytics } from "@/app/actions/stock";
import { Badge, Button, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { Money } from "@/components/ui/gauge";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { DataPair } from "@/components/ui/tabs";
import { db } from "@/lib/db";
import {
  contractComponents,
  contracts,
  partners,
  poLines,
  products,
  purchaseOrders,
  warehouses,
  workUnits,
} from "@/lib/db/schema";
import { fromDb } from "@/lib/money";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { CHANNEL_LABEL, PO_STATUS_LABEL, PO_STATUS_TONE, formatQty, hoursLeft } from "@/lib/stock";

export const dynamic = "force-dynamic";

/**
 * Ecranul 24, detaliul comenzii.
 *
 * Analitica stă **pe linie**, nu pe comandă: o comandă de la același furnizor poate
 * conține material pentru trei lucrări. Pusă pe antet, raportul pe etapă rămâne gol
 * și nimeni nu mai știe pentru cine s-a cumpărat (§9, §22.4).
 */
export default async function ComandaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const showPrices = canSeePrices(session.role);

  const [row] = await db
    .select({ po: purchaseOrders, supplier: partners, warehouse: warehouses })
    .from(purchaseOrders)
    .leftJoin(partners, eq(purchaseOrders.supplierId, partners.id))
    .leftJoin(warehouses, eq(purchaseOrders.deliverToWarehouseId, warehouses.id))
    .where(eq(purchaseOrders.id, id))
    .limit(1);

  if (!row) notFound();
  const { po } = row;

  const [lines, suppliers, warehouseRows, unitRows, componentRows] = await Promise.all([
    db
      .select({ line: poLines, product: products, unit: workUnits })
      .from(poLines)
      .innerJoin(products, eq(poLines.productId, products.id))
      .leftJoin(workUnits, eq(poLines.workUnitId, workUnits.id))
      .where(eq(poLines.poId, po.id))
      .orderBy(asc(products.name)),
    db
      .select()
      .from(partners)
      .where(raw`'furnizor' = any(${partners.types})`)
      .orderBy(asc(partners.name)),
    db
      .select()
      .from(warehouses)
      .where(eq(warehouses.active, true))
      .orderBy(asc(warehouses.code)),
    db
      .select()
      .from(workUnits)
      .where(ne(workUnits.status, "anulata"))
      .orderBy(asc(workUnits.code))
      .limit(150),
    db
      .select({ component: contractComponents, contract: contracts })
      .from(contractComponents)
      .innerJoin(contracts, eq(contractComponents.contractId, contracts.id))
      .orderBy(asc(contracts.code)),
  ]);

  const total = lines.reduce((a, l) => a + fromDb(l.line.value), 0);
  const received = lines.reduce((a, l) => a + Number(l.line.receivedQty), 0);
  const ordered = lines.reduce((a, l) => a + Number(l.line.quantity), 0);
  const isDraft = po.status === "draft";
  const left = hoursLeft(po.warehouseCheckUntil);
  const unmapped = lines.filter((l) => !l.line.componentId && !l.line.workUnitId).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href={`/achizitii?canal=${po.channel}`} className="hover:text-blueprint">
            ← {CHANNEL_LABEL[po.channel]}
          </Link>
        }
        title={po.code}
        meta={
          isDraft
            ? "Necesar. Nu s-a comandat nimic încă — la lansare se scrie un angajament în registrul de cost, care avertizează despre depășire înainte să se întâmple."
            : "Comandă lansată. Angajamentul e în registru și se stinge la recepția completă."
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={PO_STATUS_TONE[po.status]}>{PO_STATUS_LABEL[po.status]}</Badge>
            {po.status !== "anulata" && po.status !== "receptionata" ? (
              <form action={cancelOrder}>
                <input type="hidden" name="poId" value={po.id} />
                <Button type="submit" size="sm">
                  Anulez
                </Button>
              </form>
            ) : null}
          </div>
        }
      />

      <Sheet className="grid gap-4 px-4 py-3 md:grid-cols-5">
        <DataPair label="Canal">{CHANNEL_LABEL[po.channel]}</DataPair>
        <DataPair label="Furnizor">{row.supplier?.name ?? "— nealeș —"}</DataPair>
        <DataPair label="Livrare la">{row.warehouse?.name ?? "—"}</DataPair>
        <DataPair label="Lansată" numeric>
          {po.orderedAt ?? "—"}
        </DataPair>
        <DataPair label="Recepționat" numeric>
          {formatQty(received)} / {formatQty(ordered)}
        </DataPair>
      </Sheet>

      {isDraft && left !== null ? (
        <p
          className={`border-l-2 px-3 py-2 text-tiny ${
            left <= 0 ? "border-over bg-over-soft text-over" : "border-warn bg-warn-soft text-warn"
          }`}
        >
          {left <= 0
            ? "Fereastra de 24h a magaziei a expirat. Dacă nu s-a acoperit din stoc, se comandă."
            : `Magazia mai are ${left} ore în care poate acoperi necesarul din stoc, fără comandă.`}
        </p>
      ) : null}

      {unmapped > 0 ? (
        <p className="border-l-2 border-warn bg-warn-soft px-3 py-2 text-tiny text-warn">
          {unmapped} {unmapped === 1 ? "linie nu are" : "linii nu au"} analitică. Materialul se va
          recepționa, dar la sfârșitul lunii nu-l revendică nicio componentă.
        </p>
      ) : null}

      <section className="space-y-2">
        <span className="eyebrow">Linii — analitica stă aici, nu pe antet</span>
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Produs</TH>
                <TH numeric>Cantitate</TH>
                <TH numeric>Primit</TH>
                {showPrices ? <TH numeric>Preț</TH> : null}
                {showPrices ? <TH numeric>Valoare</TH> : null}
                <TH>Pe componenta</TH>
                <TH>Pe lucrarea</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {lines.map(({ line, product, unit }) => (
                <TR key={line.id}>
                  <TD>
                    <span className="font-medium">{product.name}</span>
                    <span className="ml-2 text-micro text-ink-3">{product.code}</span>
                  </TD>
                  <TD numeric>{formatQty(line.quantity, product.unit)}</TD>
                  <TD
                    numeric
                    className={
                      Number(line.receivedQty) >= Number(line.quantity) ? "text-fill" : undefined
                    }
                  >
                    {formatQty(line.receivedQty)}
                  </TD>
                  {showPrices ? (
                    <TD numeric muted>
                      <Money value={fromDb(line.unitPrice)} unit={null} />
                    </TD>
                  ) : null}
                  {showPrices ? (
                    <TD numeric>
                      <Money value={fromDb(line.value)} unit={null} />
                    </TD>
                  ) : null}
                  <TD colSpan={3}>
                    <form action={setLineAnalytics} className="flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="lineId" value={line.id} />
                      <input type="hidden" name="poId" value={po.id} />
                      <Select
                        name="componentId"
                        defaultValue={line.componentId ?? ""}
                        className="h-7 w-56 text-tiny"
                      >
                        <option value="">— fără componentă —</option>
                        {componentRows.map(({ component, contract }) => (
                          <option key={component.id} value={component.id}>
                            {contract.code} · {component.name}
                          </option>
                        ))}
                      </Select>
                      <Select
                        name="workUnitId"
                        defaultValue={line.workUnitId ?? ""}
                        className="h-7 w-56 text-tiny"
                      >
                        <option value="">— fără lucrare —</option>
                        {unitRows.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.code} · {u.title}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" size="sm">
                        Salvez
                      </Button>
                      {unit ? (
                        <Link
                          href={`/lucrari/${unit.id}`}
                          className="text-micro text-ink-3 hover:text-blueprint"
                        >
                          vezi lucrarea
                        </Link>
                      ) : null}
                    </form>
                  </TD>
                </TR>
              ))}
            </TBody>
            {showPrices ? (
              <tfoot>
                <TFootRow>
                  <TD colSpan={4}>{lines.length} linii</TD>
                  <TD numeric>
                    <Money value={total} unit={null} />
                  </TD>
                  <TD colSpan={3} />
                </TFootRow>
              </tfoot>
            ) : null}
          </Table>
        </Sheet>
      </section>

      {isDraft ? (
        <section className="space-y-2">
          <span className="eyebrow">Lansarea comenzii</span>
          <Sheet className="px-4 py-3">
            <form action={launchOrder} className="grid items-end gap-3 md:grid-cols-4">
              <input type="hidden" name="poId" value={po.id} />
              <Field label="Furnizor" required>
                <Select name="supplierId" defaultValue={po.supplierId ?? ""} required>
                  <option value="" disabled>
                    Alege furnizorul
                  </option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Livrare la gestiunea">
                <Select
                  name="deliverToWarehouseId"
                  defaultValue={po.deliverToWarehouseId ?? ""}
                >
                  <option value="">— nestabilit —</option>
                  {warehouseRows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} · {w.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Livrare confirmată pe">
                <Input type="date" name="confirmedDeliveryAt" />
              </Field>
              <Button type="submit" variant="primary">
                Lansez comanda
              </Button>
            </form>
          </Sheet>
        </section>
      ) : (
        <p className="text-tiny text-ink-2">
          Recepția se face din{" "}
          <Link href="/receptii" className="text-blueprint hover:underline">
            ecranul de recepții
          </Link>
          , cu cantitățile efectiv descărcate și prețul de pe factură.
        </p>
      )}
    </div>
  );
}
