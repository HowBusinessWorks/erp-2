import Link from "next/link";
import { and, desc, eq, inArray, sql as raw, type SQL } from "drizzle-orm";

import { Badge, PageHeader } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import {
  contractComponents,
  contracts,
  costEntries,
  fundingAllocations,
  objectives,
  partners,
  workUnits,
} from "@/lib/db/schema";
import { formatShort, fromDb, ratio } from "@/lib/money";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

import { WorkUnitForm } from "@/components/domain/OperabilityForms";
import {
  componentOptions,
  contractOptions,
  firmOptions,
  objectiveOptions,
  partnerOptions,
  userOptions,
} from "@/lib/pickers";
import { can } from "@/lib/permissions";
import { KIND_LABEL, STATUS_LABEL } from "@/lib/work-units";

export const dynamic = "force-dynamic";

const LIMIT = 150;

const STATUS_TONE: Record<string, "neutral" | "blueprint" | "warn" | "fill" | "over"> = {
  propusa: "neutral",
  planificata: "blueprint",
  in_lucru: "warn",
  finalizata: "fill",
  anulata: "neutral",
};

export default async function LucrariPage({
  searchParams,
}: {
  searchParams: Promise<{ tip?: string; stare?: string; contract?: string; executant?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const showPrices = canSeePrices(session.role);
  const canCreate = can(session.role, "contracte.editeaza");
  const [firmOpts, objectiveOpts, userOpts, contractOpts, componentOpts, subOpts] = canCreate
    ? await Promise.all([
        firmOptions(),
        objectiveOptions(),
        userOptions(),
        contractOptions(),
        componentOptions(),
        partnerOptions("subcontractant"),
      ])
    : [[], [], [], [], [], []];

  const filters: SQL[] = [];
  if (sp.tip) filters.push(raw`${workUnits.kind} = ${sp.tip}`);
  if (sp.stare) filters.push(raw`${workUnits.status} = ${sp.stare}`);
  if (sp.executant) filters.push(raw`${workUnits.executant} = ${sp.executant}`);
  if (sp.contract) filters.push(eq(fundingAllocations.contractId, sp.contract));
  const where = filters.length ? and(...filters) : undefined;

  const [rows, byKind, contractRows] = await Promise.all([
    db
      .select({
        unit: workUnits,
        objective: objectives,
        contract: contracts,
        component: contractComponents,
        subcontractor: partners,
        allocated: fundingAllocations.allocatedValue,
      })
      .from(workUnits)
      .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
      // finanțarea e o legătură: alocarea ACTIVĂ spune pe ce contract stă unitatea
      .leftJoin(
        fundingAllocations,
        and(
          eq(fundingAllocations.workUnitId, workUnits.id),
          eq(fundingAllocations.status, "activ"),
        ),
      )
      .leftJoin(contracts, eq(fundingAllocations.contractId, contracts.id))
      .leftJoin(contractComponents, eq(fundingAllocations.componentId, contractComponents.id))
      .leftJoin(partners, eq(workUnits.subcontractorId, partners.id))
      .where(where)
      .orderBy(desc(workUnits.startDate))
      .limit(LIMIT),
    db
      .select({ kind: workUnits.kind, n: raw<string>`count(*)` })
      .from(workUnits)
      .groupBy(workUnits.kind),
    db.select().from(contracts).where(eq(contracts.kind, "mentenanta")),
  ]);

  // Costul real, o singură agregare pentru toate unitățile de pe ecran — nu una per rând.
  const unitIds = rows.map((r) => r.unit.id);
  const costRows = unitIds.length
    ? await db
        .select({ workUnitId: costEntries.workUnitId, total: raw<string>`sum(${costEntries.value})` })
        .from(costEntries)
        .where(
          and(inArray(costEntries.workUnitId, unitIds), raw`${costEntries.stage} <> 'angajat'`),
        )
        .groupBy(costEntries.workUnitId)
    : [];
  const costBy = new Map(costRows.map((c) => [c.workUnitId!, fromDb(c.total)]));

  const qs = (patch: Record<string, string | undefined>) => {
    const merged = { ...sp, ...patch };
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) s.set(k, v);
    const q = s.toString();
    return q ? `/lucrari?${q}` : "/lucrari";
  };

  const totalAllocated = rows.reduce((a, r) => a + fromDb(r.allocated ?? "0"), 0);
  const totalCost = rows.reduce((a, r) => a + (costBy.get(r.unit.id) ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operațional"
        title="Unități de lucru"
        meta="Inspecție, intervenție și lucrare sunt același obiect cu etichete diferite. De asta promovarea unei intervenții în lucrare păstrează pozele, orele și consumurile."
        actions={
          canCreate ? (
            <WorkUnitForm
              firms={firmOpts}
              objectives={objectiveOpts}
              users={userOpts}
              contracts={contractOpts}
              components={componentOpts}
              subcontractors={subOpts}
            />
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip href={qs({ tip: undefined, stare: undefined, executant: undefined, contract: undefined })} active={!sp.tip && !sp.stare && !sp.executant && !sp.contract} label="Tot" />
        <span aria-hidden className="mx-1 h-4 w-px bg-rule" />
        {byKind.map((k) => (
          <Chip
            key={k.kind}
            href={qs({ tip: sp.tip === k.kind ? undefined : k.kind })}
            active={sp.tip === k.kind}
            label={`${KIND_LABEL[k.kind as keyof typeof KIND_LABEL]} · ${k.n}`}
          />
        ))}
        <span aria-hidden className="mx-1 h-4 w-px bg-rule" />
        {["planificata", "in_lucru", "finalizata"].map((status) => (
          <Chip
            key={status}
            href={qs({ stare: sp.stare === status ? undefined : status })}
            active={sp.stare === status}
            label={STATUS_LABEL[status]}
          />
        ))}
        <Chip
          href={qs({ executant: sp.executant === "subcontractant" ? undefined : "subcontractant" })}
          active={sp.executant === "subcontractant"}
          label="Subcontractat"
        />
        <span aria-hidden className="mx-1 h-4 w-px bg-rule" />
        {contractRows.map((c) => (
          <Chip
            key={c.id}
            href={qs({ contract: sp.contract === c.id ? undefined : c.id })}
            active={sp.contract === c.id}
            label={c.code}
          />
        ))}
      </div>

      <Sheet>
        <Table>
          <THead>
            <TR>
              <TH>Cod</TH>
              <TH>Tip</TH>
              <TH>Titlu</TH>
              <TH>Obiectiv</TH>
              <TH>Finanțare</TH>
              <TH>Executant</TH>
              <TH>Stare</TH>
              {showPrices ? <TH numeric>Alocat</TH> : null}
              {showPrices ? <TH numeric>Cost</TH> : null}
              {showPrices ? <TH numeric>Marjă</TH> : null}
            </TR>
          </THead>
          <TBody>
            {rows.map(({ unit, objective, contract, component, subcontractor, allocated }) => {
              const alloc = fromDb(allocated ?? "0");
              const cost = costBy.get(unit.id) ?? 0;
              const margin = alloc === 0 ? null : ratio(alloc - cost, alloc);
              return (
                <TR key={unit.id}>
                  <TD>
                    <Link href={`/lucrari/${unit.id}`} className="font-medium hover:text-blueprint">
                      {unit.code}
                    </Link>
                  </TD>
                  <TD muted>
                    {KIND_LABEL[unit.kind as keyof typeof KIND_LABEL]}
                    {unit.promotedFrom ? (
                      <span className="block text-micro text-blueprint" title="Promovată din intervenție">
                        promovată
                      </span>
                    ) : null}
                  </TD>
                  <TD className="max-w-72">
                    <Link href={`/lucrari/${unit.id}`} className="hover:text-blueprint">
                      {unit.title}
                    </Link>
                  </TD>
                  <TD muted className="max-w-40 truncate">
                    {objective?.name ?? "—"}
                  </TD>
                  <TD muted>
                    {contract ? `${contract.code} · ${component?.name ?? "—"}` : "nefinanțată"}
                  </TD>
                  <TD muted>{subcontractor?.name ?? "propriu"}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[unit.status]}>{STATUS_LABEL[unit.status]}</Badge>
                  </TD>
                  {showPrices ? <TD numeric>{formatShort(alloc)}</TD> : null}
                  {showPrices ? <TD numeric>{formatShort(cost)}</TD> : null}
                  {showPrices ? (
                    <TD numeric strong className={margin !== null && margin < 0 ? "text-over" : undefined}>
                      {margin === null ? "—" : `${margin.toFixed(1)}%`}
                    </TD>
                  ) : null}
                </TR>
              );
            })}
          </TBody>
          {showPrices ? (
            <tfoot>
              <TFootRow>
                <TD colSpan={7}>{rows.length} unități</TD>
                <TD numeric>{formatShort(totalAllocated)}</TD>
                <TD numeric>{formatShort(totalCost)}</TD>
                <TD numeric>
                  {totalAllocated === 0
                    ? "—"
                    : `${ratio(totalAllocated - totalCost, totalAllocated).toFixed(1)}%`}
                </TD>
              </TFootRow>
            </tfoot>
          ) : null}
        </Table>
      </Sheet>
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
