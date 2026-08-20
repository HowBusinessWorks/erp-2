import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { approveSituatie } from "@/app/actions/deviz";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { DataPair } from "@/components/ui/tabs";
import { Money } from "@/components/ui/gauge";
import { db } from "@/lib/db";
import {
  objectives,
  packages,
  partners,
  situatiiLucrari,
  slLines,
  users,
  workUnits,
} from "@/lib/db/schema";
import {
  SL_STATUS_LABEL,
  SL_STATUS_TONE,
  VERDICT_LABEL,
  VERDICT_TONE,
  checkCumulative,
} from "@/lib/deviz";
import { formatDay } from "@/lib/equipment";
import { fromDb } from "@/lib/money";
import { can, canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { VerdictForm } from "./VerdictForm";

export const dynamic = "force-dynamic";

const MONTHS = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

export default async function SituatiePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const showPrices = canSeePrices(session.role);
  const canApprove = can(session.role, "sl.aproba");
  const canVerify = can(session.role, "sl.verifica") || canApprove;

  const [row] = await db
    .select({
      sl: situatiiLucrari,
      pkg: packages,
      subcontractor: partners,
      unit: workUnits,
      objective: objectives,
      approver: users,
    })
    .from(situatiiLucrari)
    .leftJoin(packages, eq(situatiiLucrari.packageId, packages.id))
    .leftJoin(partners, eq(packages.subcontractorId, partners.id))
    .leftJoin(workUnits, eq(packages.workUnitId, workUnits.id))
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .leftJoin(users, eq(situatiiLucrari.approvedBy, users.id))
    .where(eq(situatiiLucrari.id, id))
    .limit(1);
  if (!row) notFound();

  const lines = await db
    .select()
    .from(slLines)
    .where(eq(slLines.situatieId, id))
    .orderBy(asc(slLines.createdAt));

  const checks = new Map(lines.map((l) => [l.id, checkCumulative(l)]));
  const blockedLines = lines.filter((l) => checks.get(l.id)!.blocked);
  const suspectLines = lines.filter((l) => l.verdict === "suspect");
  const unchecked = lines.filter((l) => l.verdict === "neverificat");
  const total = lines.reduce((a, l) => a + fromDb(l.value), 0);

  const canApproveNow =
    canApprove &&
    row.sl.status !== "aprobata" &&
    row.sl.status !== "facturata" &&
    blockedLines.length === 0 &&
    suspectLines.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <Link href="/situatii" className="hover:text-blueprint">
            ‹ Situații de lucrări
          </Link>
        }
        title={`${row.sl.code ?? "Situație"} — ${MONTHS[row.sl.month - 1]} ${row.sl.year}`}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={SL_STATUS_TONE[row.sl.status]}>{SL_STATUS_LABEL[row.sl.status]}</Badge>
            <span>{row.subcontractor?.name ?? "—"}</span>
            <span>· {row.objective?.name ?? "—"}</span>
          </span>
        }
        actions={
          canApprove && row.sl.status !== "aprobata" && row.sl.status !== "facturata" ? (
            <form action={approveSituatie}>
              <input type="hidden" name="situatieId" value={id} />
              <Button type="submit" variant="primary" size="sm" disabled={!canApproveNow}>
                Aprobă situația
              </Button>
            </form>
          ) : null
        }
      />

      {/* De ce nu se poate aproba — scris, nu doar un buton gri. */}
      {blockedLines.length > 0 ? (
        <p className="border-l-2 border-over bg-over-soft px-4 py-2.5 text-tiny text-over">
          <span className="font-medium">
            {blockedLines.length}{" "}
            {blockedLines.length === 1 ? "linie depășește" : "linii depășesc"} cantitatea
            contractată.
          </span>{" "}
          Situația nu se poate aproba. Ieșirea corectă e o suplimentare — trece prin altă poartă,
          cu decizie și autor.
        </p>
      ) : suspectLines.length > 0 ? (
        <p className="border-l-2 border-over bg-over-soft px-4 py-2.5 text-tiny text-over">
          <span className="font-medium">
            {suspectLines.length}{" "}
            {suspectLines.length === 1 ? "linie marcată suspect" : "linii marcate suspect"}.
          </span>{" "}
          Se lămuresc înainte de aprobare, nu după.
        </p>
      ) : unchecked.length > 0 ? (
        <p className="border-l-2 border-warn bg-warn-soft px-4 py-2.5 text-tiny text-warn">
          {unchecked.length} {unchecked.length === 1 ? "linie neverificată" : "linii neverificate"}.
          Verificarea se face de pe teren, linie cu linie.
        </p>
      ) : null}

      <Sheet className="grid gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-4">
        <DataPair label="Pachet">
          {row.pkg ? (
            <Link href={`/pachete/${row.pkg.id}`} className="hover:text-blueprint">
              {row.pkg.code}
            </Link>
          ) : (
            "—"
          )}
        </DataPair>
        <DataPair label="Declarată">
          {row.sl.declaredAt ? formatDay(String(row.sl.declaredAt).slice(0, 10)) : "—"}
        </DataPair>
        <DataPair label="Aprobată">
          {row.sl.approvedAt
            ? `${formatDay(String(row.sl.approvedAt).slice(0, 10))} · ${row.approver?.name ?? ""}`
            : "—"}
        </DataPair>
        {showPrices ? (
          <DataPair label="Garanție reținută" numeric>
            <Money value={fromDb(row.sl.retentionValue)} />
          </DataPair>
        ) : null}
      </Sheet>

      {/* ─────────── cele cinci cumulate ─────────── */}
      {lines.length === 0 ? (
        <EmptyState title="Situație fără linii" />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Poziție</TH>
                <TH>UM</TH>
                <TH numeric title="cantitatea din pachet">Contractat</TH>
                <TH numeric title="declarat de subcontractant, cumulat">Executat</TH>
                <TH numeric title="confirmat de noi, cumulat">Aprobat</TH>
                <TH numeric title="intrat pe factură, cumulat">Facturat</TH>
                <TH numeric title="declarat în luna asta">Luna asta</TH>
                <TH numeric title="contractat − aprobat">Rest</TH>
                {showPrices ? <TH numeric>Preț</TH> : null}
                {showPrices ? <TH numeric>Valoare</TH> : null}
                <TH>Verdict</TH>
              </TR>
            </THead>
            <TBody>
              {lines.map((l) => {
                const check = checks.get(l.id)!;
                const remaining = check.contracted - Number(l.approvedCumulative ?? 0);
                return (
                  <TR key={l.id}>
                    <TD className="max-w-72">
                      {l.name}
                      {l.isSupplement ? (
                        <Badge tone="blueprint" className="ml-2">
                          suplimentare
                        </Badge>
                      ) : null}
                    </TD>
                    <TD muted>{l.unit}</TD>
                    <TD numeric>{Number(l.contractedQty ?? 0)}</TD>
                    <TD numeric muted>{Number(l.executedCumulative ?? 0)}</TD>
                    <TD numeric muted>{Number(l.approvedCumulative ?? 0)}</TD>
                    <TD numeric muted>{Number(l.invoicedCumulative ?? 0)}</TD>
                    <TD numeric strong className={check.blocked ? "text-over" : undefined}>
                      {Number(l.declaredQty ?? 0)}
                      {check.blocked ? (
                        <span className="block text-micro font-normal">
                          +{check.over.toFixed(2).replace(/\.?0+$/, "")} peste
                        </span>
                      ) : null}
                    </TD>
                    <TD numeric muted className={remaining < 0 ? "text-over" : undefined}>
                      {remaining}
                    </TD>
                    {showPrices ? (
                      <TD numeric muted>
                        <Money value={fromDb(l.unitPrice)} unit={null} />
                      </TD>
                    ) : null}
                    {showPrices ? (
                      <TD numeric strong>
                        <Money value={fromDb(l.value)} unit={null} />
                      </TD>
                    ) : null}
                    <TD>
                      {canVerify ? (
                        <VerdictForm
                          lineId={l.id}
                          verdict={l.verdict}
                          comment={l.verdictComment}
                        />
                      ) : (
                        <Badge tone={VERDICT_TONE[l.verdict]}>{VERDICT_LABEL[l.verdict]}</Badge>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
            {showPrices ? (
              <tfoot>
                <TFootRow>
                  <TD colSpan={9}>{lines.length} poziții</TD>
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

      <p className="max-w-prose text-micro text-ink-3">
        Verificarea e linie cu linie, nu aprobare în bloc. Cine verifică e omul din teren, care
        știe dacă s-au turnat 40 sau 32 de metri pătrați — și care nu vede prețuri. Decizia
        economică rămâne la manager.
      </p>
    </div>
  );
}
