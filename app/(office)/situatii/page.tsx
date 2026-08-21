import Link from "next/link";
import { desc, eq, inArray, sql as raw } from "drizzle-orm";

import { Badge, Button, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { Money } from "@/components/ui/gauge";
import { db } from "@/lib/db";
import { objectives, packages, partners, situatiiLucrari, slLines, workUnits } from "@/lib/db/schema";
import { SL_STATUS_LABEL, SL_STATUS_TONE, checkCumulative } from "@/lib/deviz";
import { fromDb } from "@/lib/money";
import { can, canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const MONTHS = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

export default async function SituatiiPage({
  searchParams,
}: {
  searchParams: Promise<{ stare?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const showPrices = canSeePrices(session.role);
  // Situația manuală se declară de pe pachet, unde se știu pozițiile și cumulatele (§9.6).
  const canDeclare = can(session.role, "sl.verifica") || can(session.role, "sl.aproba");

  const rows = await db
    .select({
      sl: situatiiLucrari,
      pkg: packages,
      subcontractor: partners,
      unit: workUnits,
      objective: objectives,
    })
    .from(situatiiLucrari)
    .leftJoin(packages, eq(situatiiLucrari.packageId, packages.id))
    .leftJoin(partners, eq(packages.subcontractorId, partners.id))
    .leftJoin(workUnits, eq(packages.workUnitId, workUnits.id))
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(sp.stare ? raw`${situatiiLucrari.status} = ${sp.stare}` : undefined)
    .orderBy(desc(situatiiLucrari.year), desc(situatiiLucrari.month))
    .limit(80);

  const ids = rows.map((r) => r.sl.id);
  const lines = ids.length
    ? await db.select().from(slLines).where(inArray(slLines.situatieId, ids))
    : [];

  const statsBy = new Map<string, { value: number; suspect: number; blocked: number }>();
  for (const l of lines) {
    const s = statsBy.get(l.situatieId) ?? { value: 0, suspect: 0, blocked: 0 };
    s.value += fromDb(l.value);
    if (l.verdict === "suspect") s.suspect += 1;
    if (checkCumulative(l).blocked) s.blocked += 1;
    statsBy.set(l.situatieId, s);
  }

  const total = rows.reduce((a, r) => a + (statsBy.get(r.sl.id)?.value ?? 0), 0);
  const withBlocks = rows.filter((r) => (statsBy.get(r.sl.id)?.blocked ?? 0) > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comercial"
        title="Situații de lucrări"
        meta="Cele cinci cumulate, una lângă alta. Cumulatul aprobat nu poate depăși cantitatea contractată — blocajul e la introducere, nu la factură, ca discuția să fie cu omul care tocmai a scris cifra."
        actions={
          canDeclare ? (
            <Link href="/pachete">
              <Button size="sm" variant="primary">
                ＋ Situație — alege pachetul
              </Button>
            </Link>
          ) : undefined
        }
      />

      {withBlocks > 0 ? (
        <p className="border-l-2 border-over bg-over-soft px-4 py-2.5 text-tiny text-over">
          <span className="font-medium">
            {withBlocks} {withBlocks === 1 ? "situație depășește" : "situații depășesc"} cantitatea
            contractată.
          </span>{" "}
          Nu se pot aproba. Ieșirea corectă e o suplimentare, nu o aprobare cu ochii închiși.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip href="/situatii" active={!sp.stare} label="Tot" />
        {Object.entries(SL_STATUS_LABEL).map(([key, label]) => (
          <Chip
            key={key}
            href={sp.stare === key ? "/situatii" : `/situatii?stare=${key}`}
            active={sp.stare === key}
            label={label}
          />
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nicio situație"
          hint="Situațiile intră prin portalul de subcontractanți, care e aplicație separată. Aici se verifică și se aprobă."
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Cod</TH>
                <TH>Luna</TH>
                <TH>Pachet</TH>
                <TH>Subcontractant</TH>
                <TH>Obiectiv</TH>
                <TH>Stare</TH>
                <TH>Verificare</TH>
                {showPrices ? <TH numeric>Valoare</TH> : null}
                {showPrices ? <TH numeric>Garanție</TH> : null}
              </TR>
            </THead>
            <TBody>
              {rows.map(({ sl, pkg, subcontractor, objective }) => {
                const stats = statsBy.get(sl.id);
                return (
                  <TR key={sl.id}>
                    <TD>
                      <Link href={`/situatii/${sl.id}`} className="font-medium hover:text-blueprint">
                        {sl.code ?? "—"}
                      </Link>
                    </TD>
                    <TD muted>
                      {MONTHS[sl.month - 1]} {sl.year}
                    </TD>
                    <TD muted className="max-w-48 truncate">
                      {pkg ? (
                        <Link href={`/pachete/${pkg.id}`} className="hover:text-blueprint">
                          {pkg.code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD muted>{subcontractor?.name ?? "—"}</TD>
                    <TD muted className="max-w-40 truncate">
                      {objective?.name ?? "—"}
                    </TD>
                    <TD>
                      <Badge tone={SL_STATUS_TONE[sl.status]}>{SL_STATUS_LABEL[sl.status]}</Badge>
                    </TD>
                    <TD>
                      {stats?.blocked ? (
                        <span className="text-tiny font-medium text-over">
                          {stats.blocked} peste contractat
                        </span>
                      ) : stats?.suspect ? (
                        <span className="text-tiny text-over">{stats.suspect} suspecte</span>
                      ) : (
                        <span className="text-tiny text-fill">curată</span>
                      )}
                    </TD>
                    {showPrices ? (
                      <TD numeric strong>
                        <Money value={stats?.value ?? 0} unit={null} />
                      </TD>
                    ) : null}
                    {showPrices ? (
                      <TD numeric muted>
                        <Money value={fromDb(sl.retentionValue)} unit={null} />
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </TBody>
            {showPrices ? (
              <tfoot>
                <TFootRow>
                  <TD colSpan={7}>{rows.length} situații</TD>
                  <TD numeric>
                    <Money value={total} unit={null} />
                  </TD>
                  <TD />
                </TFootRow>
              </tfoot>
            ) : null}
          </Table>
        </Sheet>
      )}
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
