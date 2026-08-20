import Link from "next/link";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";

import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { Money } from "@/components/ui/gauge";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import {
  consumptionLines,
  consumptionNotes,
  products,
  stock,
  warehouses,
  workUnitStages,
  workUnits,
} from "@/lib/db/schema";
import { fromDb } from "@/lib/money";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { available, formatQty } from "@/lib/stock";
import { ConsumForm } from "./ConsumForm";

export const dynamic = "force-dynamic";

export default async function ConsumPage() {
  const session = await requireSession();
  const showPrices = canSeePrices(session.role);

  const [warehouseRows, stockRows, unitRows, stageRows, notes] = await Promise.all([
    db
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.active, true), ne(warehouses.kind, "unelte")))
      .orderBy(asc(warehouses.code)),
    db
      .select({ line: stock, product: products })
      .from(stock)
      .innerJoin(products, eq(stock.productId, products.id))
      .orderBy(asc(products.name)),
    db
      .select()
      .from(workUnits)
      .where(ne(workUnits.status, "anulata"))
      .orderBy(desc(workUnits.createdAt))
      .limit(120),
    db.select().from(workUnitStages).orderBy(asc(workUnitStages.position)),
    db
      .select({ note: consumptionNotes, warehouse: warehouses, unit: workUnits })
      .from(consumptionNotes)
      .innerJoin(warehouses, eq(consumptionNotes.warehouseId, warehouses.id))
      .innerJoin(workUnits, eq(consumptionNotes.workUnitId, workUnits.id))
      .orderBy(desc(consumptionNotes.createdAt))
      .limit(15),
  ]);

  const noteIds = notes.map((n) => n.note.id);
  const lines = noteIds.length
    ? await db
        .select({ line: consumptionLines, product: products })
        .from(consumptionLines)
        .innerJoin(products, eq(consumptionLines.productId, products.id))
        .where(inArray(consumptionLines.noteId, noteIds))
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Aprovizionare · ecranul 23"
        title="Bon de consum"
        meta="Aici materialul se transformă din marfă în cost. Unitatea de lucru de pe bon decide componenta pe care se descarcă banii — nu gestiunea din care iese marfa."
      />

      <Sheet className="px-4 py-4">
        <ConsumForm
          today={new Date().toISOString().slice(0, 10)}
          warehouses={warehouseRows.map((w) => ({ id: w.id, label: `${w.code} · ${w.name}` }))}
          items={stockRows.map(({ line, product }) => ({
            warehouseId: line.warehouseId,
            productId: product.id,
            name: `${product.name} (${product.code})`,
            unit: product.unit,
            available: available(line.quantity, line.reserved),
          }))}
          units={unitRows.map((u) => ({ id: u.id, label: `${u.code} · ${u.title}` }))}
          stages={stageRows.map((s) => ({
            id: s.id,
            workUnitId: s.workUnitId,
            label: `${s.position}. ${s.name}`,
          }))}
        />
      </Sheet>

      <section className="space-y-2">
        <span className="eyebrow">Bonuri emise</span>
        {notes.length === 0 ? (
          <EmptyState
            title="Niciun bon de consum încă"
            hint="Primul bon apare aici imediat ce se emite. Fiecare bon scrie o linie în registrul de cost, cu stadiul „consumat”."
          />
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Bon</TH>
                  <TH>Zi</TH>
                  <TH>Gestiune</TH>
                  <TH>Unitatea de lucru</TH>
                  <TH>Ce a ieșit</TH>
                  {showPrices ? <TH numeric>Valoare</TH> : null}
                </TR>
              </THead>
              <TBody>
                {notes.map(({ note, warehouse, unit }) => {
                  const own = lines.filter((l) => l.line.noteId === note.id);
                  const value = own.reduce((a, l) => a + fromDb(l.line.value), 0);
                  return (
                    <TR key={note.id}>
                      <TD className="font-medium">{note.code}</TD>
                      <TD muted>{note.day}</TD>
                      <TD muted>{warehouse.code}</TD>
                      <TD>
                        <Link href={`/lucrari/${unit.id}`} className="hover:text-blueprint">
                          {unit.code}
                        </Link>
                        <span className="ml-2 text-micro text-ink-3">{unit.title}</span>
                      </TD>
                      <TD muted>
                        {own
                          .map((l) => `${l.product.name} ${formatQty(l.line.quantity, l.product.unit)}`)
                          .join(" · ") || "—"}
                      </TD>
                      {showPrices ? (
                        <TD numeric>
                          <Money value={value} unit={null} />
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Sheet>
        )}
      </section>
    </div>
  );
}
