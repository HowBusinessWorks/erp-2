import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, sql as raw } from "drizzle-orm";

import { promoteWorkUnit, setWorkUnitStatus } from "@/app/actions/work-units";
import { Badge, Button, PageHeader, SectionRule } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { DataPair, Tabs } from "@/components/ui/tabs";
import { db } from "@/lib/db";
import {
  contractComponents,
  contracts,
  costEntries,
  fileNodes,
  fundingAllocations,
  inspectionAnswers,
  interventionDetails,
  objectives,
  partners,
  periods,
  reallocations,
  siteJournalEntries,
  timesheets,
  users,
  workUnits,
  workUnitStages,
} from "@/lib/db/schema";
import { formatShort, fromDb, ratio } from "@/lib/money";
import { currentPeriod, labelPeriod } from "@/lib/period";
import { can, canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { KIND_LABEL, STATUS_LABEL } from "@/lib/work-units";

import { MoveFunding } from "./MoveFunding";

export const dynamic = "force-dynamic";

const COST_LABEL: Record<string, string> = {
  material: "Material",
  manopera: "Manoperă",
  servicii_subc: "Subcontractant",
  utilaj: "Utilaj",
  motorina: "Motorină",
  transport: "Transport",
  reparatii: "Reparații",
  alte: "Alte",
};

type Tab = "finantare" | "cost" | "fise" | "fisiere" | "etape";

export default async function LucrarePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const tab = (((await searchParams).tab ?? "finantare") as Tab) ?? "finantare";
  const showPrices = canSeePrices(session.role);

  const [row] = await db
    .select({ unit: workUnits, objective: objectives, responsible: users, subcontractor: partners })
    .from(workUnits)
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .leftJoin(users, eq(workUnits.responsibleId, users.id))
    .leftJoin(partners, eq(workUnits.subcontractorId, partners.id))
    .where(eq(workUnits.id, id))
    .limit(1);
  if (!row) notFound();
  const { unit, objective, responsible, subcontractor } = row;

  const [allocations, costTotals] = await Promise.all([
    db
      .select({ allocation: fundingAllocations, contract: contracts, component: contractComponents })
      .from(fundingAllocations)
      .leftJoin(contracts, eq(fundingAllocations.contractId, contracts.id))
      .leftJoin(contractComponents, eq(fundingAllocations.componentId, contractComponents.id))
      .where(eq(fundingAllocations.workUnitId, id))
      .orderBy(desc(fundingAllocations.year), desc(fundingAllocations.month)),
    db
      .select({ stage: costEntries.stage, total: raw<string>`sum(${costEntries.value})` })
      .from(costEntries)
      .where(eq(costEntries.workUnitId, id))
      .groupBy(costEntries.stage),
  ]);

  const active = allocations.filter((a) => a.allocation.status === "activ");
  const allocated = active.reduce((a, x) => a + fromDb(x.allocation.allocatedValue), 0);
  const consumed = costTotals
    .filter((c) => c.stage !== "angajat")
    .reduce((a, c) => a + fromDb(c.total), 0);
  const committed = fromDb(costTotals.find((c) => c.stage === "angajat")?.total ?? "0");
  const budget = fromDb(unit.budgetCost);
  const period = currentPeriod();

  const tabs = [
    { key: "finantare", href: `/lucrari/${id}?tab=finantare`, label: "Finanțare", count: allocations.length },
    { key: "cost", href: `/lucrari/${id}?tab=cost`, label: "Cost" },
    { key: "fise", href: `/lucrari/${id}?tab=fise`, label: "Fișe" },
    { key: "etape", href: `/lucrari/${id}?tab=etape`, label: "Etape" },
    { key: "fisiere", href: `/lucrari/${id}?tab=fisiere`, label: "Fișiere" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/lucrari" className="hover:text-blueprint">Unități de lucru</Link>}
        title={unit.title}
        meta={
          <>
            {unit.code} · {KIND_LABEL[unit.kind as keyof typeof KIND_LABEL]}
            {unit.promotedFrom ? " · promovată din intervenție" : null} ·{" "}
            {objective ? (
              <Link href={`/obiective/${objective.id}`} className="hover:text-blueprint">
                {objective.name}
              </Link>
            ) : (
              "—"
            )}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {/* P7 — promovarea păstrează id-ul, deci pozele, orele și consumurile rămân pe loc. */}
            {unit.kind === "interventie" && can(session.role, "cereri.decide") ? (
              <form action={promoteWorkUnit}>
                <input type="hidden" name="workUnitId" value={unit.id} />
                <input
                  type="hidden"
                  name="estimatedValue"
                  value={(fromDb(unit.estimatedValue) / 100).toFixed(2)}
                />
                <Button type="submit" size="sm">
                  Promovează în lucrare
                </Button>
              </form>
            ) : null}
            {can(session.role, "cost.realoca") ? (
              <MoveFundingSlot workUnitId={unit.id} activeAllocation={active[0]} period={period} />
            ) : null}
            {can(session.role, "cereri.decide") && unit.status !== "finalizata" ? (
              <form action={setWorkUnitStatus}>
                <input type="hidden" name="workUnitId" value={unit.id} />
                <input type="hidden" name="status" value="finalizata" />
                <Button type="submit" variant="primary" size="sm">
                  Finalizează
                </Button>
              </form>
            ) : null}
          </div>
        }
      />

      {/* Antetul de dosar: cifrele după care se citește unitatea, o dată, sus. */}
      <div className="sheet grid gap-4 px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
        <DataPair label="Stare">
          <Badge tone={unit.status === "finalizata" ? "fill" : "blueprint"}>
            {STATUS_LABEL[unit.status]}
          </Badge>
        </DataPair>
        <DataPair label="Perioadă">
          {unit.startDate ?? "—"} → {unit.endDate ?? "—"}
        </DataPair>
        <DataPair label="Responsabil">{responsible?.name ?? "—"}</DataPair>
        <DataPair label="Executant">{subcontractor?.name ?? "propriu"}</DataPair>
        {showPrices ? (
          <>
            <DataPair label="Alocat / buget" numeric>
              {formatShort(allocated)} / {formatShort(budget)}
            </DataPair>
            <DataPair label="Consumat" numeric>
              <span className={consumed > budget && budget > 0 ? "font-semibold text-over" : undefined}>
                {formatShort(consumed)}
              </span>
              {committed > 0 ? (
                <span className="block text-micro text-warn">
                  + {formatShort(committed)} angajat
                </span>
              ) : null}
            </DataPair>
          </>
        ) : null}
      </div>

      <Tabs items={tabs} active={tab} />

      {tab === "finantare" ? (
        <FundingTab
          id={id}
          allocations={allocations}
          allocated={allocated}
          consumed={consumed}
          showPrices={showPrices}
        />
      ) : null}
      {tab === "cost" ? <CostTab id={id} showPrices={showPrices} /> : null}
      {tab === "fise" ? <SheetsTab id={id} /> : null}
      {tab === "etape" ? <StagesTab id={id} showPrices={showPrices} /> : null}
      {tab === "fisiere" ? <FilesTab id={id} /> : null}
    </div>
  );
}

/* ─────────────────────── mutarea finanțării ─────────────────────── */

async function MoveFundingSlot({
  workUnitId,
  activeAllocation,
  period,
}: {
  workUnitId: string;
  activeAllocation?: {
    contract: typeof contracts.$inferSelect | null;
    component: typeof contractComponents.$inferSelect | null;
  };
  period: { year: number; month: number };
}) {
  const components = await db
    .select({ component: contractComponents, contract: contracts })
    .from(contractComponents)
    .innerJoin(contracts, eq(contractComponents.contractId, contracts.id))
    .orderBy(asc(contracts.code));

  // Câte dintre lunile în care unitatea are cost sunt deja închise — de asta depinde
  // care dintre cele două comportamente din §13.1 se declanșează.
  const months = await db
    .select({
      firmId: costEntries.firmId,
      year: raw<number>`extract(year from ${costEntries.effectDate})::int`,
      month: raw<number>`extract(month from ${costEntries.effectDate})::int`,
    })
    .from(costEntries)
    .where(eq(costEntries.workUnitId, workUnitId))
    .groupBy(
      costEntries.firmId,
      raw`extract(year from ${costEntries.effectDate})`,
      raw`extract(month from ${costEntries.effectDate})`,
    );

  let closedMonths = 0;
  if (months.length) {
    const closed = await db
      .select({ year: periods.year, month: periods.month, firmId: periods.firmId })
      .from(periods)
      .where(
        and(
          inArray(periods.firmId, [...new Set(months.map((m) => m.firmId))]),
          raw`${periods.closedAt} is not null`,
        ),
      );
    closedMonths = months.filter((m) =>
      closed.some((c) => c.firmId === m.firmId && c.year === m.year && c.month === m.month),
    ).length;
  }

  return (
    <MoveFunding
      workUnitId={workUnitId}
      current={
        activeAllocation?.contract
          ? {
              contractCode: activeAllocation.contract.code,
              componentName: activeAllocation.component?.name ?? "—",
            }
          : null
      }
      options={components.map(({ component, contract }) => ({
        id: component.id,
        label: `${contract.code} · ${component.name}`,
      }))}
      period={period}
      periodLabel={labelPeriod(period)}
      closedMonths={closedMonths}
    />
  );
}

/* ─────────────────────── tab-uri ─────────────────────── */

function FundingTab({
  id,
  allocations,
  allocated,
  consumed,
  showPrices,
}: {
  id: string;
  allocations: {
    allocation: typeof fundingAllocations.$inferSelect;
    contract: typeof contracts.$inferSelect | null;
    component: typeof contractComponents.$inferSelect | null;
  }[];
  allocated: number;
  consumed: number;
  showPrices: boolean;
}) {
  if (!showPrices) {
    return <p className="text-tiny text-ink-2">Finanțarea nu se vede din rolul curent.</p>;
  }
  return (
    <div className="space-y-4">
      <p className="max-w-prose text-tiny text-ink-2">
        Finanțarea e o legătură, nu un câmp pe unitatea de lucru. O lucrare mare poate avea trei
        alocări paralele, pe trei luni de Delta. Alocările înlocuite rămân vizibile — ele sunt
        istoricul deciziilor.
      </p>
      <Sheet>
        <Table>
          <THead>
            <TR>
              <TH>Lună</TH>
              <TH>Contract</TH>
              <TH>Componentă</TH>
              <TH numeric>Valoare</TH>
              <TH>Stare</TH>
              <TH>Motiv</TH>
            </TR>
          </THead>
          <TBody>
            {allocations.map(({ allocation, contract, component }) => (
              <TR key={allocation.id} className={allocation.status === "inlocuit" ? "opacity-55" : undefined}>
                <TD className="whitespace-nowrap">
                  {labelPeriod({ year: allocation.year, month: allocation.month })}
                </TD>
                <TD>{contract?.code ?? "—"}</TD>
                <TD muted>{component?.name ?? "—"}</TD>
                <TD numeric strong>
                  {formatShort(fromDb(allocation.allocatedValue))}
                </TD>
                <TD>
                  <Badge tone={allocation.status === "activ" ? "fill" : "neutral"}>
                    {allocation.status}
                  </Badge>
                </TD>
                <TD muted className="max-w-72">
                  {allocation.reason ?? "—"}
                </TD>
              </TR>
            ))}
          </TBody>
          <tfoot>
            <TFootRow>
              <TD colSpan={3}>Alocat activ</TD>
              <TD numeric>{formatShort(allocated)}</TD>
              <TD colSpan={2} className="text-tiny font-normal text-ink-2">
                consumat {formatShort(consumed)} ·{" "}
                {allocated === 0 ? "—" : `marjă ${ratio(allocated - consumed, allocated).toFixed(1)}%`}
              </TD>
            </TFootRow>
          </tfoot>
        </Table>
      </Sheet>
      <ReallocationsForUnit id={id} />
    </div>
  );
}

async function ReallocationsForUnit({ id }: { id: string }) {
  const rows = await db
    .select({ realloc: reallocations, actor: users })
    .from(reallocations)
    .leftJoin(users, eq(reallocations.createdBy, users.id))
    .where(eq(reallocations.workUnitId, id))
    .orderBy(desc(reallocations.createdAt));

  if (rows.length === 0) return null;

  return (
    <section className="space-y-2">
      <SectionRule>Documente de realocare</SectionRule>
      <p className="text-tiny text-ink-2">
        Emise pentru lunile deja închise. Liniile de cost au rămas datate în luna lor.
      </p>
      <ul className="divide-y divide-rule border-y border-rule">
        {rows.map(({ realloc, actor }) => (
          <li key={realloc.id} className="flex items-baseline justify-between gap-3 py-2 text-tiny">
            <span className="text-ink">
              {labelPeriod({ year: realloc.year, month: realloc.month })} · {realloc.reason}
            </span>
            <span className="tabular shrink-0 text-ink-2">
              {formatShort(fromDb(realloc.value))} · {actor?.name ?? "—"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function CostTab({ id, showPrices }: { id: string; showPrices: boolean }) {
  if (!showPrices) {
    return <p className="text-tiny text-ink-2">Costul nu se vede din rolul curent.</p>;
  }
  const rows = await db
    .select({ entry: costEntries, supplier: partners })
    .from(costEntries)
    .leftJoin(partners, eq(costEntries.supplierId, partners.id))
    .where(eq(costEntries.workUnitId, id))
    .orderBy(desc(costEntries.effectDate))
    .limit(200);

  const total = rows.reduce((a, r) => a + fromDb(r.entry.value), 0);

  return (
    <Sheet>
      <Table>
        <THead>
          <TR>
            <TH>Data</TH>
            <TH>Document</TH>
            <TH>Tip</TH>
            <TH>Stadiu</TH>
            <TH numeric>Cantitate</TH>
            <TH numeric>Valoare</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map(({ entry, supplier }) => (
            <TR key={entry.id}>
              <TD muted className="whitespace-nowrap">
                {entry.effectDate}
              </TD>
              <TD muted>
                {entry.documentType}
                {supplier ? <span className="block text-micro">{supplier.name}</span> : null}
              </TD>
              <TD muted>{COST_LABEL[entry.costType]}</TD>
              <TD>
                <Badge tone={entry.stage === "angajat" ? "warn" : "neutral"}>{entry.stage}</Badge>
              </TD>
              <TD numeric muted>
                {entry.quantity ? `${Number(entry.quantity)} ${entry.unit ?? ""}` : "—"}
              </TD>
              <TD numeric strong>
                {formatShort(fromDb(entry.value))}
              </TD>
            </TR>
          ))}
        </TBody>
        <tfoot>
          <TFootRow>
            <TD colSpan={5}>{rows.length} linii în registru</TD>
            <TD numeric>{formatShort(total)}</TD>
          </TFootRow>
        </tfoot>
      </Table>
    </Sheet>
  );
}

async function SheetsTab({ id }: { id: string }) {
  const [answers, details, hours, journal] = await Promise.all([
    db
      .select()
      .from(inspectionAnswers)
      .where(eq(inspectionAnswers.workUnitId, id))
      .orderBy(asc(inspectionAnswers.createdAt)),
    db.select().from(interventionDetails).where(eq(interventionDetails.workUnitId, id)),
    db
      .select({ sheet: timesheets, user: users })
      .from(timesheets)
      .leftJoin(users, eq(timesheets.userId, users.id))
      .where(eq(timesheets.workUnitId, id))
      .orderBy(desc(timesheets.day)),
    db
      .select({ entry: siteJournalEntries, author: users })
      .from(siteJournalEntries)
      .leftJoin(users, eq(siteJournalEntries.createdBy, users.id))
      .where(eq(siteJournalEntries.workUnitId, id))
      .orderBy(desc(siteJournalEntries.day)),
  ]);

  const totalHours = hours.reduce((a, h) => a + Number(h.sheet.hours), 0);
  const nok = answers.filter((a) => a.ok === false);

  return (
    <div className="space-y-6">
      {answers.length ? (
        <section className="space-y-2">
          <SectionRule right={`${nok.length} puncte NOK din ${answers.length}`}>
            Fișa de inspecție
          </SectionRule>
          <ul className="divide-y divide-rule border-y border-rule">
            {answers.map((a) => (
              <li key={a.id} className="flex items-start gap-3 py-2">
                <span
                  className={`mt-0.5 shrink-0 text-tiny font-semibold ${
                    a.ok === false ? "text-over" : "text-fill"
                  }`}
                >
                  {a.ok === false ? "NOK" : "OK"}
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.8125rem] text-ink">{a.itemText}</span>
                  {a.note ? <span className="block text-tiny text-ink-2">{a.note}</span> : null}
                  {/* Fiecare NOK trebuie să aibă o ieșire, altfel constatarea se pierde. */}
                  {a.ok === false ? (
                    <span className="mt-0.5 block text-micro text-blueprint">
                      Ieșire: {a.outcome ?? "nesetată"}
                      {a.outcomeRequestId ? (
                        <Link href={`/cereri/${a.outcomeRequestId}`} className="ml-1 underline">
                          vezi cererea
                        </Link>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {details.length ? (
        <section className="space-y-2">
          <SectionRule>Fișa de intervenție</SectionRule>
          {details.map((d) => (
            <div key={d.id} className="sheet px-4 py-3">
              <p className="text-[0.8125rem] text-ink">{d.description ?? "—"}</p>
              <p className="mt-1 text-tiny text-ink-2">
                {Number(d.hoursDeclared)} ore declarate · {d.peopleCount} oameni
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {hours.length ? (
        <section className="space-y-2">
          <SectionRule right={`${totalHours.toFixed(1)} ore`}>Pontaj</SectionRule>
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Zi</TH>
                  <TH>Persoană</TH>
                  <TH>Calificare</TH>
                  <TH numeric>Ore</TH>
                </TR>
              </THead>
              <TBody>
                {hours.map(({ sheet, user }) => (
                  <TR key={sheet.id}>
                    <TD muted>{sheet.day}</TD>
                    <TD>{user?.name ?? "—"}</TD>
                    <TD muted>{sheet.qualification ?? "—"}</TD>
                    <TD numeric strong>
                      {Number(sheet.hours)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Sheet>
        </section>
      ) : null}

      {journal.length ? (
        <section className="space-y-2">
          <SectionRule>Jurnal de șantier</SectionRule>
          <ul className="divide-y divide-rule border-y border-rule">
            {journal.map(({ entry, author }) => (
              <li key={entry.id} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-tiny font-medium text-ink">{entry.day}</span>
                  <span className="text-micro text-ink-3">
                    {author?.name ?? "—"}
                    {entry.weather ? ` · ${entry.weather}` : ""}
                    {entry.peopleCount ? ` · ${entry.peopleCount} oameni` : ""}
                  </span>
                </div>
                <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink">{entry.text}</p>
                {entry.blocker ? (
                  <p className="mt-1 border-l-2 border-warn bg-warn-soft px-2 py-1 text-tiny text-warn">
                    Blocaj: {entry.blocker}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!answers.length && !details.length && !hours.length && !journal.length ? (
        <p className="text-tiny text-ink-2">
          Nicio fișă încă. Fișele se completează din interfața de teren și urcă aici.
        </p>
      ) : null}
    </div>
  );
}

async function StagesTab({ id, showPrices }: { id: string; showPrices: boolean }) {
  const stages = await db
    .select()
    .from(workUnitStages)
    .where(eq(workUnitStages.workUnitId, id))
    .orderBy(asc(workUnitStages.position));

  if (stages.length === 0) {
    return (
      <p className="text-tiny text-ink-2">
        Fără etape. Etapele există doar la lucrări — pe ele se construiește graficul de execuție.
      </p>
    );
  }

  /* Tabul răspunde la „ce etape are lucrarea”. La „cum merge execuția” răspunde
     ecranul 22, care are graficul, jurnalul, necesarul pe etape și închiderea. */

  const stageCosts = await db
    .select({ stageId: costEntries.stageId, total: raw<string>`sum(${costEntries.value})` })
    .from(costEntries)
    .where(eq(costEntries.workUnitId, id))
    .groupBy(costEntries.stageId);
  const costBy = new Map(stageCosts.map((c) => [c.stageId, fromDb(c.total)]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-tiny text-ink-2">
          Etapele sunt scheletul lucrării. Graficul de execuție, jurnalul de șantier și
          închiderea stau pe ecranul de execuție.
        </p>
        <Link href={`/lucrari/${id}/executie`} className="shrink-0">
          <Button size="sm" variant="primary">
            Grafic de execuție
          </Button>
        </Link>
      </div>

      <Sheet>
      <Table>
        <THead>
          <TR>
            <TH>#</TH>
            <TH>Etapă</TH>
            <TH>Perioadă</TH>
            <TH numeric>% din lucrare</TH>
            {showPrices ? <TH numeric>Buget</TH> : null}
            {showPrices ? <TH numeric>Consumat</TH> : null}
          </TR>
        </THead>
        <TBody>
          {stages.map((stage) => {
            const budget = fromDb(stage.materialBudget) + fromDb(stage.laborBudget);
            const spent = costBy.get(stage.id) ?? 0;
            const over = budget > 0 && spent > budget * 0.8;
            return (
              <TR key={stage.id}>
                <TD muted>{stage.position}</TD>
                <TD>{stage.name}</TD>
                <TD muted>
                  {stage.startDate ?? "—"} → {stage.endDate ?? "—"}
                </TD>
                <TD numeric muted>
                  {Number(stage.percentOfWork)}%
                </TD>
                {showPrices ? <TD numeric>{formatShort(budget)}</TD> : null}
                {showPrices ? (
                  <TD numeric strong className={over ? "text-warn" : undefined}>
                    {formatShort(spent)}
                  </TD>
                ) : null}
              </TR>
            );
          })}
        </TBody>
      </Table>
      </Sheet>
    </div>
  );
}

async function FilesTab({ id }: { id: string }) {
  const nodes = await db
    .select()
    .from(fileNodes)
    .where(and(eq(fileNodes.workUnitId, id), raw`${fileNodes.deletedAt} is null`))
    .orderBy(asc(fileNodes.name));

  return (
    <div className="space-y-3">
      <p className="max-w-prose text-tiny text-ink-2">
        Fiecare unitate de lucru primește automat un folder la creare. Arborele stă în Postgres, ca
        listă de adiacență — mutarea unui folder e un singur UPDATE, indiferent câte fișiere are.
      </p>
      {nodes.length === 0 ? (
        <p className="text-tiny text-ink-2">Folderul e gol.</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {nodes.map((node) => (
            <li key={node.id} className="flex items-center gap-2 py-2 text-[0.8125rem] text-ink">
              <span className="text-ink-3">{node.kind === "folder" ? "▸" : "·"}</span>
              {node.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
