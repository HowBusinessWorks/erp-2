import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";

import { addPackageLine, removePackageLine } from "@/app/actions/deviz";
import { Badge, Button, EmptyState, NumberInput, PageHeader } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { DataPair } from "@/components/ui/tabs";
import { Money } from "@/components/ui/gauge";
import { db } from "@/lib/db";
import {
  devizLines,
  devize,
  objectives,
  packageLines,
  packages,
  partners,
  situatiiLucrari,
  workUnits,
} from "@/lib/db/schema";
import { PACKAGE_STATUS_LABEL, SL_STATUS_LABEL, SL_STATUS_TONE, canEnterPackage } from "@/lib/deviz";
import { formatDay } from "@/lib/equipment";
import { fromDb, multiplyQty } from "@/lib/money";
import { can, canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

import { SituatieForm, SupplementForm } from "@/components/domain/DevizForms";
import { slLines } from "@/lib/db/schema";
import { UNITS } from "@/lib/nomenclatoare-types";

export const dynamic = "force-dynamic";

const MONTHS = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

export default async function PachetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const showPrices = canSeePrices(session.role);
  const canEdit = can(session.role, "pachete.gestioneaza");
  // §9.6 — situația manuală, pentru lucrările care nu vin prin portalul de subcontractanți.
  const canDeclare = can(session.role, "sl.verifica") || can(session.role, "sl.aproba");

  const [row] = await db
    .select({ pkg: packages, subcontractor: partners, unit: workUnits, objective: objectives })
    .from(packages)
    .leftJoin(partners, eq(packages.subcontractorId, partners.id))
    .leftJoin(workUnits, eq(packages.workUnitId, workUnits.id))
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(eq(packages.id, id))
    .limit(1);
  if (!row) notFound();

  const [lines, situatii, internal] = await Promise.all([
    db
      .select()
      .from(packageLines)
      .where(eq(packageLines.packageId, id))
      .orderBy(asc(packageLines.position)),
    db
      .select()
      .from(situatiiLucrari)
      .where(eq(situatiiLucrari.packageId, id))
      .orderBy(desc(situatiiLucrari.year), desc(situatiiLucrari.month)),
    // articolele devizului intern al aceleiași unități de lucru — candidații pentru pachet
    db
      .select({ line: devizLines })
      .from(devizLines)
      .innerJoin(devize, eq(devizLines.devizId, devize.id))
      .where(eq(devize.workUnitId, row.pkg.workUnitId))
      .orderBy(asc(devizLines.position)),
  ]);

  // Executatul cumulat de până acum, pe poziție — de el atârnă blocajul de la §10.1.
  const executed = canDeclare
    ? await db
        .select({
          packageLineId: slLines.packageLineId,
          executedCumulative: slLines.executedCumulative,
        })
        .from(slLines)
        .innerJoin(situatiiLucrari, eq(slLines.situatieId, situatiiLucrari.id))
        .where(eq(situatiiLucrari.packageId, id))
    : [];

  const executedOf = new Map<string, number>();
  for (const e of executed) {
    if (!e.packageLineId) continue;
    executedOf.set(
      e.packageLineId,
      Math.max(executedOf.get(e.packageLineId) ?? 0, Number(e.executedCumulative ?? 0)),
    );
  }

  const declarableLines = lines.map((l) => ({
    id: l.id,
    name: l.name,
    unit: l.unit,
    contracted: Number(l.contractedQty ?? 0),
    executed: executedOf.get(l.id) ?? 0,
  }));

  const inPackage = new Set(lines.map((l) => l.internalLineId).filter(Boolean) as string[]);
  const candidates = internal
    .map((i) => ({ line: i.line, gate: canEnterPackage(i.line) }))
    .filter((c) => !inPackage.has(c.line.id));

  const total = lines.reduce(
    (a, l) => a + multiplyQty(fromDb(l.agreedPrice), Number(l.contractedQty ?? 0)),
    0,
  );
  const blocked = candidates.filter((c) => !c.gate.allowed);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <Link href="/pachete" className="hover:text-blueprint">
            ‹ Pachete
          </Link>
        }
        title={`${row.pkg.code} — ${row.pkg.name}`}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={row.pkg.status === "acceptat" ? "fill" : "neutral"}>
              {PACKAGE_STATUS_LABEL[row.pkg.status] ?? row.pkg.status}
            </Badge>
            <span>{row.pkg.specialty}</span>
            <span>· {row.subcontractor?.name ?? "regie proprie"}</span>
          </span>
        }
        actions={
          <>
            {canDeclare && lines.length > 0 ? (
              <SituatieForm packageId={id} lines={declarableLines} />
            ) : null}
            {canDeclare ? <SupplementForm packageId={id} units={UNITS} /> : null}
          </>
        }
      />

      <Sheet className="grid gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-4">
        <DataPair label="Unitate de lucru">
          {row.unit ? (
            <Link href={`/lucrari/${row.unit.id}`} className="hover:text-blueprint">
              {row.unit.code}
            </Link>
          ) : (
            "—"
          )}
        </DataPair>
        <DataPair label="Obiectiv">{row.objective?.name ?? "—"}</DataPair>
        <DataPair label="Garanție reținută" numeric>
          {Number(row.pkg.retentionPercent ?? 0)}%
        </DataPair>
        {showPrices ? (
          <DataPair label="Valoare pachet" numeric>
            <Money value={total} />
          </DataPair>
        ) : null}
      </Sheet>

      {/* ─────────── pozițiile pachetului ─────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="eyebrow shrink-0">Poziții contractate</span>
          <span aria-hidden className="h-px grow bg-rule" />
          <span className="shrink-0 text-micro text-ink-3">{lines.length}</span>
        </div>

        {lines.length === 0 ? (
          <EmptyState title="Pachet gol" hint="Se adaugă articole de manoperă din devizul intern." />
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH numeric>#</TH>
                  <TH>Poziție</TH>
                  <TH>UM</TH>
                  <TH numeric>Cantitate</TH>
                  {showPrices ? <TH numeric>Preț propus</TH> : null}
                  {showPrices ? <TH numeric>Preț agreat</TH> : null}
                  {showPrices ? <TH numeric>Valoare</TH> : null}
                  {canEdit ? <TH /> : null}
                </TR>
              </THead>
              <TBody>
                {lines.map((l) => (
                  <TR key={l.id}>
                    <TD numeric muted>{l.position}</TD>
                    <TD className="max-w-80">{l.name}</TD>
                    <TD muted>{l.unit}</TD>
                    <TD numeric>{Number(l.contractedQty ?? 0)}</TD>
                    {showPrices ? (
                      <TD numeric muted>
                        <Money value={fromDb(l.proposedPrice)} unit={null} />
                      </TD>
                    ) : null}
                    {showPrices ? (
                      <TD numeric>
                        <Money value={fromDb(l.agreedPrice)} unit={null} />
                      </TD>
                    ) : null}
                    {showPrices ? (
                      <TD numeric strong>
                        <Money
                          value={multiplyQty(fromDb(l.agreedPrice), Number(l.contractedQty ?? 0))}
                          unit={null}
                        />
                      </TD>
                    ) : null}
                    {canEdit ? (
                      <TD>
                        <form action={removePackageLine}>
                          <input type="hidden" name="lineId" value={l.id} />
                          <input type="hidden" name="packageId" value={id} />
                          <button type="submit" className="text-micro text-over hover:underline">
                            scoate
                          </button>
                        </form>
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
              {showPrices ? (
                <tfoot>
                  <TFootRow>
                    <TD colSpan={6}>Total pachet</TD>
                    <TD numeric>
                      <Money value={total} unit={null} />
                    </TD>
                    {canEdit ? <TD /> : null}
                  </TFootRow>
                </tfoot>
              ) : null}
            </Table>
          </Sheet>
        )}
      </section>

      {/* ─────────── regula: materialele nu intră în pachet ─────────── */}
      {canEdit ? (
        <section className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="eyebrow shrink-0">Din devizul intern</span>
            <span aria-hidden className="h-px grow bg-rule" />
            <span className="shrink-0 text-micro text-ink-3">
              {candidates.length - blocked.length} pot intra · {blocked.length} refuzate
            </span>
          </div>

          <p className="max-w-prose text-micro text-ink-3">
            Materialele nu se pot adăuga. Nu cu un avertisment pe care îl închizi — pur și simplu
            nu au buton. Un pachet cu material în el înseamnă că plătești aceeași țeavă de două
            ori: o dată la furnizor și o dată în prețul subcontractantului.
          </p>

          {candidates.length === 0 ? (
            <EmptyState title="Tot devizul intern e deja în pachete" />
          ) : (
            <Sheet>
              <Table>
                <THead>
                  <TR>
                    <TH>Articol</TH>
                    <TH>Categorie</TH>
                    <TH numeric>Cant.</TH>
                    {showPrices ? <TH numeric>Material</TH> : null}
                    {showPrices ? <TH numeric>Manoperă</TH> : null}
                    <TH>Adaugă</TH>
                  </TR>
                </THead>
                <TBody>
                  {candidates.map(({ line, gate }) => (
                    <TR key={line.id}>
                      <TD className="max-w-72">{line.name}</TD>
                      <TD muted>{line.category ?? "—"}</TD>
                      <TD numeric>{Number(line.quantity ?? 0)}</TD>
                      {showPrices ? (
                        <TD numeric muted>
                          <Money value={fromDb(line.materialUnitPrice)} unit={null} />
                        </TD>
                      ) : null}
                      {showPrices ? (
                        <TD numeric muted>
                          <Money value={fromDb(line.laborUnitPrice)} unit={null} />
                        </TD>
                      ) : null}
                      <TD>
                        {gate.allowed ? (
                          <form action={addPackageLine} className="flex items-center gap-1.5">
                            <input type="hidden" name="packageId" value={id} />
                            <input type="hidden" name="internalLineId" value={line.id} />
                            <NumberInput
                              name="proposedPrice"
                              defaultValue={String(fromDb(line.laborUnitPrice) / 100)}
                              className="h-7 w-24 text-micro"
                              title="Preț propus subcontractantului"
                            />
                            <Button type="submit" size="sm">
                              adaugă
                            </Button>
                          </form>
                        ) : (
                          <span className="text-micro text-ink-3">{gate.reason}</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Sheet>
          )}
        </section>
      ) : null}

      {/* ─────────── situațiile emise pe pachet ─────────── */}
      {situatii.length ? (
        <section className="space-y-2">
          <span className="eyebrow">Situații de lucrări</span>
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Cod</TH>
                  <TH>Luna</TH>
                  <TH>Stare</TH>
                  <TH>Declarată</TH>
                  <TH>Aprobată</TH>
                  {showPrices ? <TH numeric>Garanție reținută</TH> : null}
                </TR>
              </THead>
              <TBody>
                {situatii.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <Link href={`/situatii/${s.id}`} className="font-medium hover:text-blueprint">
                        {s.code ?? "—"}
                      </Link>
                    </TD>
                    <TD muted>
                      {MONTHS[s.month - 1]} {s.year}
                    </TD>
                    <TD>
                      <Badge tone={SL_STATUS_TONE[s.status]}>{SL_STATUS_LABEL[s.status]}</Badge>
                    </TD>
                    <TD muted>
                      {s.declaredAt ? formatDay(String(s.declaredAt).slice(0, 10)) : "—"}
                    </TD>
                    <TD muted>
                      {s.approvedAt ? formatDay(String(s.approvedAt).slice(0, 10)) : "—"}
                    </TD>
                    {showPrices ? (
                      <TD numeric muted>
                        <Money value={fromDb(s.retentionValue)} unit={null} />
                      </TD>
                    ) : null}
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
