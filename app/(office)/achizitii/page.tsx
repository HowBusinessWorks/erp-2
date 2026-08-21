import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import {
  coverNeedFromStock,
  createReplenishmentOrder,
} from "@/app/actions/stock";
import { Badge, Button, EmptyState, Input, PageHeader } from "@/components/ui/primitives";
import { Money } from "@/components/ui/gauge";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { db } from "@/lib/db";
import { partners, poLines, products, purchaseOrders, stock, warehouses, workUnits } from "@/lib/db/schema";
import { fromDb } from "@/lib/money";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

import { PurchaseOrderForm } from "./PurchaseOrderForm";
import {
  contractComponents as componentsTable,
  contracts as contractsTable,
} from "@/lib/db/schema";
import {
  firmOptions,
  openWorkUnitOptions,
  partnerOptions,
  productOptions,
  warehouseOptions,
} from "@/lib/pickers";
import { can } from "@/lib/permissions";
import {
  CHANNEL_HINT,
  CHANNEL_LABEL,
  PO_STATUS_LABEL,
  PO_STATUS_TONE,
  available,
  formatQty,
  hoursLeft,
} from "@/lib/stock";

export const dynamic = "force-dynamic";

const CHANNELS = ["lucrare", "replenishment", "urgenta"] as const;
type Channel = (typeof CHANNELS)[number];

/**
 * Ecranul 24 — cele 3 canale de achiziție (§16).
 *
 * Nu sunt trei etichete pe același flux, sunt trei fluxuri. Canalul C — necesarul venit
 * din teren — trece obligatoriu prin magazie: 24 de ore în care magazia poate spune „am
 * pe stoc" și comanda nu se mai lansează. Filtrul ăsta e diferența dintre un depozit
 * care se golește și unul în care zac trei paleți de gresie cumpărați de două ori.
 */
export default async function AchizitiiPage({
  searchParams,
}: {
  searchParams: Promise<{ canal?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const channel = (CHANNELS.includes(sp.canal as Channel) ? sp.canal : "lucrare") as Channel;
  const showPrices = canSeePrices(session.role);

  // §9.8 — canalul B: comanda de birou pentru o lucrare anume.
  const canOrder = can(session.role, "achizitii.gestioneaza");
  const [firmOpts, supplierOpts, warehouseOpts, productOpts, unitOpts, componentRows] = canOrder
    ? await Promise.all([
        firmOptions(),
        partnerOptions("furnizor"),
        warehouseOptions(),
        productOptions(),
        openWorkUnitOptions(),
        db
          .select({
            id: componentsTable.id,
            name: componentsTable.name,
            contractId: componentsTable.contractId,
            contractCode: contractsTable.code,
          })
          .from(componentsTable)
          .innerJoin(contractsTable, eq(componentsTable.contractId, contractsTable.id)),
      ])
    : [[], [], [], [], [], []];

  const componentOpts = componentRows.map((c) => ({
    value: c.id,
    label: `${c.contractCode} · ${c.name}`,
  }));
  const contractOfComponent = Object.fromEntries(componentRows.map((c) => [c.id, c.contractId]));

  const [orders, warehouseRows] = await Promise.all([
    db
      .select({ po: purchaseOrders, supplier: partners, warehouse: warehouses })
      .from(purchaseOrders)
      .leftJoin(partners, eq(purchaseOrders.supplierId, partners.id))
      .leftJoin(warehouses, eq(purchaseOrders.deliverToWarehouseId, warehouses.id))
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(200),
    db
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.active, true), eq(warehouses.kind, "centrala")))
      .orderBy(asc(warehouses.code)),
  ]);

  const ofChannel = orders.filter((o) => o.po.channel === channel);
  const poIds = ofChannel.map((o) => o.po.id);
  const lines = poIds.length
    ? await db
        .select({ line: poLines, product: products, unit: workUnits })
        .from(poLines)
        .innerJoin(products, eq(poLines.productId, products.id))
        .leftJoin(workUnits, eq(poLines.workUnitId, workUnits.id))
        .where(inArray(poLines.poId, poIds))
    : [];

  const central = warehouseRows[0] ?? null;
  const centralStock = central
    ? await db
        .select({ line: stock, product: products })
        .from(stock)
        .innerJoin(products, eq(stock.productId, products.id))
        .where(eq(stock.warehouseId, central.id))
    : [];

  const needs = ofChannel.filter((o) => o.po.status === "draft");
  const rest = ofChannel.filter((o) => o.po.status !== "draft");

  const counts = Object.fromEntries(
    CHANNELS.map((c) => [c, orders.filter((o) => o.po.channel === c).length]),
  ) as Record<Channel, number>;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Aprovizionare · ecranul 24"
        title="Achiziții"
        meta={CHANNEL_HINT[channel]}
        actions={
          canOrder ? (
            <PurchaseOrderForm
              firms={firmOpts}
              suppliers={supplierOpts}
              warehouses={warehouseOpts}
              products={productOpts}
              components={componentOpts}
              contractOfComponent={contractOfComponent}
              workUnits={unitOpts}
            />
          ) : undefined
        }
      />

      <Tabs
        active={channel}
        items={CHANNELS.map((c) => ({
          key: c,
          href: `/achizitii?canal=${c}`,
          label: CHANNEL_LABEL[c],
          count: counts[c],
        }))}
      />

      {channel === "lucrare" ? (
        <section className="space-y-2">
          <span className="eyebrow">Necesar din teren — fereastra magaziei</span>
          {needs.length === 0 ? (
            <EmptyState
              title="Niciun necesar în așteptare"
              hint="Necesarul se trimite din teren, ecranul „Necesar de material”. Ajunge aici ca comandă în stare de necesar, fără furnizor, cu 24 de ore în care magazia poate să-l acopere din stoc."
            />
          ) : (
            <div className="space-y-3">
              {needs.map(({ po, warehouse }) => {
                const own = lines.filter((l) => l.line.poId === po.id);
                const left = hoursLeft(po.warehouseCheckUntil);
                const coverable = own.every((l) => {
                  const s = centralStock.find((c) => c.product.id === l.product.id);
                  return s ? available(s.line.quantity, s.line.reserved) >= Number(l.line.quantity) : false;
                });
                return (
                  <Sheet key={po.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link href={`/achizitii/${po.id}`} className="font-medium hover:text-blueprint">
                            {po.code}
                          </Link>
                          <Badge tone={PO_STATUS_TONE[po.status]}>{PO_STATUS_LABEL[po.status]}</Badge>
                          {left !== null ? (
                            <Badge tone={left <= 0 ? "over" : left < 6 ? "warn" : "neutral"}>
                              {left <= 0 ? "fereastra a expirat" : `${left} h rămase magaziei`}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 text-tiny text-ink-2">
                          {own[0]?.unit ? `${own[0].unit.code} · ${own[0].unit.title}` : "fără lucrare"}
                          {warehouse ? ` · livrare la ${warehouse.code}` : null}
                        </div>
                        <ul className="mt-2 space-y-0.5 text-tiny text-ink-2">
                          {own.map((l) => {
                            const s = centralStock.find((c) => c.product.id === l.product.id);
                            const free = s ? available(s.line.quantity, s.line.reserved) : 0;
                            return (
                              <li key={l.line.id} className="tabular">
                                {l.product.name} — cere {formatQty(l.line.quantity, l.product.unit)},
                                <span className={free >= Number(l.line.quantity) ? " text-fill" : " text-over"}>
                                  {" "}în magazie {formatQty(free)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {central ? (
                          <form action={coverNeedFromStock}>
                            <input type="hidden" name="poId" value={po.id} />
                            <input type="hidden" name="warehouseId" value={central.id} />
                            <Button type="submit" size="sm" disabled={!coverable}>
                              {coverable ? "Acopăr din stoc" : "Nu am tot pe stoc"}
                            </Button>
                          </form>
                        ) : null}
                        <Link href={`/achizitii/${po.id}`}>
                          <Button variant="primary" size="sm">
                            Lansez comanda
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </Sheet>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {channel === "replenishment" ? (
        <ReplenishmentPanel central={central} centralStock={centralStock} showPrices={showPrices} />
      ) : null}

      {channel === "urgenta" ? (
        <p className="border-l-2 border-warn bg-warn-soft px-3 py-2 text-tiny text-warn">
          Urgența sare peste fereastra de 24h, dar nu peste analitică: linia tot spune pe ce
          contract și pe ce lucrare se descarcă. O comandă fără analitică e o cheltuială pe care
          la sfârșitul lunii nu o revendică nimeni.
        </p>
      ) : null}

      <section className="space-y-2">
        <span className="eyebrow">Comenzi pe canalul {CHANNEL_LABEL[channel]}</span>
        {rest.length === 0 ? (
          <EmptyState title="Nicio comandă lansată pe canalul ăsta" />
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Comandă</TH>
                  <TH>Furnizor</TH>
                  <TH>Livrare la</TH>
                  <TH>Lansată</TH>
                  <TH>Confirmată</TH>
                  <TH numeric>Linii</TH>
                  {showPrices ? <TH numeric>Valoare</TH> : null}
                  <TH>Stare</TH>
                </TR>
              </THead>
              <TBody>
                {rest.map(({ po, supplier, warehouse }) => {
                  const own = lines.filter((l) => l.line.poId === po.id);
                  const value = own.reduce((a, l) => a + fromDb(l.line.value), 0);
                  return (
                    <TR key={po.id}>
                      <TD className="font-medium">
                        <Link href={`/achizitii/${po.id}`} className="hover:text-blueprint">
                          {po.code}
                        </Link>
                      </TD>
                      <TD muted>{supplier?.name ?? "—"}</TD>
                      <TD muted>{warehouse?.code ?? "—"}</TD>
                      <TD muted>{po.orderedAt ?? "—"}</TD>
                      <TD muted>{po.confirmedDeliveryAt ?? "—"}</TD>
                      <TD numeric muted>{own.length}</TD>
                      {showPrices ? (
                        <TD numeric>
                          <Money value={value} unit={null} />
                        </TD>
                      ) : null}
                      <TD>
                        <Badge tone={PO_STATUS_TONE[po.status]}>{PO_STATUS_LABEL[po.status]}</Badge>
                        {po.warehouseCoveredFromStock ? (
                          <Badge tone="fill" className="ml-1.5">
                            acoperit din stoc
                          </Badge>
                        ) : null}
                      </TD>
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

/** Canalul A: ce a scăzut sub minim se propune singur, cu lead time-ul lângă. */
function ReplenishmentPanel({
  central,
  centralStock,
  showPrices,
}: {
  central: { id: string; code: string; name: string } | null;
  centralStock: {
    line: { id: string; quantity: string; reserved: string; avgCost: string };
    product: {
      id: string;
      name: string;
      code: string;
      unit: string;
      minStock: string;
      maxStock: string;
      leadTimeDays: number;
      lastPrice: string;
    };
  }[];
  showPrices: boolean;
}) {
  if (!central) return null;

  const low = centralStock
    .filter((s) => available(s.line.quantity, s.line.reserved) < Number(s.product.minStock))
    .sort((a, b) => b.product.leadTimeDays - a.product.leadTimeDays);

  if (low.length === 0) {
    return (
      <EmptyState
        title="Nimic sub minim în magazia centrală"
        hint="Canalul A pornește singur când disponibilul scade sub minimul produsului. Până atunci nu are ce propune."
      />
    );
  }

  return (
    <section className="space-y-2">
      <span className="eyebrow">Propunerea magaziei — {central.name}</span>
      <form action={createReplenishmentOrder} className="space-y-3">
        <input type="hidden" name="warehouseId" value={central.id} />
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Iau</TH>
                <TH>Produs</TH>
                <TH numeric>Disponibil</TH>
                <TH numeric>Min / max</TH>
                <TH numeric>Lead time</TH>
                <TH numeric>Comand</TH>
                {showPrices ? <TH numeric>Preț ultim</TH> : null}
              </TR>
            </THead>
            <TBody>
              {low.map((s) => {
                const free = available(s.line.quantity, s.line.reserved);
                const suggested = Math.max(
                  Math.ceil(Number(s.product.maxStock) - free),
                  Math.ceil(Number(s.product.minStock) - free),
                );
                return (
                  <TR key={s.line.id}>
                    <TD>
                      <input
                        type="checkbox"
                        name="productId"
                        value={s.product.id}
                        defaultChecked={s.product.leadTimeDays >= 7 || free <= 0}
                        className="size-4 accent-[oklch(0.45_0.09_245)]"
                      />
                    </TD>
                    <TD>
                      <span className="font-medium">{s.product.name}</span>
                      <span className="ml-2 text-micro text-ink-3">{s.product.code}</span>
                    </TD>
                    <TD numeric className={free <= 0 ? "text-over" : undefined}>
                      {formatQty(free, s.product.unit)}
                    </TD>
                    <TD numeric muted>
                      {formatQty(s.product.minStock)} / {formatQty(s.product.maxStock)}
                    </TD>
                    <TD numeric muted>
                      {s.product.leadTimeDays >= 7 ? (
                        <Badge tone="warn">{s.product.leadTimeDays} zile</Badge>
                      ) : (
                        `${s.product.leadTimeDays} zile`
                      )}
                    </TD>
                    <TD numeric>
                      <Input
                        name={`qty_${s.product.id}`}
                        type="number"
                        min="0"
                        step="1"
                        defaultValue={String(Math.max(suggested, 1))}
                        className="h-8 w-24 text-right text-tiny tabular"
                      />
                    </TD>
                    {showPrices ? (
                      <TD numeric muted>
                        <Money value={fromDb(s.product.lastPrice)} unit={null} />
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Sheet>
        <div className="flex items-center justify-between gap-3">
          <span className="text-micro text-ink-3">
            Bifate implicit: ce e epuizat și ce are lead time de o săptămână sau mai mult. Un
            adeziv la două săptămâni comandat târziu oprește un șantier.
          </span>
          <Button type="submit" variant="primary">
            Fac comanda
          </Button>
        </div>
      </form>
    </section>
  );
}
