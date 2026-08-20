import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";

import { BudgetRow } from "@/components/ui/gauge";
import { Badge, PageHeader, SectionRule } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { alertLevel, budgetsForMonth } from "@/lib/budget";
import { db } from "@/lib/db";
import { contracts, notifications, partners } from "@/lib/db/schema";
import { formatShort } from "@/lib/money";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PanouPage() {
  const session = await requireSession();
  const showPrices = canSeePrices(session.role);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dayOfMonth = now.getDate();

  const rows = await db
    .select({ contract: contracts, client: partners })
    .from(contracts)
    .leftJoin(partners, eq(contracts.clientId, partners.id))
    .where(eq(contracts.kind, "mentenanta"));

  const budgets = await budgetsForMonth(
    year,
    month,
    rows.map((r) => r.contract.id),
  );

  const cards = rows
    .map(({ contract, client }) => ({ contract, client, budget: budgets.get(contract.id) }))
    .filter((c) => c.budget)
    .sort((a, b) => a.contract.code.localeCompare(b.contract.code));

  const deltaAlerts = cards
    .flatMap(({ contract, budget }) =>
      budget!.views
        .filter((v) => v.kind === "delta" && alertLevel(v, dayOfMonth) !== "ok")
        .map((view) => ({ contract, view })),
    )
    .sort((a, b) => (b.view.unfilled ?? 0) - (a.view.unfilled ?? 0));

  const totalUnfilled = deltaAlerts.reduce((a, d) => a + (d.view.unfilled ?? 0), 0);

  const alerts = await db
    .select()
    .from(notifications)
    .where(inArray(notifications.kind, ["buget_80", "contract_expira", "sl_de_aprobat"]))
    .orderBy(desc(notifications.createdAt))
    .limit(5);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Conducere"
        title="Panou"
        meta={`${cards.length} contracte de mentenanță · ${session.name}`}
      />

      {/* Delta e singurul plafon care trebuie UMPLUT. Când e neumplut, e prima
          informație de pe ecran — pe 31 ale lunii e prea târziu (§24.1). */}
      {deltaAlerts.length > 0 && showPrices ? (
        <section>
          <SectionRule right={`${formatShort(totalUnfilled)} lei în total`}>
            Delta neumplută — venit care se pierde luna asta
          </SectionRule>
          <div className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2">
            {deltaAlerts.map(({ contract, view }) => (
              <Link
                key={contract.id}
                href={`/contracte/${contract.id}`}
                className="group border border-rule bg-sheet px-4 py-3 transition-colors hover:border-over/40 hover:bg-over-soft"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-narrow text-[0.8125rem] font-semibold text-ink">
                    {contract.code}
                  </span>
                  <span className="tabular text-lg font-semibold leading-none text-over">
                    {formatShort(view.unfilled ?? 0)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-tiny text-ink-2">{contract.name}</div>
                <div className="mt-2 text-micro text-ink-3">
                  umplut {Math.round(view.percent)}% din {formatShort(view.cap)} lei
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionRule right={showPrices ? "marjă pe luna curentă" : undefined}>
          Contracte de mentenanță
        </SectionRule>

        <div className="mt-3 grid gap-4 xl:grid-cols-2">
          {cards.map(({ contract, client, budget }) => (
            <article key={contract.id} className="sheet px-4 py-3.5">
              <header className="flex items-start justify-between gap-4 border-b border-rule pb-2.5">
                <div className="min-w-0">
                  <Link
                    href={`/contracte/${contract.id}`}
                    className="font-narrow text-[0.9375rem] font-semibold text-ink hover:text-blueprint"
                  >
                    {contract.code} · {client?.name ?? "—"}
                  </Link>
                  <div className="truncate text-tiny text-ink-2">{contract.name}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="eyebrow">Abonament</div>
                  <div className="tabular text-[0.9375rem] font-semibold text-ink">
                    {showPrices ? formatShort(budget!.subscription) : "····"}
                  </div>
                </div>
              </header>

              <div className="divide-y divide-rule">
                {budget!.views.map((view) => (
                  <BudgetRow
                    key={view.componentId}
                    label={view.name}
                    direction={view.direction}
                    percent={view.percent}
                    hidePrices={!showPrices}
                    caption={
                      view.direction === "umple"
                        ? `plafon venit ${formatShort(view.cap)} · umplut ${formatShort(view.cap - (view.unfilled ?? 0))} · liber ${formatShort(view.unfilled ?? 0)}`
                        : `venit ${formatShort(view.revenue)} · plafon cost ${formatShort(view.cap)}`
                    }
                    right={
                      view.direction === "umple"
                        ? undefined
                        : `angajat ${formatShort(view.committed)} · consumat ${formatShort(view.consumed)} · rest ${formatShort(view.remaining)}`
                    }
                  />
                ))}
              </div>

              {showPrices ? (
                <footer className="flex items-center justify-between border-t border-rule-strong pt-2 text-tiny">
                  <span className="text-ink-2">Marjă lună</span>
                  <span
                    className={`tabular font-semibold ${budget!.margin < 15 ? "text-over" : budget!.margin < 22 ? "text-warn" : "text-fill"}`}
                  >
                    {budget!.margin.toFixed(1)}%
                  </span>
                </footer>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {alerts.length > 0 ? (
        <section>
          <SectionRule>De rezolvat</SectionRule>
          <Sheet className="mt-2.5">
            <Table>
              <THead>
                <TR>
                  <TH>Alertă</TH>
                  <TH>Detaliu</TH>
                  <TH>Tip</TH>
                </TR>
              </THead>
              <TBody>
                {alerts.map((a) => (
                  <TR key={a.id}>
                    <TD strong>
                      {a.href ? (
                        <Link href={a.href} className="hover:text-blueprint">
                          {a.title}
                        </Link>
                      ) : (
                        a.title
                      )}
                    </TD>
                    <TD muted>{a.body ?? "—"}</TD>
                    <TD>
                      <Badge tone={a.kind === "buget_80" ? "warn" : "neutral"}>{a.kind}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Sheet>
        </section>
      ) : null}
    </div>
  );
}
