import Link from "next/link";
import { eq, sql as raw } from "drizzle-orm";

import { Badge, PageHeader, SectionRule } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import { contractObjectives, contracts, costEntries, objectives, workUnits } from "@/lib/db/schema";
import { formatShort, fromDb } from "@/lib/money";
import { can, canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

import { ObjectiveForm } from "@/components/domain/ObjectiveForm";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  statie: "Stație",
  rezervor: "Rezervor",
  gura_canal: "Gură de canal",
  cladire_administrativa: "Clădire adm.",
  camin: "Cămin",
  bazin: "Bazin",
  filtru: "Filtrare",
};

export default async function ObiectivePage({
  searchParams,
}: {
  searchParams: Promise<{ tip?: string; contract?: string }>;
}) {
  const session = await requireSession();
  const showPrices = canSeePrices(session.role);
  const canEdit = can(session.role, "contracte.editeaza");
  const { tip, contract: contractFilter } = await searchParams;

  const all = await db.select().from(objectives).orderBy(objectives.code);

  // câte contracte, câtă activitate și cât cost — într-o singură trecere per agregat
  const [linkAgg, unitAgg, costAgg, contractRows] = await Promise.all([
    db
      .select({
        objectiveId: contractObjectives.objectiveId,
        contractId: contractObjectives.contractId,
      })
      .from(contractObjectives),
    db
      .select({ objectiveId: workUnits.objectiveId, n: raw<string>`count(*)` })
      .from(workUnits)
      .groupBy(workUnits.objectiveId),
    db
      .select({
        objectiveId: costEntries.objectiveId,
        total: raw<string>`sum(${costEntries.value})`,
      })
      .from(costEntries)
      .where(raw`${costEntries.stage} <> 'angajat'`)
      .groupBy(costEntries.objectiveId),
    db.select().from(contracts),
  ]);

  const contractsById = new Map(contractRows.map((c) => [c.id, c]));
  const contractsOf = new Map<string, string[]>();
  for (const l of linkAgg) {
    const arr = contractsOf.get(l.objectiveId) ?? [];
    arr.push(l.contractId);
    contractsOf.set(l.objectiveId, arr);
  }
  const unitsOf = new Map(unitAgg.map((u) => [u.objectiveId!, Number(u.n)]));
  const costOf = new Map(costAgg.map((c) => [c.objectiveId!, fromDb(c.total)]));

  const filtered = all.filter((o) => {
    if (tip && o.kind !== tip) return false;
    if (contractFilter && !(contractsOf.get(o.id) ?? []).includes(contractFilter)) return false;
    return true;
  });

  const kinds = [...new Set(all.map((o) => o.kind))];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Conducere"
        title="Obiective"
        meta={`${filtered.length} din ${all.length} · un obiectiv poate fi pe mai multe contracte, în timp sau simultan`}
        actions={canEdit ? <ObjectiveForm /> : undefined}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip href="/obiective" active={!tip && !contractFilter} label="Toate" />
        {kinds.map((k) => (
          <FilterChip
            key={k}
            href={`/obiective?tip=${k}`}
            active={tip === k}
            label={KIND_LABEL[k] ?? k}
          />
        ))}
        <span aria-hidden className="mx-1 h-4 w-px bg-rule" />
        {contractRows
          .filter((c) => c.kind === "mentenanta")
          .map((c) => (
            <FilterChip
              key={c.id}
              href={`/obiective?contract=${c.id}`}
              active={contractFilter === c.id}
              label={c.code}
            />
          ))}
      </div>

      <section>
        <SectionRule
          right={
            showPrices
              ? `cost total ${formatShort(filtered.reduce((a, o) => a + (costOf.get(o.id) ?? 0), 0))} lei`
              : undefined
          }
        >
          Registru de obiective
        </SectionRule>
        <Sheet className="mt-2.5">
          <Table>
            <THead>
              <TR>
                <TH>Cod</TH>
                <TH>Denumire</TH>
                <TH>Tip</TH>
                <TH>Adresă</TH>
                <TH>Contracte</TH>
                <TH numeric>Activitate</TH>
                <TH numeric>Cost total</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((o) => {
                const codes = (contractsOf.get(o.id) ?? [])
                  .map((cid) => contractsById.get(cid)?.code)
                  .filter(Boolean);
                return (
                  <TR key={o.id}>
                    <TD strong>
                      <Link href={`/obiective/${o.id}`} className="hover:text-blueprint">
                        {o.code}
                      </Link>
                    </TD>
                    <TD>{o.name}</TD>
                    <TD muted>{KIND_LABEL[o.kind] ?? o.kind}</TD>
                    <TD muted className="max-w-64 truncate">
                      {o.address ?? "—"}
                    </TD>
                    <TD>
                      {codes.length === 0 ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {codes.map((c) => (
                            <Badge key={c}>{c}</Badge>
                          ))}
                        </span>
                      )}
                    </TD>
                    <TD numeric muted>
                      {unitsOf.get(o.id) ?? 0}
                    </TD>
                    <TD numeric>
                      {showPrices ? formatShort(costOf.get(o.id) ?? 0) : "····"}
                    </TD>
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

function FilterChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
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
