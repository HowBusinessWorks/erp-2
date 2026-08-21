import Link from "next/link";
import { asc, desc, eq, isNotNull, sql as raw } from "drizzle-orm";

import { moveTool } from "@/app/actions/equipment";
import { Badge, Button, EmptyState, PageHeader, Select } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { Money } from "@/components/ui/gauge";
import { db } from "@/lib/db";
import { handoverProtocols, partners, tools, users, warehouses } from "@/lib/db/schema";
import { TOOL_STATUS_LABEL, TOOL_STATUS_TONE, formatDay } from "@/lib/equipment";
import { fromDb } from "@/lib/money";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

import { ToolForm } from "@/components/domain/OperabilityForms";
import { firmOptions, partnerOptions, userOptions, warehouseOptions } from "@/lib/pickers";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function UneltePage({
  searchParams,
}: {
  searchParams: Promise<{ stare?: string; la?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const showPrices = canSeePrices(session.role);
  const canCreate = can(session.role, "stoc.opereaza");
  const [firmOpts, warehouseOpts, userOpts, partnerOpts] = canCreate
    ? await Promise.all([firmOptions(), warehouseOptions(), userOptions(), partnerOptions("subcontractant")])
    : [[], [], [], []];

  const [rows, staff, history] = await Promise.all([
    db
      .select({ tool: tools, holder: users, partner: partners, warehouse: warehouses })
      .from(tools)
      .leftJoin(users, eq(tools.holderUserId, users.id))
      .leftJoin(partners, eq(tools.holderPartnerId, partners.id))
      .leftJoin(warehouses, eq(tools.warehouseId, warehouses.id))
      .where(sp.stare ? raw`${tools.status} = ${sp.stare}` : undefined)
      .orderBy(asc(tools.category), asc(tools.code)),
    db.select().from(users).where(eq(users.active, true)).orderBy(asc(users.name)),
    db
      .select()
      .from(handoverProtocols)
      .where(isNotNull(handoverProtocols.toolId))
      .orderBy(desc(handoverProtocols.handoverDate))
      .limit(30),
  ]);

  const out = rows.filter((r) => r.tool.holderUserId || r.tool.holderPartnerId);
  const totalValue = rows.reduce((a, r) => a + fromDb(r.tool.purchaseValue), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Resurse"
        title="Unelte"
        meta="O unealtă e la cineva sau e în magazie — nu există stare intermediară. Cine o are acum răspunde de ea; PV-ul spune din ce moment."
        actions={
          canCreate ? (
            <ToolForm
              firms={firmOpts}
              warehouses={warehouseOpts}
              users={userOpts}
              partners={partnerOpts}
            />
          ) : undefined
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Unelte" value={String(rows.length)} hint={`${out.length} sunt la oameni`} />
        <Stat
          label="Ieșite din uz"
          value={String(rows.filter((r) => ["casat", "pierdut"].includes(r.tool.status)).length)}
          hint="casate sau pierdute"
        />
        {showPrices ? (
          <div className="border border-rule-strong bg-sheet px-4 py-3">
            <div className="eyebrow mb-1">Valoare de achiziție</div>
            <div className="tabular font-narrow text-[1.5rem] font-semibold leading-none text-ink">
              <Money value={totalValue} />
            </div>
            <div className="mt-1 text-micro text-ink-3">pe toate uneltele din filtru</div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip href="/unelte" active={!sp.stare} label="Tot" />
        {Object.entries(TOOL_STATUS_LABEL).map(([key, label]) => (
          <Chip
            key={key}
            href={sp.stare === key ? "/unelte" : `/unelte?stare=${key}`}
            active={sp.stare === key}
            label={label}
          />
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nicio unealtă în filtrul ales"
          hint="Registrul de unelte e mai puțin formal decât cel de utilaje: contează cine o are, nu câte ore a mers."
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Cod</TH>
                <TH>Denumire</TH>
                <TH>Categorie</TH>
                <TH>Unde e</TH>
                <TH>Stare</TH>
                {showPrices ? <TH numeric>Valoare</TH> : null}
                <TH>Predare / retur</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ tool, holder, partner, warehouse }) => {
                const withSomeone = Boolean(holder || partner);
                return (
                  <TR key={tool.id}>
                    <TD className="font-medium">{tool.code}</TD>
                    <TD>{tool.name}</TD>
                    <TD muted>{tool.category ?? "—"}</TD>
                    <TD muted>
                      {holder?.name ?? partner?.name ?? warehouse?.name ?? "magazie"}
                    </TD>
                    <TD>
                      <Badge tone={TOOL_STATUS_TONE[tool.status]}>
                        {TOOL_STATUS_LABEL[tool.status]}
                      </Badge>
                    </TD>
                    {showPrices ? (
                      <TD numeric muted>
                        <Money value={fromDb(tool.purchaseValue)} unit={null} />
                      </TD>
                    ) : null}
                    <TD>
                      <form action={moveTool} className="flex items-center gap-1.5">
                        <input type="hidden" name="toolId" value={tool.id} />
                        <Select
                          name="holderUserId"
                          defaultValue={tool.holderUserId ?? ""}
                          className="h-7 w-40 text-tiny"
                        >
                          <option value="">— retur în magazie —</option>
                          {staff.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </Select>
                        <Button type="submit" size="sm">
                          {withSomeone ? "Mută" : "Predă"}
                        </Button>
                      </form>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
            {showPrices ? (
              <tfoot>
                <TFootRow>
                  <TD colSpan={5}>{rows.length} unelte</TD>
                  <TD numeric>
                    <Money value={totalValue} unit={null} />
                  </TD>
                  <TD />
                </TFootRow>
              </tfoot>
            ) : null}
          </Table>
        </Sheet>
      )}

      {history.length ? (
        <section className="space-y-2">
          <span className="eyebrow">Istoric PV pe unelte</span>
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>PV</TH>
                  <TH>Predat</TH>
                  <TH>Către</TH>
                  <TH>Primit înapoi</TH>
                  <TH>Stare</TH>
                </TR>
              </THead>
              <TBody>
                {history.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/pv/${p.id}`} className="font-medium hover:text-blueprint">
                        {p.code}
                      </Link>
                    </TD>
                    <TD muted>{formatDay(p.handoverDate)}</TD>
                    <TD muted>{p.handoverToPersonName ?? "—"}</TD>
                    <TD muted>{formatDay(p.returnDate)}</TD>
                    <TD>
                      <Badge tone={p.status === "deschis" ? "warn" : "fill"}>
                        {p.status === "deschis" ? "Deschis" : "Închis"}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Sheet>
        </section>
      ) : null}
    </div>
  );
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
