import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, sql as raw } from "drizzle-orm";

import { MonthNav } from "@/components/domain/MonthNav";
import { BudgetRow } from "@/components/ui/gauge";
import { Badge, EmptyState, PageHeader, SectionRule } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { budgetsForMonth, marginOf } from "@/lib/budget";
import { db } from "@/lib/db";
import {
  contractComponents,
  contractObjectives,
  contractYears,
  contracts,
  costEntries,
  fundingAllocations,
  objectives,
  partners,
  periods,
  users,
  workUnits,
} from "@/lib/db/schema";
import { formatShort, fromDb } from "@/lib/money";
import { labelPeriod, periodFromParams } from "@/lib/period";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const UNIT_KIND: Record<string, string> = {
  inspectie: "Inspecție",
  interventie: "Intervenție",
  lucrare: "Lucrare",
};

export default async function ContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ an?: string; luna?: string }>;
}) {
  const session = await requireSession();
  const showPrices = canSeePrices(session.role);
  const { id } = await params;
  const period = periodFromParams(await searchParams);

  const [row] = await db
    .select({ contract: contracts, client: partners, owner: users })
    .from(contracts)
    .leftJoin(partners, eq(contracts.clientId, partners.id))
    .leftJoin(users, eq(contracts.ownerId, users.id))
    .where(eq(contracts.id, id))
    .limit(1);
  if (!row) notFound();

  const { contract, client, owner } = row;

  const budgets = await budgetsForMonth(period.year, period.month, [id]);
  const budget = budgets.get(id);

  const [periodRow] = await db
    .select()
    .from(periods)
    .where(
      and(
        eq(periods.firmId, contract.firmId),
        eq(periods.year, period.year),
        eq(periods.month, period.month),
      ),
    )
    .limit(1);
  const isClosed = Boolean(periodRow?.closedAt);

  // Anul contractual în care cade luna afișată — marja se citește pe an, nu doar cumulat (§22.6).
  const day = `${period.year}-${String(period.month).padStart(2, "0")}-15`;
  const years = await db.select().from(contractYears).where(eq(contractYears.contractId, id));
  const activeYear = years.find((y) => y.startDate <= day && day <= y.endDate);

  // Cumulatul pe anul contractual curent
  const [cumulative] = activeYear
    ? await db
        .select({ total: raw<string>`coalesce(sum(${costEntries.value}), 0)` })
        .from(costEntries)
        .where(
          and(
            eq(costEntries.chargedContractId, id),
            raw`${costEntries.effectDate} between ${activeYear.startDate} and ${activeYear.endDate}`,
            raw`${costEntries.stage} <> 'angajat'`,
          ),
        )
    : [{ total: "0" }];

  const monthsElapsed = activeYear
    ? Math.max(
        1,
        Math.round(
          (new Date(day).getTime() - new Date(activeYear.startDate).getTime()) /
            (1000 * 60 * 60 * 24 * 30.4),
        ),
      )
    : 1;
  const cumulativeRevenue = (budget?.revenue ?? 0) * monthsElapsed;
  const cumulativeMargin = marginOf(cumulativeRevenue, fromDb(cumulative.total));

  // Unitățile de lucru finanțate din luna asta
  const financed = await db
    .select({
      unit: workUnits,
      objective: objectives,
      component: contractComponents,
      allocation: fundingAllocations,
    })
    .from(fundingAllocations)
    .innerJoin(workUnits, eq(fundingAllocations.workUnitId, workUnits.id))
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .leftJoin(contractComponents, eq(fundingAllocations.componentId, contractComponents.id))
    .where(
      and(
        eq(fundingAllocations.contractId, id),
        eq(fundingAllocations.year, period.year),
        eq(fundingAllocations.month, period.month),
        eq(fundingAllocations.status, "activ"),
      ),
    )
    .limit(60);

  const objectiveCount = await db
    .select({ id: contractObjectives.id })
    .from(contractObjectives)
    .where(eq(contractObjectives.contractId, id));

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={`Contract · ${client?.name ?? "—"}`}
        title={`${contract.code} — ${contract.name}`}
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Proprietar: {owner?.name ?? "—"}</span>
            <span aria-hidden>·</span>
            <span>
              {contract.startDate} → {contract.endDate}
            </span>
            <span aria-hidden>·</span>
            <span>{objectiveCount.length} obiective</span>
            {activeYear ? (
              <>
                <span aria-hidden>·</span>
                <span>
                  anul {activeYear.yearNo} din {years.length}
                </span>
              </>
            ) : null}
            {Number(contract.indexationPercent) === 0 ? (
              <Badge tone="over">indexare 0%</Badge>
            ) : null}
          </span>
        }
        actions={<MonthNav period={period} basePath={`/contracte/${id}`} closed={isClosed} />}
      />

      <nav className="flex gap-4 border-b border-rule text-tiny">
        <span className="border-b-2 border-blueprint pb-1.5 font-medium text-ink">Plafoane</span>
        <Link
          href={`/contracte/${id}/ani`}
          className="pb-1.5 text-ink-2 transition-colors hover:text-ink"
        >
          Marjă pe ani
        </Link>
        <Link
          href={`/cost?contract=${id}&an=${period.year}&luna=${period.month}`}
          className="pb-1.5 text-ink-2 transition-colors hover:text-ink"
        >
          Registrul de cost
        </Link>
      </nav>

      {/* Ecranul din §4.3 — un singur bloc, per contract, per lună. */}
      {budget && showPrices ? (
        <section className="sheet px-5 py-4">
          <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
            <span className="eyebrow">Abonament lunar</span>
            <span className="tabular text-xl font-semibold text-ink">
              {formatShort(budget.subscription)} <span className="text-tiny text-ink-3">lei</span>
            </span>
          </div>

          <div className="divide-y divide-rule">
            {budget.views.map((view) => (
              <BudgetRow
                key={view.componentId}
                label={view.name}
                direction={view.direction}
                percent={view.percent}
                caption={
                  view.direction === "umple"
                    ? `plafon venit ${formatShort(view.cap)} · umplut ${formatShort(view.cap - (view.unfilled ?? 0))} · liber ${formatShort(view.unfilled ?? 0)}`
                    : `venit ${formatShort(view.revenue)} · plafon cost ${formatShort(view.cap)}`
                }
                right={
                  view.direction === "umple"
                    ? undefined
                    : `angajat ${formatShort(view.committed)} · consumat ${formatShort(view.consumed)} · rest ${formatShort(view.remaining)}`
                }
              />
            ))}
          </div>

          {/* Delta neumplută e venit pierdut fără cost — se spune pe față, nu se deduce. */}
          {budget.views
            .filter((v) => v.direction === "umple" && (v.unfilled ?? 0) > 0)
            .map((v) => (
              <p
                key={v.componentId}
                className="mt-2 border-l-2 border-over bg-over-soft px-3 py-2 text-tiny text-over"
              >
                {formatShort(v.unfilled ?? 0)} lei neumpluți din Delta lunii. Nu se reportează în
                luna următoare. <Link href="/cereri" className="underline">Vezi backlogul de propuneri</Link>
              </p>
            ))}

          <footer className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-rule-strong pt-2.5 text-tiny">
            <span className="text-ink-2">
              Marjă lună{" "}
              <span
                className={`tabular font-semibold ${budget.margin < 15 ? "text-over" : budget.margin < 22 ? "text-warn" : "text-fill"}`}
              >
                {budget.margin.toFixed(1)}%
              </span>
            </span>
            {activeYear ? (
              <span className="text-ink-2">
                Marjă cumulată anul {activeYear.yearNo}{" "}
                <span
                  className={`tabular font-semibold ${cumulativeMargin < 15 ? "text-over" : cumulativeMargin < 22 ? "text-warn" : "text-fill"}`}
                >
                  {cumulativeMargin.toFixed(1)}%
                </span>
              </span>
            ) : null}
          </footer>
        </section>
      ) : null}

      <section>
        <SectionRule right={`${financed.length} unități`}>
          Finanțate din {labelPeriod(period)}
        </SectionRule>
        <Sheet className="mt-2.5">
          {financed.length === 0 ? (
            <EmptyState
              title="Nicio unitate de lucru finanțată luna asta"
              hint="Unitățile apar aici după ce o cerere e rutată către o componentă a contractului, din ecranul de cereri."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Cod</TH>
                  <TH>Tip</TH>
                  <TH>Denumire</TH>
                  <TH>Obiectiv</TH>
                  <TH>Componentă</TH>
                  <TH numeric>Alocat</TH>
                </TR>
              </THead>
              <TBody>
                {financed.map(({ unit, objective, component, allocation }) => (
                  <TR key={allocation.id}>
                    <TD strong>
                      <Link href={`/lucrari/${unit.id}`} className="hover:text-blueprint">
                        {unit.code}
                      </Link>
                    </TD>
                    <TD>
                      <Badge tone={unit.kind === "lucrare" ? "blueprint" : "neutral"}>
                        {UNIT_KIND[unit.kind]}
                      </Badge>
                    </TD>
                    <TD>{unit.title}</TD>
                    <TD muted>{objective?.name ?? "—"}</TD>
                    <TD muted>{component?.name ?? "—"}</TD>
                    <TD numeric>
                      {showPrices ? formatShort(fromDb(allocation.allocatedValue)) : "····"}
                    </TD>
                  </TR>
                ))}
              </TBody>
              {showPrices ? (
                <tfoot>
                  <TFootRow>
                    <TD colSpan={5}>Total alocat</TD>
                    <TD numeric>
                      {formatShort(
                        financed.reduce((a, f) => a + fromDb(f.allocation.allocatedValue), 0),
                      )}
                    </TD>
                  </TFootRow>
                </tfoot>
              ) : null}
            </Table>
          )}
        </Sheet>
      </section>
    </div>
  );
}
