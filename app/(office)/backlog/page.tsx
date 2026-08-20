import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, sql as raw } from "drizzle-orm";

import { MonthNav } from "@/components/domain/MonthNav";
import { Gauge } from "@/components/ui/gauge";
import { Badge, Button, PageHeader, SectionRule } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { budgetsForMonth } from "@/lib/budget";
import { db } from "@/lib/db";
import { contracts, objectives, requests } from "@/lib/db/schema";
import { formatShort, fromDb } from "@/lib/money";
import { labelPeriod, periodFromParams } from "@/lib/period";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Ecranul 9 — backlogul Delta.
 *
 * Delta e inversul celorlalte componente: e un plafon de VENIT care trebuie UMPLUT,
 * iar ce nu se umple până la 31 e venit pierdut fără cost și nu se reportează.
 * Ecranul ăsta e locul din care se umple: propuneri evaluate, cu estimarea lor,
 * filtrate după cât mai e liber în Delta lunii.
 */
export default async function BacklogPage({
  searchParams,
}: {
  searchParams: Promise<{ an?: string; luna?: string; incape?: string }>;
}) {
  const session = await requireSession();
  if (!canSeePrices(session.role)) notFound();

  const sp = await searchParams;
  const period = periodFromParams(sp);

  const maintenanceContracts = await db
    .select()
    .from(contracts)
    .where(eq(contracts.kind, "mentenanta"));
  const contractIds = maintenanceContracts.map((c) => c.id);

  const [budgets, rows] = await Promise.all([
    budgetsForMonth(period.year, period.month, contractIds),
    db
      .select({ request: requests, objective: objectives, contract: contracts })
      .from(requests)
      .leftJoin(objectives, eq(requests.objectiveId, objectives.id))
      .leftJoin(contracts, eq(requests.contractId, contracts.id))
      .where(
        and(
          inArray(requests.status, ["neprocesata", "evaluata", "amanata"]),
          raw`${requests.kind} in ('propunere', 'constatare', 'solicitare')`,
        ),
      )
      .orderBy(asc(requests.estimatedValue))
      .limit(80),
  ]);

  // Delta liberă, per contract — cifra după care se filtrează tot ecranul.
  const deltaByContract = new Map<string, { cap: number; filled: number; free: number; percent: number }>();
  let totalCap = 0;
  let totalFilled = 0;
  for (const [contractId, budget] of budgets) {
    const delta = budget.views.find((v) => v.kind === "delta");
    if (!delta) continue;
    const filled = delta.cap - delta.remaining;
    deltaByContract.set(contractId, {
      cap: delta.cap,
      filled,
      free: Math.max(0, delta.remaining),
      percent: delta.percent,
    });
    totalCap += delta.cap;
    totalFilled += filled;
  }

  const onlyFitting = sp.incape === "1";
  const visible = rows.filter(({ request, contract }) => {
    if (!onlyFitting) return true;
    if (!contract) return false;
    const delta = deltaByContract.get(contract.id);
    return delta ? fromDb(request.estimatedValue) <= delta.free : false;
  });

  const totalFree = Math.max(0, totalCap - totalFilled);
  const backlogValue = visible.reduce((a, r) => a + fromDb(r.request.estimatedValue), 0);
  const day = new Date().getDate();
  const percent = totalCap === 0 ? 0 : (totalFilled / totalCap) * 100;

  const qs = (patch: Record<string, string | undefined>) => {
    const s = new URLSearchParams({ an: String(period.year), luna: String(period.month) });
    if ((patch.incape ?? (onlyFitting ? "1" : undefined)) === "1") s.set("incape", "1");
    return `/backlog?${s.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operațional"
        title="Backlog Delta"
        meta="Delta nu se reportează. Ce nu se umple până la sfârșitul lunii e venit pierdut, fără cost salvat."
        actions={<MonthNav period={period} basePath="/backlog" extraParams={{ incape: sp.incape }} />}
      />

      {/* Cifra care contează: cât mai e de umplut și câte zile au mai rămas. */}
      <section className="sheet px-4 py-3.5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Delta {labelPeriod(period)}, toate contractele</div>
            <div className="tabular mt-1 text-2xl font-semibold text-ink">
              {formatShort(totalFilled)}
              <span className="ml-1.5 text-base font-normal text-ink-3">
                din {formatShort(totalCap)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="eyebrow">Rămas de umplut</div>
            <div className="tabular mt-1 text-xl font-semibold text-over">
              {formatShort(totalFree)}
            </div>
            <div className="text-micro text-ink-3">
              în backlog: {formatShort(backlogValue)} · ziua {day} din lună
            </div>
          </div>
        </div>
        <Gauge direction="umple" percent={percent} className="mt-3" />
        {percent < 60 && day >= 10 ? (
          <p className="mt-2 border-l-2 border-warn bg-warn-soft px-3 py-1.5 text-tiny text-warn">
            Sub 60% la mijlocul lunii. Alertă de neumplut — de aici încolo, fiecare zi scade șansa
            de a mai executa ce se rutează.
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={qs({ incape: undefined })}
          className={`rounded-[3px] border px-2 py-0.5 text-tiny transition-colors ${
            !onlyFitting
              ? "border-blueprint bg-blueprint text-white"
              : "border-rule-strong bg-sheet text-ink-2 hover:bg-sunk"
          }`}
        >
          Tot backlogul
        </Link>
        <Link
          href={qs({ incape: "1" })}
          className={`rounded-[3px] border px-2 py-0.5 text-tiny transition-colors ${
            onlyFitting
              ? "border-blueprint bg-blueprint text-white"
              : "border-rule-strong bg-sheet text-ink-2 hover:bg-sunk"
          }`}
        >
          Doar ce încape în Delta lunii
        </Link>
      </div>

      <section className="space-y-3">
        <SectionRule right={`${visible.length} propuneri`}>Propuneri evaluate</SectionRule>
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Cod</TH>
                <TH>Propunere</TH>
                <TH>Obiectiv</TH>
                <TH>Contract</TH>
                <TH numeric>Estimat</TH>
                <TH numeric>Delta liberă</TH>
                <TH>Expiră</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {visible.map(({ request, objective, contract }) => {
                const estimated = fromDb(request.estimatedValue);
                const delta = contract ? deltaByContract.get(contract.id) : undefined;
                const fits = delta ? estimated <= delta.free : false;
                return (
                  <TR key={request.id}>
                    <TD>
                      <Link href={`/cereri/${request.id}`} className="font-medium hover:text-blueprint">
                        {request.code}
                      </Link>
                    </TD>
                    <TD className="max-w-72">{request.title}</TD>
                    <TD muted className="max-w-40 truncate">
                      {objective?.name ?? "—"}
                    </TD>
                    <TD muted>{contract?.code ?? "—"}</TD>
                    <TD numeric strong>
                      {formatShort(estimated)}
                    </TD>
                    <TD numeric muted>
                      {delta ? formatShort(delta.free) : "—"}
                    </TD>
                    <TD muted>{request.expiresAt ?? "—"}</TD>
                    <TD>
                      {fits ? (
                        <Link href={`/cereri/${request.id}`}>
                          <Button size="sm" variant="primary">
                            Rutează
                          </Button>
                        </Link>
                      ) : (
                        <Badge tone="neutral">nu încape</Badge>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Sheet>
        {visible.length === 0 ? (
          <p className="text-tiny text-ink-2">
            Backlogul e gol pentru filtrul ales. Un backlog gol cu Delta neumplută înseamnă că
            inspecțiile nu produc constatări — verifică ecranul de acoperire a inspecțiilor.
          </p>
        ) : null}
      </section>
    </div>
  );
}
