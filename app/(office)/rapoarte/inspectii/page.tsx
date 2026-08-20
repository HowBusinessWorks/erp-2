import Link from "next/link";
import { and, eq, sql as raw } from "drizzle-orm";

import { MonthNav } from "@/components/domain/MonthNav";
import { Gauge } from "@/components/ui/gauge";
import { Badge, PageHeader, SectionRule } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import { contractObjectives, contracts, objectives, workUnits } from "@/lib/db/schema";
import { labelPeriod, monthRange, periodFromParams } from "@/lib/period";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Ecranul 36 — acoperirea inspecțiilor (§22.2).
 *
 * Măsoară fără să hărțuiască: nu „câte inspecții a făcut Gigi", ci câte obiective din
 * cele contractate au fost atinse luna asta. Un obiectiv neinspectat de trei luni e o
 * problemă de contract, nu de om — și e, în plus, Delta neumplută, pentru că
 * inspecțiile sunt sursa constatărilor.
 */
export default async function AcoperireInspectiiPage({
  searchParams,
}: {
  searchParams: Promise<{ an?: string; luna?: string; contract?: string }>;
}) {
  await requireSession();
  const sp = await searchParams;
  const period = periodFromParams(sp);
  const { from, to } = monthRange(period);

  const contractRows = await db.select().from(contracts).where(eq(contracts.kind, "mentenanta"));
  const contractId = sp.contract ?? contractRows[0]?.id;
  if (!contractId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Evidență" title="Acoperirea inspecțiilor" />
        <p className="text-tiny text-ink-2">Niciun contract de mentenanță.</p>
      </div>
    );
  }

  const [linked, done] = await Promise.all([
    db
      .select({ link: contractObjectives, objective: objectives })
      .from(contractObjectives)
      .innerJoin(objectives, eq(contractObjectives.objectiveId, objectives.id))
      .where(
        and(
          eq(contractObjectives.contractId, contractId),
          raw`${contractObjectives.fromDate} <= ${to}`,
          raw`(${contractObjectives.toDate} is null or ${contractObjectives.toDate} >= ${from})`,
        ),
      ),
    // inspecțiile lunii, o singură agregare
    db
      .select({
        objectiveId: workUnits.objectiveId,
        n: raw<string>`count(*)`,
        last: raw<string>`max(${workUnits.endDate})`,
      })
      .from(workUnits)
      .where(
        and(
          eq(workUnits.kind, "inspectie"),
          raw`coalesce(${workUnits.endDate}, ${workUnits.startDate}) between ${from} and ${to}`,
        ),
      )
      .groupBy(workUnits.objectiveId),
    ]);

  // ultima inspecție, oricând, ca să se vadă cine e uitat de luni de zile
  const everRows = await db
    .select({
      objectiveId: workUnits.objectiveId,
      last: raw<string>`max(coalesce(${workUnits.endDate}, ${workUnits.startDate}))`,
    })
    .from(workUnits)
    .where(eq(workUnits.kind, "inspectie"))
    .groupBy(workUnits.objectiveId);

  const doneBy = new Map(done.map((d) => [d.objectiveId, Number(d.n)]));
  const lastBy = new Map(everRows.map((d) => [d.objectiveId, d.last]));

  const covered = linked.filter((l) => doneBy.has(l.objective.id)).length;
  const percent = linked.length === 0 ? 0 : (covered / linked.length) * 100;
  const monthsSince = (day: string | null) => {
    if (!day) return null;
    const d = new Date(day);
    return Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30));
  };

  const stale = linked.filter((l) => {
    const months = monthsSince(lastBy.get(l.objective.id) ?? null);
    return months === null || months >= 3;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Evidență"
        title="Acoperirea inspecțiilor"
        meta="Câte obiective contractate au fost atinse luna asta. Măsoară procesul, nu oamenii."
        actions={
          <MonthNav
            period={period}
            basePath="/rapoarte/inspectii"
            extraParams={{ contract: contractId }}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {contractRows.map((c) => (
          <Link
            key={c.id}
            href={`/rapoarte/inspectii?an=${period.year}&luna=${period.month}&contract=${c.id}`}
            className={`rounded-[3px] border px-2 py-0.5 text-tiny transition-colors ${
              c.id === contractId
                ? "border-blueprint bg-blueprint text-white"
                : "border-rule-strong bg-sheet text-ink-2 hover:bg-sunk"
            }`}
          >
            {c.code}
          </Link>
        ))}
      </div>

      <section className="sheet px-4 py-3.5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Acoperire în {labelPeriod(period)}</div>
            <div className="tabular mt-1 text-2xl font-semibold text-ink">
              {covered}
              <span className="ml-1.5 text-base font-normal text-ink-3">
                din {linked.length} obiective
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="eyebrow">Neatinse de 3+ luni</div>
            <div
              className={`tabular mt-1 text-xl font-semibold ${stale.length > 0 ? "text-over" : "text-ink"}`}
            >
              {stale.length}
            </div>
          </div>
        </div>
        {/* Gauge care se umple: acoperirea e o țintă de atins, nu un plafon de evitat. */}
        <Gauge direction="umple" percent={percent} className="mt-3" />
        <p className="mt-2 text-micro text-ink-3">
          {percent.toFixed(0)}% acoperire. Obiectivele neinspectate nu produc constatări, iar fără
          constatări Delta rămâne neumplută — cele două ecrane se citesc împreună.
        </p>
      </section>

      <section className="space-y-3">
        <SectionRule right={`${linked.length} obiective contractate`}>Obiective</SectionRule>
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Cod</TH>
                <TH>Obiectiv</TH>
                <TH>Tip</TH>
                <TH numeric>Frecvență</TH>
                <TH numeric>Luna asta</TH>
                <TH>Ultima inspecție</TH>
                <TH>Stare</TH>
              </TR>
            </THead>
            <TBody>
              {linked.map(({ link, objective }) => {
                const thisMonth = doneBy.get(objective.id) ?? 0;
                const last = lastBy.get(objective.id) ?? null;
                const months = monthsSince(last);
                const late = months === null || months >= 3;
                return (
                  <TR key={objective.id}>
                    <TD muted>{objective.code}</TD>
                    <TD>
                      <Link href={`/obiective/${objective.id}`} className="hover:text-blueprint">
                        {objective.name}
                      </Link>
                    </TD>
                    <TD muted>{objective.kind}</TD>
                    <TD numeric muted>
                      {link.inspectionFrequencyMonths
                        ? `la ${link.inspectionFrequencyMonths} luni`
                        : "—"}
                    </TD>
                    <TD numeric strong>
                      {thisMonth || "—"}
                    </TD>
                    <TD muted>
                      {last ?? "niciodată"}
                      {months !== null ? (
                        <span className="block text-micro text-ink-3">acum {months} luni</span>
                      ) : null}
                    </TD>
                    <TD>
                      {thisMonth > 0 ? (
                        <Badge tone="fill">acoperit</Badge>
                      ) : late ? (
                        <Badge tone="over">restant</Badge>
                      ) : (
                        <Badge tone="neutral">neatins luna asta</Badge>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
            <tfoot>
              <TFootRow>
                <TD colSpan={4}>Acoperire</TD>
                <TD numeric>{covered}</TD>
                <TD colSpan={2}>{percent.toFixed(0)}%</TD>
              </TFootRow>
            </tfoot>
          </Table>
        </Sheet>
      </section>
    </div>
  );
}
