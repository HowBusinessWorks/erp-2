import Link from "next/link";
import { asc, eq, inArray, sql as raw } from "drizzle-orm";

import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { Money } from "@/components/ui/gauge";
import { db } from "@/lib/db";
import {
  objectives,
  packageLines,
  packages,
  partners,
  situatiiLucrari,
  workUnits,
} from "@/lib/db/schema";
import { PACKAGE_STATUS_LABEL } from "@/lib/deviz";
import { fromDb } from "@/lib/money";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

import { PackageForm } from "@/components/domain/DevizForms";
import { openWorkUnitOptions, partnerOptions } from "@/lib/pickers";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function PachetePage({
  searchParams,
}: {
  searchParams: Promise<{ specialitate?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const showPrices = canSeePrices(session.role);
  const canManage = can(session.role, "pachete.gestioneaza");
  const [unitOpts, subOpts] = canManage
    ? await Promise.all([openWorkUnitOptions(), partnerOptions("subcontractant")])
    : [[], []];

  const rows = await db
    .select({ pkg: packages, subcontractor: partners, unit: workUnits, objective: objectives })
    .from(packages)
    .leftJoin(partners, eq(packages.subcontractorId, partners.id))
    .leftJoin(workUnits, eq(packages.workUnitId, workUnits.id))
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(sp.specialitate ? eq(packages.specialty, sp.specialitate) : undefined)
    .orderBy(asc(packages.specialty), asc(packages.code));

  const ids = rows.map((r) => r.pkg.id);
  const [lineSums, slCounts] = await Promise.all([
    ids.length
      ? db
          .select({
            packageId: packageLines.packageId,
            n: raw<string>`count(*)`,
            value: raw<string>`sum(${packageLines.agreedPrice} * ${packageLines.contractedQty})`,
          })
          .from(packageLines)
          .where(inArray(packageLines.packageId, ids))
          .groupBy(packageLines.packageId)
      : [],
    ids.length
      ? db
          .select({ packageId: situatiiLucrari.packageId, n: raw<string>`count(*)` })
          .from(situatiiLucrari)
          .where(inArray(situatiiLucrari.packageId, ids))
          .groupBy(situatiiLucrari.packageId)
      : [],
  ]);

  const linesBy = new Map(lineSums.map((s) => [s.packageId, s]));
  const slBy = new Map(slCounts.map((s) => [s.packageId, Number(s.n)]));

  const specialties = [...new Set(rows.map((r) => r.pkg.specialty).filter(Boolean))] as string[];
  const total = rows.reduce((a, r) => a + fromDb(linesBy.get(r.pkg.id)?.value ?? "0"), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comercial"
        title="Pachete de subcontractare"
        meta="Un pachet iese din devizul intern, pe specialitate. Materialele NU intră în pachet — subcontractantul dă manoperă, materialul îl dă firma. Regula e impusă de sistem, nu lăsată la bunăvoința celui care compune pachetul."
        actions={
          canManage ? <PackageForm workUnits={unitOpts} subcontractors={subOpts} /> : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip href="/pachete" active={!sp.specialitate} label="Tot" />
        {specialties.map((s) => (
          <Chip
            key={s}
            href={sp.specialitate === s ? "/pachete" : `/pachete?specialitate=${s}`}
            active={sp.specialitate === s}
            label={s}
          />
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Niciun pachet"
          hint="Pachetul se compune din articolele de manoperă ale devizului intern, grupate pe specialitate."
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Cod</TH>
                <TH>Pachet</TH>
                <TH>Specialitate</TH>
                <TH>Subcontractant</TH>
                <TH>Obiectiv</TH>
                <TH numeric>Poziții</TH>
                <TH numeric>SL emise</TH>
                <TH numeric>Garanție</TH>
                <TH>Stare</TH>
                {showPrices ? <TH numeric>Valoare</TH> : null}
              </TR>
            </THead>
            <TBody>
              {rows.map(({ pkg, subcontractor, objective }) => (
                <TR key={pkg.id}>
                  <TD>
                    <Link href={`/pachete/${pkg.id}`} className="font-medium hover:text-blueprint">
                      {pkg.code}
                    </Link>
                  </TD>
                  <TD className="max-w-64">{pkg.name}</TD>
                  <TD muted>{pkg.specialty ?? "—"}</TD>
                  <TD muted>{subcontractor?.name ?? "regie proprie"}</TD>
                  <TD muted className="max-w-40 truncate">
                    {objective?.name ?? "—"}
                  </TD>
                  <TD numeric>{Number(linesBy.get(pkg.id)?.n ?? 0)}</TD>
                  <TD numeric muted>{slBy.get(pkg.id) ?? 0}</TD>
                  <TD numeric muted>{Number(pkg.retentionPercent ?? 0)}%</TD>
                  <TD>
                    <Badge tone={pkg.status === "acceptat" ? "fill" : "neutral"}>
                      {PACKAGE_STATUS_LABEL[pkg.status] ?? pkg.status}
                    </Badge>
                  </TD>
                  {showPrices ? (
                    <TD numeric strong>
                      <Money value={fromDb(linesBy.get(pkg.id)?.value ?? "0")} unit={null} />
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
            {showPrices ? (
              <tfoot>
                <TFootRow>
                  <TD colSpan={9}>{rows.length} pachete</TD>
                  <TD numeric>
                    <Money value={total} unit={null} />
                  </TD>
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
