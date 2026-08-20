import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql as raw } from "drizzle-orm";

import { Badge, EmptyState, PageHeader, SectionRule } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/table";
import { db } from "@/lib/db";
import {
  contractObjectives,
  contracts,
  costEntries,
  objectives,
  partners,
  workUnits,
} from "@/lib/db/schema";
import { formatShort, fromDb, type Bani } from "@/lib/money";
import { MONTHS } from "@/lib/period";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const KIND_ICON: Record<string, string> = {
  inspectie: "🔍",
  interventie: "🔧",
  lucrare: "🏗",
};
const KIND_LABEL: Record<string, string> = {
  inspectie: "Inspecție",
  interventie: "Intervenție",
  lucrare: "Lucrare",
};

/**
 * Ecranul „istoric obiectiv" (§5) — cerut explicit.
 *
 * Se citește pe analitica „FOLOSIT", nu „descărcat": aici contează unde s-a
 * întâmplat fizic munca, nu pe ce buget s-a dus banul. De-aia istoricul rămâne
 * corect și după ce finanțarea se mută de pe un contract pe altul (§13.1).
 */
export default async function ObiectivPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const showPrices = canSeePrices(session.role);
  const { id } = await params;

  const [objective] = await db.select().from(objectives).where(eq(objectives.id, id)).limit(1);
  if (!objective) notFound();

  const links = await db
    .select({ link: contractObjectives, contract: contracts, client: partners })
    .from(contractObjectives)
    .innerJoin(contracts, eq(contractObjectives.contractId, contracts.id))
    .leftJoin(partners, eq(contracts.clientId, partners.id))
    .where(eq(contractObjectives.objectiveId, id));

  const units = await db
    .select({ unit: workUnits })
    .from(workUnits)
    .where(eq(workUnits.objectiveId, id))
    .orderBy(desc(workUnits.startDate))
    .limit(200);

  // costul pe unitate de lucru, pe analitica „folosit"
  const costRows = await db
    .select({
      workUnitId: costEntries.workUnitId,
      effectDate: costEntries.effectDate,
      total: raw<string>`sum(${costEntries.value})`,
    })
    .from(costEntries)
    .where(raw`${costEntries.objectiveId} = ${id} and ${costEntries.stage} <> 'angajat'`)
    .groupBy(costEntries.workUnitId, costEntries.effectDate);

  const costByUnit = new Map<string, Bani>();
  for (const r of costRows) {
    if (!r.workUnitId) continue;
    costByUnit.set(r.workUnitId, (costByUnit.get(r.workUnitId) ?? 0) + fromDb(r.total));
  }

  // grupare pe lună, cea mai recentă prima
  type Row = { unit: (typeof units)[number]["unit"]; cost: Bani };
  const byMonth = new Map<string, Row[]>();
  for (const { unit } of units) {
    const key = (unit.startDate ?? unit.endDate ?? "").slice(0, 7);
    if (!key) continue;
    const arr = byMonth.get(key) ?? [];
    arr.push({ unit, cost: costByUnit.get(unit.id) ?? 0 });
    byMonth.set(key, arr);
  }
  const months = [...byMonth.keys()].sort().reverse();

  const totalCost = [...costByUnit.values()].reduce((a, b) => a + b, 0);
  const currentYear = new Date().getFullYear();
  const yearCost = costRows
    .filter((r) => r.effectDate.startsWith(String(currentYear)))
    .reduce((a, r) => a + fromDb(r.total), 0);
  const monthsWithActivity = new Set(
    costRows.filter((r) => r.effectDate.startsWith(String(currentYear))).map((r) => r.effectDate.slice(0, 7)),
  ).size;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={`Obiectiv · ${objective.code}`}
        title={objective.name}
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{objective.address ?? "—"}</span>
            {objective.lat ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular">
                  {Number(objective.lat).toFixed(4)}, {Number(objective.lng).toFixed(4)}
                </span>
              </>
            ) : null}
            {objective.surface ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular">{Number(objective.surface)} mp</span>
              </>
            ) : null}
          </span>
        }
        actions={
          <Link href="/obiective" className="text-tiny text-ink-2 hover:text-ink">
            ← Toate obiectivele
          </Link>
        }
      />

      <section>
        <SectionRule right={`${links.length} legături`}>Contracte</SectionRule>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {links.length === 0 ? (
            <p className="text-tiny text-ink-2">Obiectivul nu e legat de niciun contract.</p>
          ) : (
            links.map(({ link, contract, client }) => (
              <Link
                key={link.id}
                href={`/contracte/${contract.id}`}
                className="border border-rule bg-sheet px-3 py-2 transition-colors hover:bg-sunk"
              >
                <div className="font-narrow text-[0.8125rem] font-semibold text-ink">
                  {contract.code} · {client?.name ?? "—"}
                </div>
                <div className="mt-0.5 text-micro text-ink-3">
                  din {link.fromDate}
                  {link.toDate ? ` până în ${link.toDate}` : ""}
                  {link.inspectionFrequencyMonths
                    ? ` · inspecție la ${link.inspectionFrequencyMonths} luni`
                    : ""}
                </div>
              </Link>
            ))
          )}
        </div>
      </section>

      <section>
        <SectionRule
          right={
            showPrices
              ? `total ${formatShort(totalCost)} lei · media lunară ${formatShort(monthsWithActivity ? Math.round(yearCost / monthsWithActivity) : 0)} lei`
              : `${units.length} intrări`
          }
        >
          Istoric — ce s-a întâmplat aici
        </SectionRule>

        <Sheet className="mt-2.5">
          {months.length === 0 ? (
            <EmptyState
              title="Nicio activitate înregistrată"
              hint="Aici apar inspecțiile, intervențiile și lucrările făcute pe obiectiv, oricare ar fi contractul care le-a finanțat."
            />
          ) : (
            <div className="divide-y divide-rule">
              {months.map((key) => {
                const [y, m] = key.split("-");
                const rows = byMonth.get(key)!;
                const monthTotal = rows.reduce((a, r) => a + r.cost, 0);
                return (
                  <div key={key} className="px-4 py-3">
                    <div className="flex items-baseline justify-between">
                      <span className="eyebrow">
                        {MONTHS[Number(m) - 1]} {y}
                      </span>
                      {showPrices ? (
                        <span className="tabular text-tiny font-semibold text-ink-2">
                          {formatShort(monthTotal)} lei
                        </span>
                      ) : null}
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {rows.map(({ unit, cost }) => (
                        <li key={unit.id} className="flex items-baseline gap-3 text-[0.8125rem]">
                          <span aria-hidden className="w-4 shrink-0 text-center">
                            {KIND_ICON[unit.kind]}
                          </span>
                          <Link
                            href={`/lucrari/${unit.id}`}
                            className="min-w-0 grow truncate hover:text-blueprint"
                          >
                            {unit.title}
                          </Link>
                          <Badge tone={unit.executant === "subcontractant" ? "blueprint" : "neutral"}>
                            {unit.executant === "subcontractant" ? "Subcontractant" : "Echipă proprie"}
                          </Badge>
                          <span className="w-20 shrink-0 text-right text-micro text-ink-3">
                            {KIND_LABEL[unit.kind]}
                          </span>
                          <span className="w-24 shrink-0 text-right tabular text-tiny">
                            {showPrices ? `${formatShort(cost)} lei` : "····"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Sheet>
      </section>
    </div>
  );
}
