import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";

import { freezeReport, regenerateReport } from "@/app/actions/reports";
import { MonthNav } from "@/components/domain/MonthNav";
import { Badge, Button, PageHeader, SectionRule } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import { contracts, monthlyReports, partners, users } from "@/lib/db/schema";
import { buildReportContent, type ReportContent } from "@/lib/monthly-report";
import { formatShort } from "@/lib/money";
import { labelPeriod, periodFromParams } from "@/lib/period";
import { can, canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  inspectie: "Inspecție",
  interventie: "Intervenție",
  lucrare: "Lucrare",
};

/**
 * Ecranul 34 — raportul lunar către client.
 *
 * Se agregă din fișe, nu se scrie de mână. E versionat și înghețat la emitere:
 * ce a primit clientul rămâne exact ce a primit clientul, iar corecțiile apar ca
 * versiune nouă, cu diferența vizibilă.
 */
export default async function RapoartePage({
  searchParams,
}: {
  searchParams: Promise<{ an?: string; luna?: string; contract?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const period = periodFromParams(sp);

  const contractRows = await db
    .select({ contract: contracts, client: partners })
    .from(contracts)
    .leftJoin(partners, eq(contracts.clientId, partners.id))
    .where(eq(contracts.kind, "mentenanta"));

  const contractId = sp.contract ?? contractRows[0]?.contract.id;
  if (!contractId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Evidență" title="Rapoarte lunare" />
        <p className="text-tiny text-ink-2">Niciun contract de mentenanță.</p>
      </div>
    );
  }

  const selected = contractRows.find((c) => c.contract.id === contractId)!;

  const [versions, live] = await Promise.all([
    db
      .select({ report: monthlyReports, approver: users })
      .from(monthlyReports)
      .leftJoin(users, eq(monthlyReports.approvedBy, users.id))
      .where(
        and(
          eq(monthlyReports.contractId, contractId),
          eq(monthlyReports.year, period.year),
          eq(monthlyReports.month, period.month),
        ),
      )
      .orderBy(desc(monthlyReports.version)),
    buildReportContent(contractId, period.year, period.month),
  ]);

  const current = versions[0];
  const frozen = current && current.report.status !== "draft";
  // Un raport emis se citește din conținutul înghețat, nu din date de azi.
  const content: ReportContent = frozen
    ? ((current.report.content as ReportContent) ?? live)
    : live;
  const showPrices = canSeePrices(session.role);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Evidență"
        title="Raport lunar către client"
        meta={`${selected.contract.code} — ${selected.client?.name ?? "—"}`}
        actions={
          <MonthNav
            period={period}
            basePath="/rapoarte"
            extraParams={{ contract: contractId }}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {contractRows.map(({ contract }) => (
          <Link
            key={contract.id}
            href={`/rapoarte?an=${period.year}&luna=${period.month}&contract=${contract.id}`}
            className={`rounded-[3px] border px-2 py-0.5 text-tiny transition-colors ${
              contract.id === contractId
                ? "border-blueprint bg-blueprint text-white"
                : "border-rule-strong bg-sheet text-ink-2 hover:bg-sunk"
            }`}
          >
            {contract.code}
          </Link>
        ))}
      </div>

      {/* Starea documentului, înaintea conținutului: e draft sau e ce a primit clientul? */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <div className="flex items-center gap-3">
          <Badge tone={frozen ? "fill" : "warn"}>
            {frozen ? `versiunea ${current.report.version}, emis` : "draft"}
          </Badge>
          <span className="text-tiny text-ink-2">
            {frozen
              ? `Înghețat ${current.report.frozenAt ? new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium" }).format(current.report.frozenAt) : "—"} de ${current.approver?.name ?? "—"}`
              : "Se recalculează din fișe la fiecare deschidere. Nimic nu e definitiv până la emitere."}
          </span>
        </div>
        {can(session.role, "raport.aproba") ? (
          <div className="flex gap-2">
            <form action={regenerateReport}>
              <input type="hidden" name="contractId" value={contractId} />
              <input type="hidden" name="year" value={period.year} />
              <input type="hidden" name="month" value={period.month} />
              <Button type="submit" size="sm">
                {frozen ? "Versiune nouă" : "Salvează draftul"}
              </Button>
            </form>
            {current && !frozen ? (
              <form action={freezeReport}>
                <input type="hidden" name="reportId" value={current.report.id} />
                <Button type="submit" variant="primary" size="sm">
                  Emite și îngheață
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Inspecții" value={content.totals.inspections} />
        <Stat label="Intervenții" value={content.totals.interventions} />
        <Stat label="Lucrări" value={content.totals.works} />
        <Stat label="Ore lucrate" value={content.totals.hours} />
        <Stat
          label="Obiective atinse"
          value={`${content.totals.objectivesTouched}/${content.totals.objectivesContracted}`}
        />
        {showPrices ? (
          <Stat label="Abonament" value={formatShort(content.subscription)} />
        ) : (
          <Stat label="Puncte NOK" value={content.totals.nokPoints} />
        )}
      </section>

      <section className="space-y-3">
        <SectionRule right={`${content.lines.length} obiective`}>
          Ce s-a lucrat în {labelPeriod(period)}
        </SectionRule>
        {content.lines.length === 0 ? (
          <p className="text-tiny text-ink-2">
            Nicio unitate de lucru în luna asta pe contractul ăsta.
          </p>
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Obiectiv</TH>
                  <TH>Cod</TH>
                  <TH>Tip</TH>
                  <TH>Lucrare</TH>
                  <TH numeric>Ore</TH>
                  <TH>Stare</TH>
                </TR>
              </THead>
              <TBody>
                {content.lines.flatMap((line) =>
                  line.items.map((item, i) => (
                    <TR key={`${line.objectiveCode}-${item.code}`}>
                      <TD muted className="max-w-48 truncate">
                        {i === 0 ? `${line.objectiveCode} — ${line.objectiveName}` : ""}
                      </TD>
                      <TD muted>{item.code}</TD>
                      <TD muted>{KIND_LABEL[item.kind] ?? item.kind}</TD>
                      <TD className="max-w-72">{item.title}</TD>
                      <TD numeric>{item.hours || "—"}</TD>
                      <TD muted>{item.status}</TD>
                    </TR>
                  )),
                )}
              </TBody>
            </Table>
          </Sheet>
        )}
      </section>

      {content.findings.length ? (
        <section className="space-y-3">
          <SectionRule right={`${content.totals.nokPoints} puncte NOK`}>
            Constatări din inspecțiile lunii
          </SectionRule>
          <p className="max-w-prose text-tiny text-ink-2">
            Partea din raport care produce lucrările lunii următoare. Ea e argumentul pentru
            oferta pe care o trimiți în paralel.
          </p>
          <ul className="divide-y divide-rule border-y border-rule">
            {content.findings.map((finding, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 text-[0.8125rem] text-ink">
                  {finding.text}
                  <span className="block text-micro text-ink-3">{finding.objectiveName}</span>
                </span>
                <span className="shrink-0 text-tiny text-ink-2">{finding.outcome ?? "—"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {versions.length > 1 ? (
        <section className="space-y-2">
          <SectionRule>Versiuni</SectionRule>
          <ul className="divide-y divide-rule border-y border-rule">
            {versions.map(({ report, approver }) => (
              <li key={report.id} className="flex items-baseline justify-between gap-3 py-2 text-tiny">
                <span className="text-ink">
                  Versiunea {report.version} · {report.status}
                </span>
                <span className="text-ink-2">
                  {report.frozenAt
                    ? new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium" }).format(report.frozenAt)
                    : "nedefinitivat"}{" "}
                  · {approver?.name ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="sheet px-3 py-2">
      <div className="eyebrow">{label}</div>
      <div className="tabular mt-0.5 text-lg font-semibold text-ink">{value}</div>
    </div>
  );
}
