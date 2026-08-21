import Link from "next/link";
import { eq } from "drizzle-orm";

import { Gauge } from "@/components/ui/gauge";
import { MonthNav } from "@/components/domain/MonthNav";
import { Badge, Button, PageHeader, SectionRule } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { budgetsForMonth } from "@/lib/budget";
import { db } from "@/lib/db";
import { contracts, firms, partners, users } from "@/lib/db/schema";
import { formatShort } from "@/lib/money";
import { periodFromParams } from "@/lib/period";
import { can, canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  mentenanta: "Mentenanță",
  individual_deviz: "Individual",
  individual_inversa: "Facturare inversă",
};

/** Câte luni mai are contractul până la expirare. */
function monthsLeft(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  return (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
}

export default async function ContractePage({
  searchParams,
}: {
  searchParams: Promise<{ an?: string; luna?: string }>;
}) {
  const session = await requireSession();
  const showPrices = canSeePrices(session.role);
  const canEdit = can(session.role, "contracte.editeaza");
  const period = periodFromParams(await searchParams);

  const rows = await db
    .select({ contract: contracts, client: partners, firm: firms, owner: users })
    .from(contracts)
    .leftJoin(partners, eq(contracts.clientId, partners.id))
    .leftJoin(firms, eq(contracts.firmId, firms.id))
    .leftJoin(users, eq(contracts.ownerId, users.id));

  const budgets = await budgetsForMonth(period.year, period.month);

  const enriched = rows
    .map((r) => ({ ...r, budget: budgets.get(r.contract.id), left: monthsLeft(r.contract.endDate) }))
    .sort((a, b) => a.contract.code.localeCompare(b.contract.code));

  const maintenance = enriched.filter((r) => r.contract.kind === "mentenanta");
  const individual = enriched.filter((r) => r.contract.kind !== "mentenanta");

  const totalMonthly = maintenance.reduce((a, r) => a + (r.budget?.subscription ?? 0), 0);
  const totalCost = maintenance.reduce((a, r) => a + (r.budget?.cost ?? 0), 0);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Conducere"
        title="Contracte"
        meta={`${maintenance.length} de mentenanță · ${individual.length} individuale`}
        actions={
          <>
            <MonthNav period={period} basePath="/contracte" />
            {canEdit ? (
              <Link href="/contracte/nou">
                <Button size="sm" variant="primary">
                  ＋ Contract
                </Button>
              </Link>
            ) : null}
          </>
        }
      />

      <section>
        <SectionRule right={showPrices ? `abonament total ${formatShort(totalMonthly)} lei/lună` : undefined}>
          Mentenanță multianuală
        </SectionRule>
        <Sheet className="mt-2.5">
          <Table>
            <THead>
              <TR>
                <TH>Cod</TH>
                <TH>Client</TH>
                <TH>Firmă</TH>
                <TH>Proprietar</TH>
                <TH numeric>Abonament</TH>
                <TH>Indexare</TH>
                <TH>Plafoane luna curentă</TH>
                <TH numeric>Marjă</TH>
                <TH>Expiră</TH>
              </TR>
            </THead>
            <TBody>
              {maintenance.map(({ contract, client, firm, owner, budget, left }) => (
                <TR key={contract.id}>
                  <TD strong>
                    <Link href={`/contracte/${contract.id}`} className="hover:text-blueprint">
                      {contract.code}
                    </Link>
                  </TD>
                  <TD>{client?.name ?? "—"}</TD>
                  <TD muted>{firm?.name.replace("Damina ", "") ?? "—"}</TD>
                  <TD muted>{owner?.name ?? "—"}</TD>
                  <TD numeric>{showPrices ? formatShort(budget?.subscription ?? 0) : "····"}</TD>
                  <TD>
                    {Number(contract.indexationPercent) === 0 ? (
                      // Contractele cu indexare 0 se degradează cel mai repede (§22.6).
                      <Badge tone="over">0% · fără indexare</Badge>
                    ) : (
                      <span className="tabular text-ink-2">{contract.indexationPercent}%</span>
                    )}
                  </TD>
                  <TD>
                    <div className="flex min-w-40 items-center gap-1.5">
                      {budget?.views.map((v) => (
                        <span key={v.componentId} className="flex-1" title={v.name}>
                          <Gauge direction={v.direction} percent={v.percent} size="sm" />
                        </span>
                      ))}
                    </div>
                  </TD>
                  <TD numeric>
                    {showPrices ? (
                      <span
                        className={
                          (budget?.margin ?? 0) < 15
                            ? "text-over"
                            : (budget?.margin ?? 0) < 22
                              ? "text-warn"
                              : "text-fill"
                        }
                      >
                        {(budget?.margin ?? 0).toFixed(1)}%
                      </span>
                    ) : (
                      "····"
                    )}
                  </TD>
                  <TD>
                    {left <= contract.expiryAlertMonths ? (
                      <Badge tone="warn">{left} luni</Badge>
                    ) : (
                      <span className="text-ink-3">{left} luni</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
            {showPrices ? (
              <tfoot>
                <TFootRow>
                  <TD colSpan={4}>Total lună</TD>
                  <TD numeric>{formatShort(totalMonthly)}</TD>
                  <TD colSpan={2} />
                  <TD numeric>
                    {totalMonthly > 0
                      ? (((totalMonthly - totalCost) / totalMonthly) * 100).toFixed(1)
                      : "0.0"}
                    %
                  </TD>
                  <TD />
                </TFootRow>
              </tfoot>
            ) : null}
          </Table>
        </Sheet>
      </section>

      <section>
        <SectionRule>Contracte individuale</SectionRule>
        <Sheet className="mt-2.5">
          <Table>
            <THead>
              <TR>
                <TH>Cod</TH>
                <TH>Denumire</TH>
                <TH>Client</TH>
                <TH>Tip</TH>
                <TH numeric>Valoare</TH>
                <TH>Perioadă</TH>
              </TR>
            </THead>
            <TBody>
              {individual.map(({ contract, client }) => (
                <TR key={contract.id}>
                  <TD strong>
                    <Link href={`/contracte/${contract.id}`} className="hover:text-blueprint">
                      {contract.code}
                    </Link>
                  </TD>
                  <TD>{contract.name}</TD>
                  <TD muted>{client?.name ?? "—"}</TD>
                  <TD>
                    <Badge tone={contract.kind === "individual_inversa" ? "blueprint" : "neutral"}>
                      {KIND_LABEL[contract.kind]}
                    </Badge>
                  </TD>
                  <TD numeric>
                    {showPrices ? formatShort(Number(contract.totalValue) * 100) : "····"}
                  </TD>
                  <TD muted>
                    {contract.startDate} → {contract.endDate}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Sheet>
      </section>
    </div>
  );
}
