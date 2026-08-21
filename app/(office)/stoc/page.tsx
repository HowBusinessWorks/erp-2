import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";

import { Badge, Button, EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { Money } from "@/components/ui/gauge";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { adjustStock, transferStockAction } from "@/app/actions/stock";
import { db } from "@/lib/db";
import { products, stock, stockMovements, warehouses } from "@/lib/db/schema";
import { fromDb } from "@/lib/money";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

import { WarehouseForm } from "@/components/domain/OperabilityForms";
import { firmOptions, openWorkUnitOptions, partnerOptions, userOptions } from "@/lib/pickers";
import { can } from "@/lib/permissions";
import {
  MOVEMENT_LABEL,
  SIGNAL_LABEL,
  SIGNAL_TONE,
  WAREHOUSE_KIND_LABEL,
  available,
  formatQty,
  stockSignal,
} from "@/lib/stock";

export const dynamic = "force-dynamic";

/**
 * Ecranul 23 — gestiuni și stoc.
 *
 * Coloana care contează nu e „cantitate", e **disponibil**: cantitate minus rezervat.
 * Restul e contabilitate; disponibilul e răspunsul la singura întrebare pe care o pune
 * omul de pe șantier — pot să iau de aici sau nu.
 */
export default async function StocPage({
  searchParams,
}: {
  searchParams: Promise<{ gestiune?: string; semnal?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const showPrices = canSeePrices(session.role);
  const canOperate = can(session.role, "stoc.opereaza");
  const [firmOpts, unitOpts, supplierOpts, userOpts] = canOperate
    ? await Promise.all([firmOptions(), openWorkUnitOptions(), partnerOptions("furnizor"), userOptions()])
    : [[], [], [], []];

  const warehouseRows = await db
    .select()
    .from(warehouses)
    .where(eq(warehouses.active, true))
    .orderBy(asc(warehouses.kind), asc(warehouses.code));

  const selected = sp.gestiune ? warehouseRows.find((w) => w.id === sp.gestiune) ?? null : null;

  const [rows, movements] = await Promise.all([
    db
      .select({ line: stock, product: products, warehouse: warehouses })
      .from(stock)
      .innerJoin(products, eq(stock.productId, products.id))
      .innerJoin(warehouses, eq(stock.warehouseId, warehouses.id))
      .where(
        selected
          ? and(eq(stock.warehouseId, selected.id), eq(warehouses.active, true))
          : eq(warehouses.active, true),
      )
      .orderBy(asc(warehouses.code), asc(products.name)),
    db
      .select({
        movement: stockMovements,
        product: products,
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .orderBy(desc(stockMovements.createdAt))
      .limit(12),
  ]);

  const withSignal = rows.map((r) => ({
    ...r,
    signal: stockSignal(r.line.quantity, r.line.reserved, r.product.minStock, r.product.maxStock),
    free: available(r.line.quantity, r.line.reserved),
    value: Math.round(fromDb(r.line.avgCost) * Number(r.line.quantity)),
  }));

  const visible = sp.semnal ? withSignal.filter((r) => r.signal === sp.semnal) : withSignal;

  const totalValue = withSignal.reduce((a, r) => a + r.value, 0);
  const reservedValue = withSignal.reduce(
    (a, r) => a + Math.round(fromDb(r.line.avgCost) * Number(r.line.reserved)),
    0,
  );
  const belowMin = withSignal.filter((r) => r.signal === "sub_minim" || r.signal === "epuizat").length;
  const custody = warehouseRows.filter((w) => w.isCustody).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Aprovizionare"
        title="Gestiuni și stoc"
        meta="Gestiunea e un loc fizic, nu un contract. Ce se ia de pe raft devine cost abia pe bonul de consum — până atunci e marfă, nu cheltuială."
        actions={
          <>
            {canOperate ? (
              <WarehouseForm
                firms={firmOpts}
                workUnits={unitOpts}
                partners={supplierOpts}
                users={userOpts}
              />
            ) : null}
          <Link href="/stoc/consum">
            <Button variant="primary" size="sm">
              Bon de consum
            </Button>
          </Link>
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Stat
          label="Articole"
          value={String(withSignal.length)}
          hint={selected ? selected.name : `în ${warehouseRows.length} gestiuni`}
        />
        <Stat label="Sub minim" value={String(belowMin)} hint="intră pe canalul A de reaprovizionare" />
        {showPrices ? (
          <MoneyStat label="Valoare de stoc" value={totalValue} hint="la CMP, pe filtrul curent" />
        ) : (
          <Stat label="Rezervat" value={String(withSignal.filter((r) => Number(r.line.reserved) > 0).length)} hint="articole cu rezervări" />
        )}
        {showPrices ? (
          <MoneyStat label="Din care rezervat" value={reservedValue} hint="promis, încă nemutat" />
        ) : (
          <Stat label="Consignație" value={String(custody)} hint="marfa nu e a ta până la consum" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip href="/stoc" active={!selected} label="Toate gestiunile" />
        {warehouseRows.map((w) => (
          <Chip
            key={w.id}
            href={`/stoc?gestiune=${w.id}`}
            active={selected?.id === w.id}
            label={`${w.code} · ${w.name}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip href={base(sp, { semnal: undefined })} active={!sp.semnal} label="Tot" />
        {(["epuizat", "sub_minim", "peste_maxim"] as const).map((s) => (
          <Chip
            key={s}
            href={base(sp, { semnal: sp.semnal === s ? undefined : s })}
            active={sp.semnal === s}
            label={SIGNAL_LABEL[s]}
          />
        ))}
      </div>

      {selected?.isCustody ? (
        <p className="border-l-2 border-warn bg-warn-soft px-3 py-2 text-tiny text-warn">
          Consignație. Marfa e a furnizorului până în momentul consumului — ce vezi aici nu e
          patrimoniul tău, iar valoarea de stoc nu se raportează.
        </p>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          title="Nimic în filtrul ales"
          hint="Stocul apare după prima recepție. Recepția se face din ecranul de recepții, pe baza unei comenzi lansate."
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Produs</TH>
                {!selected ? <TH>Gestiune</TH> : null}
                <TH numeric>Cantitate</TH>
                <TH numeric>Rezervat</TH>
                <TH numeric>Disponibil</TH>
                <TH numeric>Min / max</TH>
                {showPrices ? <TH numeric>CMP</TH> : null}
                {showPrices ? <TH numeric>Valoare</TH> : null}
                <TH>Semnal</TH>
                <TH>Mută</TH>
              </TR>
            </THead>
            <TBody>
              {visible.map((r) => (
                <TR key={r.line.id}>
                  <TD>
                    <span className="font-medium">{r.product.name}</span>
                    <span className="ml-2 text-micro text-ink-3">{r.product.code}</span>
                    {r.line.lot ? (
                      <span className="ml-2 text-micro text-ink-3">lot {r.line.lot}</span>
                    ) : null}
                  </TD>
                  {!selected ? <TD muted>{r.warehouse.code}</TD> : null}
                  <TD numeric>{formatQty(r.line.quantity, r.product.unit)}</TD>
                  <TD numeric muted>
                    {Number(r.line.reserved) > 0 ? formatQty(r.line.reserved) : "—"}
                  </TD>
                  <TD numeric className={r.free <= 0 ? "text-over" : undefined}>
                    {formatQty(r.free)}
                  </TD>
                  <TD numeric muted>
                    {formatQty(r.product.minStock)} / {formatQty(r.product.maxStock)}
                  </TD>
                  {showPrices ? (
                    <TD numeric muted>
                      <Money value={fromDb(r.line.avgCost)} unit={null} />
                    </TD>
                  ) : null}
                  {showPrices ? (
                    <TD numeric>
                      <Money value={r.value} unit={null} />
                    </TD>
                  ) : null}
                  <TD>
                    <Badge tone={SIGNAL_TONE[r.signal]}>{SIGNAL_LABEL[r.signal]}</Badge>
                  </TD>
                  <TD>
                    <form action={transferStockAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="fromWarehouseId" value={r.line.warehouseId} />
                      <input type="hidden" name="productId" value={r.product.id} />
                      <Input
                        name="quantity"
                        type="number"
                        step="0.01"
                        min="0"
                        max={String(r.free)}
                        className="h-7 w-16 text-right text-tiny tabular"
                        placeholder="cant."
                      />
                      <Select name="toWarehouseId" defaultValue="" className="h-7 w-36 text-tiny">
                        <option value="" disabled>
                          către…
                        </option>
                        {warehouseRows
                          .filter((w) => w.id !== r.line.warehouseId)
                          .map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.code}
                            </option>
                          ))}
                      </Select>
                      <Button type="submit" size="sm">
                        Mută
                      </Button>
                    </form>
                  </TD>
                </TR>
              ))}
            </TBody>
            {showPrices ? (
              <tfoot>
                <TFootRow>
                  <TD colSpan={selected ? 6 : 7}>{visible.length} articole</TD>
                  <TD numeric>
                    <Money value={visible.reduce((a, r) => a + r.value, 0)} unit={null} />
                  </TD>
                  <TD colSpan={2} />
                </TFootRow>
              </tfoot>
            ) : null}
          </Table>
        </Sheet>
      )}

      {selected ? (
        <section className="space-y-2">
          <span className="eyebrow">Inventar — cantitatea numărată bate cantitatea din sistem</span>
          <Sheet className="px-4 py-3">
            <form action={adjustStock} className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="eyebrow mb-1 block">Articol</span>
                <Select name="stockId" defaultValue="" className="w-72">
                  <option value="" disabled>
                    Alege articolul numărat
                  </option>
                  {visible.map((r) => (
                    <option key={r.line.id} value={r.line.id}>
                      {r.product.name} — acum {formatQty(r.line.quantity, r.product.unit)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="eyebrow mb-1 block">Numărat</span>
                <Input
                  name="counted"
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-28 text-right tabular"
                />
              </label>
              <Button type="submit">Corectez stocul</Button>
              <span className="text-micro text-ink-3">
                Diferența rămâne scrisă ca mișcare de inventar.
              </span>
            </form>
          </Sheet>
        </section>
      ) : null}

      {movements.length ? (
        <section className="space-y-2">
          <span className="eyebrow">Ultimele mișcări</span>
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Zi</TH>
                  <TH>Tip</TH>
                  <TH>Produs</TH>
                  <TH numeric>Cantitate</TH>
                  <TH>Din</TH>
                  <TH>În</TH>
                </TR>
              </THead>
              <TBody>
                {movements.map(({ movement, product }) => (
                  <TR key={movement.id}>
                    <TD muted>{movement.day}</TD>
                    <TD>
                      <Badge tone={movement.kind === "consum" ? "warn" : "neutral"}>
                        {MOVEMENT_LABEL[movement.kind]}
                      </Badge>
                    </TD>
                    <TD>{product.name}</TD>
                    <TD numeric>{formatQty(movement.quantity, product.unit)}</TD>
                    <TD muted>{code(warehouseRows, movement.fromWarehouseId)}</TD>
                    <TD muted>{code(warehouseRows, movement.toWarehouseId)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Sheet>
        </section>
      ) : null}

      <section className="space-y-2">
        <span className="eyebrow">Gestiuni</span>
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Cod</TH>
                <TH>Denumire</TH>
                <TH>Tip</TH>
                <TH numeric>Articole</TH>
                {showPrices ? <TH numeric>Valoare</TH> : null}
              </TR>
            </THead>
            <TBody>
              {warehouseRows.map((w) => {
                const own = withSignal.filter((r) => r.line.warehouseId === w.id);
                return (
                  <TR key={w.id}>
                    <TD className="font-medium">
                      <Link href={`/stoc?gestiune=${w.id}`} className="hover:text-blueprint">
                        {w.code}
                      </Link>
                    </TD>
                    <TD>{w.name}</TD>
                    <TD muted>
                      {WAREHOUSE_KIND_LABEL[w.kind]}
                      {w.isCustody ? <Badge tone="warn" className="ml-2">custodie</Badge> : null}
                    </TD>
                    <TD numeric muted>{own.length}</TD>
                    {showPrices ? (
                      <TD numeric>
                        {w.isCustody ? (
                          <span className="text-micro text-ink-3">nu e a ta</span>
                        ) : (
                          <Money value={own.reduce((a, r) => a + r.value, 0)} unit={null} />
                        )}
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Sheet>
      </section>
    </div>
  );
}

function code(list: { id: string; code: string }[], id: string | null) {
  if (!id) return "—";
  return list.find((w) => w.id === id)?.code ?? "—";
}

function base(sp: { gestiune?: string; semnal?: string }, patch: { semnal?: string }) {
  const params = new URLSearchParams();
  if (sp.gestiune) params.set("gestiune", sp.gestiune);
  const semnal = "semnal" in patch ? patch.semnal : sp.semnal;
  if (semnal) params.set("semnal", semnal);
  const q = params.toString();
  return q ? `/stoc?${q}` : "/stoc";
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-rule-strong bg-sheet px-4 py-3">
      <div className="eyebrow mb-1">{label}</div>
      <div className="tabular font-narrow text-[1.5rem] font-semibold leading-none text-ink">
        {value}
      </div>
      {hint ? <div className="mt-1 text-micro text-ink-3">{hint}</div> : null}
    </div>
  );
}

function MoneyStat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="border border-rule-strong bg-sheet px-4 py-3">
      <div className="eyebrow mb-1">{label}</div>
      <div className="tabular font-narrow text-[1.5rem] font-semibold leading-none text-ink">
        <Money value={value} />
      </div>
      {hint ? <div className="mt-1 text-micro text-ink-3">{hint}</div> : null}
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-[3px] border px-2 py-0.5 text-tiny transition-colors ${
        active
          ? "border-blueprint bg-blueprint text-white"
          : "border-rule-strong bg-sheet text-ink-2 hover:bg-sunk hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
