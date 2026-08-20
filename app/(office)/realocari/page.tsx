import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql as raw } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { MonthNav } from "@/components/domain/MonthNav";
import { PageHeader } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import { contractComponents, contracts, reallocations, users, workUnits } from "@/lib/db/schema";
import { formatShort, fromDb } from "@/lib/money";
import { labelPeriod, periodFromParams } from "@/lib/period";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Ecranul 13 — lista realocărilor lunii, obligatorie prin §13.1.
 *
 * Fiecare rând de aici e o mutare de bani între componente, făcută peste o lună deja
 * închisă. Contabilul trebuie să o poată explica auditorului fără să deschidă softul:
 * cine, când, de pe ce, pe ce, cât și de ce.
 */
export default async function RealocariPage({
  searchParams,
}: {
  searchParams: Promise<{ an?: string; luna?: string }>;
}) {
  const session = await requireSession();
  if (!canSeePrices(session.role)) notFound();

  const period = periodFromParams(await searchParams);

  const fromComponent = alias(contractComponents, "from_component");
  const toComponent = alias(contractComponents, "to_component");
  const fromContract = alias(contracts, "from_contract");
  const toContract = alias(contracts, "to_contract");

  const rows = await db
    .select({
      realloc: reallocations,
      unit: workUnits,
      fromComponent,
      toComponent,
      fromContract,
      toContract,
      actor: users,
    })
    .from(reallocations)
    .leftJoin(workUnits, eq(reallocations.workUnitId, workUnits.id))
    .leftJoin(fromComponent, eq(reallocations.fromComponentId, fromComponent.id))
    .leftJoin(toComponent, eq(reallocations.toComponentId, toComponent.id))
    .leftJoin(fromContract, eq(fromComponent.contractId, fromContract.id))
    .leftJoin(toContract, eq(toComponent.contractId, toContract.id))
    .leftJoin(users, eq(reallocations.createdBy, users.id))
    .where(and(eq(reallocations.year, period.year), eq(reallocations.month, period.month)))
    .orderBy(desc(reallocations.createdAt));

  const total = rows.reduce((a, r) => a + fromDb(r.realloc.value), 0);
  const crossContract = rows.filter(
    (r) => r.fromContract && r.toContract && r.fromContract.id !== r.toContract.id,
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operațional"
        title="Realocări"
        meta="Mutări de finanțare peste luni deja închise. Liniile originale au rămas datate în luna lor; aici e mișcarea de corecție, în luna curentă."
        actions={<MonthNav period={period} basePath="/realocari" />}
      />

      <div className="flex flex-wrap gap-6 border-b border-rule pb-3">
        <div>
          <div className="eyebrow">Valoare mutată în {labelPeriod(period)}</div>
          <div className="tabular mt-0.5 text-xl font-semibold text-ink">{formatShort(total)}</div>
        </div>
        <div>
          <div className="eyebrow">Documente</div>
          <div className="tabular mt-0.5 text-xl font-semibold text-ink">{rows.length}</div>
        </div>
        <div>
          <div className="eyebrow">Între contracte diferite</div>
          <div className="tabular mt-0.5 text-xl font-semibold text-ink">{crossContract}</div>
        </div>
      </div>

      <Sheet>
        <Table>
          <THead>
            <TR>
              <TH>Data</TH>
              <TH>Unitate de lucru</TH>
              <TH>Din</TH>
              <TH>În</TH>
              <TH numeric>Valoare</TH>
              <TH>Cine</TH>
              <TH>Motiv</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map(({ realloc, unit, fromComponent: fc, toComponent: tc, fromContract: fct, toContract: tct, actor }) => (
              <TR key={realloc.id}>
                <TD muted className="whitespace-nowrap">
                  {new Intl.DateTimeFormat("ro-RO", { dateStyle: "short" }).format(realloc.createdAt)}
                </TD>
                <TD>
                  {unit ? (
                    <Link href={`/lucrari/${unit.id}`} className="hover:text-blueprint">
                      {unit.code}
                    </Link>
                  ) : (
                    "—"
                  )}
                  <span className="block max-w-56 truncate text-micro text-ink-3">
                    {unit?.title}
                  </span>
                </TD>
                <TD muted>
                  {fct?.code ?? "—"}
                  <span className="block text-micro">{fc?.name ?? "—"}</span>
                </TD>
                <TD muted>
                  {tct?.code ?? "—"}
                  <span className="block text-micro">{tc?.name ?? "—"}</span>
                </TD>
                <TD numeric strong>
                  {formatShort(fromDb(realloc.value))}
                </TD>
                <TD muted>{actor?.name ?? "—"}</TD>
                <TD muted className="max-w-72">
                  {realloc.reason}
                </TD>
              </TR>
            ))}
          </TBody>
          <tfoot>
            <TFootRow>
              <TD colSpan={4}>{rows.length} documente de realocare</TD>
              <TD numeric>{formatShort(total)}</TD>
              <TD colSpan={2} />
            </TFootRow>
          </tfoot>
        </Table>
      </Sheet>

      {rows.length === 0 ? (
        <p className="max-w-prose text-tiny text-ink-2">
          Nicio realocare în {labelPeriod(period)}. Lista se umple singură când cineva mută
          finanțarea unei unități de lucru care are cost într-o lună deja închisă — mutarea din
          luna deschisă rescrie direct, fără document.
        </p>
      ) : null}
    </div>
  );
}
