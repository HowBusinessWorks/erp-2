import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";

import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { DataPair, Tabs } from "@/components/ui/tabs";
import { Money } from "@/components/ui/gauge";
import { db } from "@/lib/db";
import {
  devizLines,
  devizMapping,
  devize,
  objectives,
  packageLines,
  packages,
  workUnits,
} from "@/lib/db/schema";
import {
  DEVIZ_STATUS_LABEL,
  DEVIZ_STATUS_TONE,
  canEnterPackage,
  devizTotals,
  traceability,
} from "@/lib/deviz";
import { formatShort, fromDb } from "@/lib/money";
import { can, canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { MappingPanel, type MapLine, type MapLink } from "./MappingPanel";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "client", label: "Deviz client" },
  { key: "intern", label: "Deviz intern" },
  { key: "mapare", label: "Mapare" },
] as const;

export default async function DevizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fila?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.fila) ? sp.fila! : "client";
  const showPrices = canSeePrices(session.role);
  const canEdit = can(session.role, "deviz.intern.editeaza");

  const [row] = await db
    .select({ deviz: devize, unit: workUnits, objective: objectives })
    .from(devize)
    .leftJoin(workUnits, eq(devize.workUnitId, workUnits.id))
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(eq(devize.id, id))
    .limit(1);
  if (!row) notFound();

  // perechea: pe aceeași unitate de lucru stau amândouă devizele
  const siblings = await db
    .select()
    .from(devize)
    .where(eq(devize.workUnitId, row.deviz.workUnitId))
    .orderBy(asc(devize.kind));

  const clientDeviz = siblings.find((d) => d.kind === "client") ?? null;
  const internalDeviz = siblings.find((d) => d.kind === "intern") ?? null;

  const devizIds = siblings.map((d) => d.id);
  const allLines = await db
    .select()
    .from(devizLines)
    .where(inArray(devizLines.devizId, devizIds))
    .orderBy(asc(devizLines.position));

  const clientLines = allLines.filter((l) => l.devizId === clientDeviz?.id);
  const internalLines = allLines.filter((l) => l.devizId === internalDeviz?.id);

  const links = clientLines.length
    ? await db
        .select()
        .from(devizMapping)
        .where(inArray(devizMapping.clientLineId, clientLines.map((l) => l.id)))
    : [];

  const packageRows = await db
    .select({ line: packageLines, pkg: packages })
    .from(packageLines)
    .innerJoin(packages, eq(packageLines.packageId, packages.id))
    .where(eq(packages.workUnitId, row.deviz.workUnitId));

  /* ─────────── trasabilitatea (§8.4) ─────────── */
  const clientTotal = clientLines.reduce((a, l) => a + fromDb(l.total), 0);
  const internalTotal = internalLines.reduce((a, l) => a + fromDb(l.total), 0);
  const mappedClientIds = new Set(links.map((l) => l.clientLineId));
  const mappedClientTotal = clientLines
    .filter((l) => mappedClientIds.has(l.id))
    .reduce((a, l) => a + fromDb(l.total), 0);
  const packagedInternalIds = new Set(
    packageRows.map((p) => p.line.internalLineId).filter(Boolean) as string[],
  );
  const packagedTotal = internalLines
    .filter((l) => packagedInternalIds.has(l.id))
    .reduce((a, l) => a + fromDb(l.total), 0);

  const trace = traceability({ clientTotal, mappedClientTotal, internalTotal, packagedTotal });
  const clientMarkup = devizTotals(
    clientTotal,
    clientDeviz?.overheadPercent ?? 0,
    clientDeviz?.profitPercent ?? 0,
  );

  const href = (key: string) => `/devize/${id}?fila=${key}`;
  const toMapLine = (l: (typeof allLines)[number]): MapLine => ({
    id: l.id,
    position: l.position,
    name: l.name,
    unit: l.unit,
    quantity: String(Number(l.quantity ?? 0)),
    total: fromDb(l.total),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <Link href="/devize" className="hover:text-blueprint">
            ‹ Devize
          </Link>
        }
        title={row.unit?.title ?? "Deviz"}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <span>{row.unit?.code}</span>
            <span>· {row.objective?.name ?? "—"}</span>
            {clientDeviz ? (
              <Badge tone={DEVIZ_STATUS_TONE[clientDeviz.status]}>
                Client v{clientDeviz.version} · {DEVIZ_STATUS_LABEL[clientDeviz.status]}
              </Badge>
            ) : null}
            {internalDeviz ? (
              <Badge tone={DEVIZ_STATUS_TONE[internalDeviz.status]}>
                Intern v{internalDeviz.version} · {DEVIZ_STATUS_LABEL[internalDeviz.status]}
              </Badge>
            ) : null}
          </span>
        }
      />

      {/* ─────────── bara de trasabilitate ─────────── */}
      {showPrices ? (
        <section className="space-y-3 border border-rule-strong bg-sheet px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="eyebrow">Trasabilitate</span>
            <span className="text-micro text-ink-3">
              cât din ofertă are cost calculat și cât din cost e dat mai departe
            </span>
          </div>

          <TraceBar
            label="Deviz client"
            caption={`${trace.mappedPercent.toFixed(0)}% mapat pe deviz intern`}
            filled={trace.mappedPercent}
            filledLabel={formatShort(trace.mappedClientTotal)}
            restLabel={
              trace.unmapped > 0 ? `${formatShort(trace.unmapped)} nemapat` : "tot mapat"
            }
            alarming={trace.unmapped > 0}
          />
          <TraceBar
            label="Deviz intern"
            caption={`${trace.packagedPercent.toFixed(0)}% intrat în pachete`}
            filled={trace.packagedPercent}
            filledLabel={formatShort(trace.packagedTotal)}
            restLabel={`${formatShort(trace.internalTotal - trace.packagedTotal)} în regie proprie`}
          />

          <div className="grid gap-x-8 gap-y-3 border-t border-rule pt-3 sm:grid-cols-4">
            <DataPair label="Ofertat client" numeric>
              <Money value={clientMarkup.total} />
            </DataPair>
            <DataPair label="Cost intern" numeric>
              <Money value={internalTotal} />
            </DataPair>
            <DataPair label="Marjă" numeric>
              <Money
                value={clientMarkup.total - internalTotal}
                tone={clientMarkup.total - internalTotal < 0 ? "over" : "fill"}
              />
            </DataPair>
            <DataPair label="Marjă %" numeric>
              <span
                className={
                  clientMarkup.total - internalTotal < 0 ? "text-over" : undefined
                }
              >
                {clientMarkup.total === 0
                  ? "—"
                  : `${(((clientMarkup.total - internalTotal) / clientMarkup.total) * 100).toFixed(1)}%`}
              </span>
            </DataPair>
          </div>

          {trace.unmapped > 0 ? (
            <p className="border-l-2 border-over bg-over-soft px-3 py-2 text-tiny text-over">
              <span className="font-medium">{formatShort(trace.unmapped)} lei nemapați.</span> Sunt
              poziții ofertate pentru care nu s-a calculat cost intern — nu știi dacă ai marjă pe
              ele sau pierzi bani.
            </p>
          ) : null}
        </section>
      ) : null}

      <Tabs
        active={tab}
        items={TABS.map((t) => ({
          key: t.key,
          href: href(t.key),
          label: t.label,
          count:
            t.key === "client"
              ? clientLines.length
              : t.key === "intern"
                ? internalLines.length
                : links.length,
        }))}
      />

      {/* ─────────── ecranul 16 — devizul client ─────────── */}
      {tab === "client" ? (
        clientLines.length === 0 ? (
          <EmptyState title="Fără deviz client" hint="Devizul client e ce vede beneficiarul: poziții, cantități, preț la comun, plus indirecte și profit ca pachet." />
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH numeric>#</TH>
                  <TH>Poziție</TH>
                  <TH>UM</TH>
                  <TH numeric>Cantitate</TH>
                  {showPrices ? <TH numeric>Preț unitar</TH> : null}
                  {showPrices ? <TH numeric>Valoare</TH> : null}
                  <TH>Mapare</TH>
                </TR>
              </THead>
              <TBody>
                {clientLines.map((l) => {
                  const n = links.filter((k) => k.clientLineId === l.id).length;
                  return (
                    <TR key={l.id}>
                      <TD numeric muted>{l.position}</TD>
                      <TD className="max-w-96">
                        {l.name}
                        {l.isSupplement ? (
                          <Badge tone="blueprint" className="ml-2">
                            suplimentare
                          </Badge>
                        ) : null}
                      </TD>
                      <TD muted>{l.unit}</TD>
                      <TD numeric>{Number(l.quantity ?? 0)}</TD>
                      {showPrices ? (
                        <TD numeric muted>
                          <Money value={fromDb(l.unitPrice)} unit={null} />
                        </TD>
                      ) : null}
                      {showPrices ? (
                        <TD numeric strong>
                          <Money value={fromDb(l.total)} unit={null} />
                        </TD>
                      ) : null}
                      <TD>
                        {n === 0 ? (
                          <span className="text-tiny text-over">nemapată</span>
                        ) : (
                          <span className="text-tiny text-fill">{n} intern{n === 1 ? "" : "e"}</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
              {showPrices ? (
                <tfoot>
                  <TFootRow>
                    <TD colSpan={5}>Subtotal</TD>
                    <TD numeric>
                      <Money value={clientMarkup.subtotal} unit={null} />
                    </TD>
                    <TD />
                  </TFootRow>
                  <TFootRow>
                    <TD colSpan={5}>
                      Indirecte {Number(clientDeviz?.overheadPercent ?? 0)}% + profit{" "}
                      {Number(clientDeviz?.profitPercent ?? 0)}%
                    </TD>
                    <TD numeric>
                      <Money value={clientMarkup.overhead + clientMarkup.profit} unit={null} />
                    </TD>
                    <TD />
                  </TFootRow>
                  <TFootRow>
                    <TD colSpan={5}>Total ofertat</TD>
                    <TD numeric strong>
                      <Money value={clientMarkup.total} unit={null} />
                    </TD>
                    <TD />
                  </TFootRow>
                </tfoot>
              ) : null}
            </Table>
          </Sheet>
        )
      ) : null}

      {/* ─────────── devizul intern ─────────── */}
      {tab === "intern" ? (
        internalLines.length === 0 ? (
          <EmptyState title="Fără deviz intern" hint="La devizul intern, materialul și manopera sunt ÎNTOTDEAUNA separate. Din separarea asta iese regula pachetelor." />
        ) : (
          <>
            <p className="max-w-prose text-micro text-ink-3">
              Material și manoperă stau separat, nu la comun. Din separarea asta se vede direct ce
              poate intra într-un pachet de subcontractant și ce nu.
            </p>
            <Sheet>
              <Table>
                <THead>
                  <TR>
                    <TH numeric>#</TH>
                    <TH>Articol</TH>
                    <TH>Categorie</TH>
                    <TH numeric>Cant.</TH>
                    {showPrices ? <TH numeric>Material</TH> : null}
                    {showPrices ? <TH numeric>Manoperă</TH> : null}
                    {showPrices ? <TH numeric>Utilaj</TH> : null}
                    {showPrices ? <TH numeric>Transport</TH> : null}
                    {showPrices ? <TH numeric>Total</TH> : null}
                    <TH>Pachet</TH>
                  </TR>
                </THead>
                <TBody>
                  {internalLines.map((l) => {
                    const gate = canEnterPackage(l);
                    const inPackage = packagedInternalIds.has(l.id);
                    return (
                      <TR key={l.id}>
                        <TD numeric muted>{l.position}</TD>
                        <TD className="max-w-72">{l.name}</TD>
                        <TD muted>{l.category ?? "—"}</TD>
                        <TD numeric>{Number(l.quantity ?? 0)}</TD>
                        {showPrices ? (
                          <TD numeric muted>
                            <Money value={fromDb(l.materialUnitPrice)} unit={null} />
                          </TD>
                        ) : null}
                        {showPrices ? (
                          <TD numeric muted>
                            <Money value={fromDb(l.laborUnitPrice)} unit={null} />
                          </TD>
                        ) : null}
                        {showPrices ? (
                          <TD numeric muted>
                            <Money value={fromDb(l.equipmentUnitPrice)} unit={null} />
                          </TD>
                        ) : null}
                        {showPrices ? (
                          <TD numeric muted>
                            <Money value={fromDb(l.transportUnitPrice)} unit={null} />
                          </TD>
                        ) : null}
                        {showPrices ? (
                          <TD numeric strong>
                            <Money value={fromDb(l.total)} unit={null} />
                          </TD>
                        ) : null}
                        <TD>
                          {inPackage ? (
                            <span className="text-tiny text-fill">în pachet</span>
                          ) : gate.allowed ? (
                            <span className="text-tiny text-ink-3">poate intra</span>
                          ) : (
                            <span className="text-tiny text-ink-3" title={gate.reason}>
                              material
                            </span>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
                {showPrices ? (
                  <tfoot>
                    <TFootRow>
                      <TD colSpan={8}>{internalLines.length} articole</TD>
                      <TD numeric>
                        <Money value={internalTotal} unit={null} />
                      </TD>
                      <TD />
                    </TFootRow>
                  </tfoot>
                ) : null}
              </Table>
            </Sheet>
          </>
        )
      ) : null}

      {/* ─────────── ecranul 17 — maparea ─────────── */}
      {tab === "mapare" ? (
        clientLines.length === 0 || internalLines.length === 0 ? (
          <EmptyState
            title="Maparea are nevoie de amândouă devizele"
            hint="Se leagă poziții de client de articole interne. Fără unul dintre ele nu e ce lega."
          />
        ) : (
          <MappingPanel
            devizId={id}
            clientLines={clientLines.map(toMapLine)}
            internalLines={internalLines.map(toMapLine)}
            links={links.map(
              (l): MapLink => ({
                id: l.id,
                clientLineId: l.clientLineId,
                internalLineId: l.internalLineId,
                coefficient: String(Number(l.coefficient)),
              }),
            )}
            showPrices={showPrices}
            canEdit={canEdit}
          />
        )
      ) : null}
    </div>
  );
}

function TraceBar({
  label,
  caption,
  filled,
  filledLabel,
  restLabel,
  alarming,
}: {
  label: string;
  caption: string;
  filled: number;
  filledLabel: string;
  restLabel: string;
  alarming?: boolean;
}) {
  const clamped = Math.max(0, Math.min(filled, 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-narrow text-tiny font-semibold uppercase tracking-wide text-ink">
          {label}
        </span>
        <span className="shrink-0 text-micro text-ink-3">{caption}</span>
      </div>
      <div className="mt-1 flex h-4 overflow-hidden rounded-[2px] border border-rule-strong bg-sheet">
        <div
          style={{ width: `${clamped}%` }}
          className="flex items-center justify-end bg-blueprint px-1 text-[0.5625rem] tabular text-white"
        >
          {clamped > 18 ? filledLabel : null}
        </div>
        {/* Restul e hașurat, nu gol: golul se citește „e bine”, hașura se citește „lipsește”. */}
        <div
          style={{
            width: `${100 - clamped}%`,
            backgroundImage: alarming
              ? "repeating-linear-gradient(135deg, var(--color-over) 0 1px, transparent 1px 6px)"
              : "repeating-linear-gradient(135deg, var(--color-rule-strong) 0 1px, transparent 1px 6px)",
          }}
        />
      </div>
      <div className="mt-0.5 text-right text-micro text-ink-3">{restLabel}</div>
    </div>
  );
}
