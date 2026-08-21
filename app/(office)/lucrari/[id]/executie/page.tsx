import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql as raw } from "drizzle-orm";

import { setWorkUnitStatus } from "@/app/actions/work-units";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui/primitives";
import { StageForm } from "@/components/domain/OperabilityForms";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { DataPair } from "@/components/ui/tabs";
import { Money } from "@/components/ui/gauge";
import { db } from "@/lib/db";
import {
  costEntries,
  objectives,
  poLines,
  products,
  purchaseOrders,
  siteJournalEntries,
  users,
  workUnitStages,
  workUnits,
} from "@/lib/db/schema";
import {
  ALERT_THRESHOLD,
  STAGE_HEALTH_LABEL,
  STAGE_HEALTH_TONE,
  barGeometry,
  closingChecks,
  ganttWindow,
  stageState,
} from "@/lib/execution";
import { formatDay, today as todayIso } from "@/lib/equipment";
import { formatShort, fromDb } from "@/lib/money";
import { can, canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { STATUS_LABEL } from "@/lib/work-units";

export const dynamic = "force-dynamic";

export default async function ExecutiePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const showPrices = canSeePrices(session.role);
  const canPlan = can(session.role, "contracte.editeaza");
  const canClose = can(session.role, "cereri.decide");
  const today = todayIso();

  const [row] = await db
    .select({ unit: workUnits, objective: objectives })
    .from(workUnits)
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(eq(workUnits.id, id))
    .limit(1);
  if (!row) notFound();

  const [stages, costByStage, costTotals, journal, needs] = await Promise.all([
    db
      .select()
      .from(workUnitStages)
      .where(eq(workUnitStages.workUnitId, id))
      .orderBy(asc(workUnitStages.position)),
    db
      .select({ stageId: costEntries.stageId, total: raw<string>`sum(${costEntries.value})` })
      .from(costEntries)
      .where(raw`${costEntries.workUnitId} = ${id} and ${costEntries.stage} <> 'angajat'`)
      .groupBy(costEntries.stageId),
    db
      .select({ stage: costEntries.stage, total: raw<string>`sum(${costEntries.value})` })
      .from(costEntries)
      .where(eq(costEntries.workUnitId, id))
      .groupBy(costEntries.stage),
    db
      .select({ entry: siteJournalEntries, author: users })
      .from(siteJournalEntries)
      .leftJoin(users, eq(siteJournalEntries.createdBy, users.id))
      .where(eq(siteJournalEntries.workUnitId, id))
      .orderBy(desc(siteJournalEntries.day))
      .limit(40),
    db
      .select({ line: poLines, product: products, po: purchaseOrders })
      .from(poLines)
      .innerJoin(products, eq(poLines.productId, products.id))
      .innerJoin(purchaseOrders, eq(poLines.poId, purchaseOrders.id))
      .where(eq(poLines.workUnitId, id))
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(60),
  ]);

  const spentBy = new Map(costByStage.map((c) => [c.stageId, fromDb(c.total)]));
  const states = stages.map((s) => ({
    stage: s,
    state: stageState(s, spentBy.get(s.id) ?? 0, today, fromDb),
  }));

  const win = ganttWindow(stages, today);
  const todayGeom = barGeometry({ startDate: today, endDate: today }, win);

  const budgetTotal = states.reduce((a, s) => a + s.state.budget, 0);
  const spentTotal = states.reduce((a, s) => a + s.state.spent, 0);
  const committed = fromDb(costTotals.find((c) => c.stage === "angajat")?.total ?? "0");
  // doar etapele care ÎNCĂ merg — o etapă terminată la 98% nu mai e o alertă
  const alerting = states.filter(
    (s) => s.state.health === "atentie" || s.state.health === "depasita",
  );
  const openBlockers = journal.filter((j) => j.entry.blocker).length;

  const checks = closingChecks({
    stagesTotal: stages.length,
    stagesOver: states.filter((s) => s.state.usedPercent > 100).length,
    budget: budgetTotal,
    spent: spentTotal,
    committed,
    openBlockers,
    hasJournal: journal.length > 0,
  });

  // costul care nu s-a putut lipi de nicio etapă — se vede, nu se ascunde în total
  const unassigned = spentBy.get(null) ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <Link href={`/lucrari/${id}`} className="hover:text-blueprint">
            ‹ {row.unit.code}
          </Link>
        }
        title={row.unit.title}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={row.unit.status === "finalizata" ? "fill" : "blueprint"}>
              {STATUS_LABEL[row.unit.status]}
            </Badge>
            <span>{row.objective?.name ?? "—"}</span>
            <span>
              · {formatDay(row.unit.startDate)} → {formatDay(row.unit.endDate)}
            </span>
          </span>
        }
        actions={canPlan ? <StageForm workUnitId={id} /> : undefined}
      />

      {stages.length === 0 ? (
        <EmptyState
          title="Lucrarea nu are etape"
          hint="Graficul de execuție se construiește pe etape. Fără ele, lucrarea are un buget global și nimic care să spună unde se duce."
          action={canPlan ? <StageForm workUnitId={id} /> : undefined}
        />
      ) : (
        <>
          {/* ─────────── alerta la 80% ─────────── */}
          {showPrices && alerting.length > 0 ? (
            <div className="space-y-1.5 border-l-2 border-warn bg-warn-soft px-4 py-3">
              <p className="text-tiny font-medium text-warn">
                {alerting.length}{" "}
                {alerting.length === 1 ? "etapă în lucru a trecut" : "etape în lucru au trecut"}{" "}
                de{" "}
                {ALERT_THRESHOLD}% din buget.
              </p>
              <p className="max-w-prose text-micro text-warn">
                Pragul e la {ALERT_THRESHOLD}%, nu la 100%, pentru că la 100% e prea târziu:
                materialul e comandat, echipa e pe șantier, iar singura variantă rămasă e să ceri
                bani în plus.
              </p>
            </div>
          ) : null}

          {/* ─────────── Gantt ─────────── */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="eyebrow">Grafic de execuție</span>
              <span className="text-micro text-ink-3">
                {formatDay(win.from)} – {formatDay(win.to)} · {win.days} zile
              </span>
            </div>

            <Sheet className="px-5 py-4">
              <div className="space-y-2.5">
                {states.map(({ stage, state }) => {
                  const geom = barGeometry(stage, win);
                  const fill = Math.max(0, Math.min(state.usedPercent, 100));
                  return (
                    <div key={stage.id}>
                      <div className="mb-1 flex items-baseline justify-between gap-4">
                        <span className="min-w-0 truncate text-tiny text-ink">
                          <span className="tabular text-ink-3">{stage.position}.</span>{" "}
                          {stage.name}
                        </span>
                        <span className="shrink-0 text-micro text-ink-3">
                          {showPrices
                            ? `${formatShort(state.spent)} / ${formatShort(state.budget)}`
                            : `${Number(stage.percentOfWork)}% din lucrare`}
                        </span>
                      </div>

                      <div className="relative h-6 rounded-[2px] bg-sunk">
                        {/* linia de azi, peste tot graficul */}
                        {todayGeom ? (
                          <span
                            aria-hidden
                            style={{ left: `${todayGeom.left}%` }}
                            className="absolute inset-y-0 z-10 w-px bg-blueprint"
                          />
                        ) : null}

                        {geom ? (
                          <div
                            style={{ left: `${geom.left}%`, width: `${geom.width}%` }}
                            className="absolute inset-y-0 overflow-hidden rounded-[2px] border border-rule-strong bg-sheet"
                            title={`${formatDay(stage.startDate)} → ${formatDay(stage.endDate)}`}
                          >
                            {/* Bara nu arată durata, ci CÂT S-A CONSUMAT din bugetul etapei. */}
                            {showPrices ? (
                              <span
                                style={{ width: `${fill}%` }}
                                className={`absolute inset-y-0 left-0 ${
                                  state.usedPercent > 100
                                    ? "bg-over"
                                    : state.usedPercent >= ALERT_THRESHOLD
                                      ? "bg-warn"
                                      : "bg-blueprint"
                                }`}
                              />
                            ) : null}
                            <span className="absolute inset-y-0 left-1.5 flex items-center text-[0.5625rem] font-medium text-ink mix-blend-luminosity">
                              {showPrices ? `${state.usedPercent.toFixed(0)}%` : ""}
                            </span>
                          </div>
                        ) : (
                          <span className="absolute inset-y-0 left-2 flex items-center text-micro text-ink-3">
                            fără date
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-3 border-t border-rule pt-2 text-micro text-ink-3">
                Bara arată cât s-a consumat din bugetul etapei, nu cât timp a trecut. Linia
                verticală e ziua de azi. Un grafic care spune că etapa e la zi, dar tace despre
                bani, te minte politicos.
              </p>
            </Sheet>
          </section>

          {/* ─────────── buget vs consum, pe etapă ─────────── */}
          <section className="space-y-2">
            <span className="eyebrow">Buget pe etapă</span>
            <Sheet>
              <Table>
                <THead>
                  <TR>
                    <TH numeric>#</TH>
                    <TH>Etapă</TH>
                    <TH>Perioadă</TH>
                    <TH numeric>% din lucrare</TH>
                    {showPrices ? <TH numeric>Material</TH> : null}
                    {showPrices ? <TH numeric>Manoperă</TH> : null}
                    {showPrices ? <TH numeric>Buget</TH> : null}
                    {showPrices ? <TH numeric>Consumat</TH> : null}
                    {showPrices ? <TH numeric>Consumat %</TH> : null}
                    {showPrices ? <TH numeric title="consumat % − timp trecut %">Derivă</TH> : null}
                    <TH>Stare</TH>
                  </TR>
                </THead>
                <TBody>
                  {states.map(({ stage, state }) => (
                    <TR key={stage.id}>
                      <TD numeric muted>{stage.position}</TD>
                      <TD className="max-w-64">{stage.name}</TD>
                      <TD muted>
                        {formatDay(stage.startDate)} → {formatDay(stage.endDate)}
                      </TD>
                      <TD numeric muted>{Number(stage.percentOfWork)}%</TD>
                      {showPrices ? (
                        <TD numeric muted>
                          <Money value={fromDb(stage.materialBudget)} unit={null} />
                        </TD>
                      ) : null}
                      {showPrices ? (
                        <TD numeric muted>
                          <Money value={fromDb(stage.laborBudget)} unit={null} />
                        </TD>
                      ) : null}
                      {showPrices ? (
                        <TD numeric>
                          <Money value={state.budget} unit={null} />
                        </TD>
                      ) : null}
                      {showPrices ? (
                        <TD numeric strong>
                          <Money
                            value={state.spent}
                            unit={null}
                            tone={state.usedPercent > 100 ? "over" : undefined}
                          />
                        </TD>
                      ) : null}
                      {showPrices ? (
                        <TD
                          numeric
                          className={
                            state.usedPercent > 100
                              ? "text-over"
                              : state.usedPercent >= ALERT_THRESHOLD
                                ? "text-warn"
                                : undefined
                          }
                        >
                          {state.budget === 0 ? "—" : `${state.usedPercent.toFixed(0)}%`}
                        </TD>
                      ) : null}
                      {showPrices ? (
                        <TD
                          numeric
                          muted
                          className={state.drift > 15 ? "text-warn" : undefined}
                          title="Banii se duc mai repede decât trece timpul"
                        >
                          {state.budget === 0 || !state.started
                            ? "—"
                            : `${state.drift > 0 ? "+" : ""}${state.drift.toFixed(0)}`}
                        </TD>
                      ) : null}
                      <TD>
                        <Badge tone={STAGE_HEALTH_TONE[state.health]}>
                          {STAGE_HEALTH_LABEL[state.health]}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
                {showPrices ? (
                  <tfoot>
                    <TFootRow>
                      <TD colSpan={6}>{stages.length} etape</TD>
                      <TD numeric>
                        <Money value={budgetTotal} unit={null} />
                      </TD>
                      <TD numeric>
                        <Money value={spentTotal} unit={null} />
                      </TD>
                      <TD numeric>
                        {budgetTotal === 0
                          ? "—"
                          : `${((spentTotal / budgetTotal) * 100).toFixed(0)}%`}
                      </TD>
                      <TD colSpan={2} />
                    </TFootRow>
                  </tfoot>
                ) : null}
              </Table>
            </Sheet>

            {showPrices && unassigned > 0 ? (
              <p className="text-micro text-ink-3">
                <span className="tabular text-ink-2">{formatShort(unassigned)} lei</span> de cost
                nu sunt legați de nicio etapă. Se văd aici, nu se topesc în total.
              </p>
            ) : null}
          </section>
        </>
      )}

      {/* ─────────── necesar pe etape ─────────── */}
      {needs.length ? (
        <section className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="eyebrow shrink-0">Necesar de material, pe etape</span>
            <span aria-hidden className="h-px grow bg-rule" />
            <span className="shrink-0 text-micro text-ink-3">{needs.length} linii</span>
          </div>
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Comandă</TH>
                  <TH>Produs</TH>
                  <TH>Etapă</TH>
                  <TH numeric>Cerut</TH>
                  <TH numeric>Recepționat</TH>
                  {showPrices ? <TH numeric>Valoare</TH> : null}
                  <TH>Stare</TH>
                </TR>
              </THead>
              <TBody>
                {needs.map(({ line, product, po }) => {
                  const stage = stages.find((s) => s.id === line.stageId);
                  return (
                    <TR key={line.id}>
                      <TD muted>{po.code}</TD>
                      <TD className="max-w-64">{product.name}</TD>
                      <TD muted>
                        {stage ? (
                          `${stage.position}. ${stage.name}`
                        ) : (
                          <span className="text-warn">fără etapă</span>
                        )}
                      </TD>
                      <TD numeric>
                        {Number(line.quantity)} {product.unit}
                      </TD>
                      <TD numeric muted>{Number(line.receivedQty)}</TD>
                      {showPrices ? (
                        <TD numeric strong>
                          <Money value={fromDb(line.value)} unit={null} />
                        </TD>
                      ) : null}
                      <TD>
                        <Badge tone={po.status === "draft" ? "neutral" : "blueprint"}>
                          {po.status}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Sheet>
          <p className="max-w-prose text-micro text-ink-3">
            Etapa e obligatorie pe necesarul de material, cu etapa curentă precompletată (§22.4).
            Fără ea, la final ai un total de material și nicio idee unde s-a dus.
          </p>
        </section>
      ) : null}

      {/* ─────────── jurnalul de șantier ─────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="eyebrow shrink-0">Jurnal de șantier</span>
          <span aria-hidden className="h-px grow bg-rule" />
          <span className="shrink-0 text-micro text-ink-3">
            {journal.length} însemnări · {openBlockers} cu blocaj
          </span>
        </div>

        {journal.length === 0 ? (
          <EmptyState
            title="Jurnal gol"
            hint="Însemnările intră de pe teren, din ecranul de jurnal. Ele sunt singura explicație pentru o întârziere de trei zile, șase luni mai târziu."
          />
        ) : (
          <div className="space-y-1.5">
            {journal.map(({ entry, author }) => (
              <div
                key={entry.id}
                className={`border px-4 py-2.5 ${
                  entry.blocker ? "border-warn bg-warn-soft" : "border-rule-strong bg-sheet"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-tiny font-medium text-ink">{formatDay(entry.day)}</span>
                  <span className="shrink-0 text-micro text-ink-3">
                    {entry.weather ? `${entry.weather} · ` : ""}
                    {entry.peopleCount != null ? `${entry.peopleCount} oameni · ` : ""}
                    {author?.name ?? "—"}
                  </span>
                </div>
                <p className="mt-1 text-tiny leading-relaxed text-ink-2">{entry.text}</p>
                {entry.blocker ? (
                  <p className="mt-1.5 text-tiny text-warn">
                    <span className="font-medium">Blocaj:</span> {entry.blocker}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─────────── închiderea lucrării ─────────── */}
      <section className="space-y-2">
        <span className="eyebrow">Închiderea lucrării</span>
        <Sheet className="space-y-4 px-5 py-4">
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-4">
            <DataPair label="Stare">{STATUS_LABEL[row.unit.status]}</DataPair>
            {showPrices ? (
              <DataPair label="Buget etape" numeric>
                <Money value={budgetTotal} />
              </DataPair>
            ) : null}
            {showPrices ? (
              <DataPair label="Consumat" numeric>
                <Money value={spentTotal} tone={spentTotal > budgetTotal ? "over" : undefined} />
              </DataPair>
            ) : null}
            {showPrices ? (
              <DataPair label="Angajat, nelichidat" numeric>
                <Money value={committed} tone={committed > 0 ? "muted" : undefined} />
              </DataPair>
            ) : null}
          </div>

          <ul className="space-y-1.5 border-t border-rule pt-3">
            {checks.map((c) => (
              <li key={c.label} className="flex items-baseline gap-2.5 text-tiny">
                <span className={c.ok ? "text-fill" : "text-warn"}>{c.ok ? "✓" : "!"}</span>
                <span className="text-ink">{c.label}</span>
                <span className="text-ink-3">— {c.detail}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
            <p className="max-w-prose text-micro text-ink-3">
              Verificările nu blochează închiderea — uneori chiar așa se termină o lucrare. Se
              afișează toate, ca decizia să fie luată cu ochii deschiși și cu numele omului pe ea.
            </p>
            {canClose && row.unit.status !== "finalizata" ? (
              <form action={setWorkUnitStatus} className="shrink-0">
                <input type="hidden" name="workUnitId" value={id} />
                <input type="hidden" name="status" value="finalizata" />
                <Button type="submit" variant="primary">
                  Închide lucrarea
                </Button>
              </form>
            ) : row.unit.status === "finalizata" ? (
              <Badge tone="fill">
                Închisă
                {row.unit.closedAt
                  ? ` ${formatDay(String(row.unit.closedAt).slice(0, 10))}`
                  : ""}
              </Badge>
            ) : null}
          </div>
        </Sheet>
      </section>
    </div>
  );
}
