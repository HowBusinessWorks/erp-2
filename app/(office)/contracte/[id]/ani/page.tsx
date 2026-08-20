import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, sql as raw } from "drizzle-orm";

import { PageHeader, SectionRule } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import { contractYears, contracts, costEntries, partners } from "@/lib/db/schema";
import { formatShort, fromDb, type Bani } from "@/lib/money";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * §22.6 — „5% pe an nu e o lege a naturii, e o presupunere."
 *
 * Indexarea acoperă jumătate din risc. Cealaltă jumătate se vede doar aici: dacă
 * materialele cresc cu 9% și salariile cu 12%, iar indexarea e 5%, marja se erodează
 * încet, într-un fel invizibil dacă te uiți doar lunar. Ecranul ăsta face curba vizibilă
 * și lasă ipoteza de creștere editabilă, ca să afli în anul 1, nu în anul 4.
 */

const ASSUMPTIONS = [0, 3, 5, 7, 9, 12];
const MARGIN_FLOOR = 15;

export default async function MarjaPeAniPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ crestere?: string }>;
}) {
  const session = await requireSession();
  if (!canSeePrices(session.role)) notFound();

  const { id } = await params;
  const { crestere } = await searchParams;
  const growth = ASSUMPTIONS.includes(Number(crestere)) ? Number(crestere) : 7;

  const [row] = await db
    .select({ contract: contracts, client: partners })
    .from(contracts)
    .leftJoin(partners, eq(contracts.clientId, partners.id))
    .where(eq(contracts.id, id))
    .limit(1);
  if (!row) notFound();
  const { contract, client } = row;

  const years = await db
    .select()
    .from(contractYears)
    .where(eq(contractYears.contractId, id))
    .orderBy(contractYears.yearNo);

  if (years.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Contract" title={`${contract.code} — marjă pe ani`} />
        <p className="text-tiny text-ink-2">
          Contractul nu are ani definiți — ecranul e util doar la contractele multianuale.
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  // costul real pe fiecare an contractual, plus câte luni distincte au date
  const actuals = new Map<number, Bani>();
  const coverage = new Map<number, { withData: number; expected: number }>();
  for (const y of years) {
    const [agg] = await db
      .select({
        total: raw<string>`coalesce(sum(${costEntries.value}), 0)`,
        months: raw<string>`count(distinct to_char(${costEntries.effectDate}, 'YYYY-MM'))`,
      })
      .from(costEntries)
      .where(
        and(
          eq(costEntries.chargedContractId, id),
          raw`${costEntries.effectDate} between ${y.startDate} and ${y.endDate}`,
          raw`${costEntries.stage} <> 'angajat'`,
        ),
      );
    actuals.set(y.yearNo, fromDb(agg.total));

    const endForCount = y.endDate < today ? y.endDate : today;
    const expected =
      y.startDate > today
        ? 0
        : Math.max(
            1,
            Math.min(
              12,
              Math.round(
                (new Date(endForCount).getTime() - new Date(y.startDate).getTime()) /
                  (1000 * 60 * 60 * 24 * 30.4),
              ),
            ),
          );
    coverage.set(y.yearNo, { withData: Number(agg.months), expected });
  }

  // Baza de proiecție: costul anualizat al ultimului an cu date reale.
  const withData = years.filter((y) => (actuals.get(y.yearNo) ?? 0) > 0);
  const baseYear = withData[withData.length - 1];
  let baseAnnualCost = 0;
  if (baseYear) {
    const elapsedMonths = Math.max(
      1,
      Math.min(
        12,
        Math.round(
          (Math.min(new Date(today).getTime(), new Date(baseYear.endDate).getTime()) -
            new Date(baseYear.startDate).getTime()) /
            (1000 * 60 * 60 * 24 * 30.4),
        ),
      ),
    );
    baseAnnualCost = Math.round(((actuals.get(baseYear.yearNo) ?? 0) / elapsedMonths) * 12);
  }

  const rows = years.map((y) => {
    const revenue = fromDb(y.monthlyValue) * 12;
    const isPast = y.endDate < today;
    const isCurrent = y.startDate <= today && today <= y.endDate;
    const actual = actuals.get(y.yearNo) ?? 0;

    /**
     * Un an cu date pe 1 lună din 12 produce o marjă de 96% — o cifră care arată
     * spectaculos și e falsă. Mai bine niciun număr decât un număr greșit: anii
     * sub 60% acoperire se marchează „date parțiale" și ies din curbă.
     */
    const cov = coverage.get(y.yearNo) ?? { withData: 0, expected: 0 };
    const partial = cov.expected > 0 && cov.withData / cov.expected < 0.6;

    let cost: Bani;
    let projected = false;
    if (isPast) {
      cost = actual;
    } else if (isCurrent && baseYear && baseYear.yearNo === y.yearNo) {
      cost = baseAnnualCost;
      projected = true;
    } else {
      const stepsFromBase = baseYear ? y.yearNo - baseYear.yearNo : y.yearNo;
      cost = Math.round(baseAnnualCost * Math.pow(1 + growth / 100, Math.max(0, stepsFromBase)));
      projected = true;
    }

    const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
    return { y, revenue, cost, margin, projected, isCurrent, partial, cov };
  });

  const usable = rows.filter((r) => !r.partial);
  const maxMargin = Math.max(30, ...usable.map((r) => r.margin));
  const belowFloor = usable.filter((r) => r.margin < MARGIN_FLOOR);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={`Contract · ${client?.name ?? "—"}`}
        title={`${contract.code} — marjă pe an contractual`}
        meta={`Indexare ${contract.indexationPercent}% pe an · ${years.length} ani`}
        actions={
          <Link
            href={`/contracte/${id}`}
            className="text-tiny text-ink-2 transition-colors hover:text-ink"
          >
            ← Înapoi la plafoane
          </Link>
        }
      />

      <section>
        <SectionRule right={`ipoteză: costurile cresc cu ${growth}% pe an`}>
          Curba marjei
        </SectionRule>

        <div className="mt-3 sheet px-5 py-4">
          <div className="space-y-3">
            {rows.map(({ y, revenue, cost, margin, projected, isCurrent, partial, cov }) => {
              const width = Math.max(0, Math.min(100, (margin / maxMargin) * 100));
              const bad = margin < MARGIN_FLOOR;
              return (
                <div key={y.id}>
                  <div className="flex items-baseline justify-between gap-4 text-tiny">
                    <span className="font-narrow font-semibold uppercase tracking-wide text-ink">
                      Anul {y.yearNo}
                      <span className="ml-2 font-sans font-normal normal-case tracking-normal text-ink-3">
                        {y.startDate.slice(0, 4)}–{y.endDate.slice(0, 4)} ·{" "}
                        {formatShort(fromDb(y.monthlyValue))} lei/lună
                      </span>
                      {isCurrent ? (
                        <span className="ml-2 text-micro uppercase text-blueprint">în curs</span>
                      ) : null}
                      {projected && !isCurrent ? (
                        <span className="ml-2 text-micro uppercase text-ink-3">proiecție</span>
                      ) : null}
                      {partial ? (
                        <span className="ml-2 text-micro uppercase text-warn">
                          date parțiale · {cov.withData} din {cov.expected} luni
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`tabular font-semibold ${partial ? "text-ink-3" : bad ? "text-over" : margin < 22 ? "text-warn" : "text-fill"}`}
                    >
                      {partial ? "—" : `${margin.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                    <div className="relative h-2.5 grow overflow-hidden rounded-[1px] bg-sunk">
                      <div
                        className="h-full transition-[width] duration-500 ease-out"
                        style={{
                          width: partial ? "0%" : `${width}%`,
                          background: bad
                            ? "var(--color-over)"
                            : margin < 22
                              ? "var(--color-warn)"
                              : "var(--color-fill)",
                          // proiecțiile se desenează hașurat — nu sunt fapte
                          backgroundImage: projected
                            ? "repeating-linear-gradient(135deg, rgba(255,255,255,0.45) 0 1px, transparent 1px 5px)"
                            : undefined,
                        }}
                      />
                      {/* pragul de marjă, ca linie verticală */}
                      <span
                        aria-hidden
                        className="absolute inset-y-0 w-px bg-ink-3"
                        style={{ left: `${(MARGIN_FLOOR / maxMargin) * 100}%` }}
                      />
                    </div>
                    <span className="w-40 shrink-0 text-right tabular text-micro text-ink-3">
                      {partial
                        ? "prea puține date"
                        : `venit ${formatShort(revenue)} · cost ${formatShort(cost)}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
            <span className="eyebrow">Dacă costurile cresc cu</span>
            {ASSUMPTIONS.map((a) => (
              <Link
                key={a}
                href={`/contracte/${id}/ani?crestere=${a}`}
                className={`rounded-[3px] border px-2 py-0.5 text-tiny tabular transition-colors ${
                  a === growth
                    ? "border-blueprint bg-blueprint text-white"
                    : "border-rule-strong bg-sheet text-ink-2 hover:bg-sunk"
                }`}
              >
                {a}%
              </Link>
            ))}
            <span className="ml-1 text-micro text-ink-3">
              pe an, iar indexarea rămâne {contract.indexationPercent}%
            </span>
          </div>
        </div>

        {belowFloor.length > 0 ? (
          <p className="mt-2.5 border-l-2 border-over bg-over-soft px-3 py-2 text-tiny text-over">
            La creștere de {growth}%, marja scade sub {MARGIN_FLOOR}% în anul{" "}
            {belowFloor.map((r) => r.y.yearNo).join(", ")}.{" "}
            {Number(contract.indexationPercent) === 0
              ? "Contractul nu are indexare — e cel mai expus tip."
              : `Indexarea de ${contract.indexationPercent}% nu acoperă diferența.`}
          </p>
        ) : null}
      </section>

      <section>
        <SectionRule>Detaliu pe ani</SectionRule>
        <Sheet className="mt-2.5">
          <Table>
            <THead>
              <TR>
                <TH>An</TH>
                <TH>Perioadă</TH>
                <TH numeric>Abonament</TH>
                <TH numeric>Venit an</TH>
                <TH numeric>Cost</TH>
                <TH numeric>Marjă</TH>
                <TH>Sursă</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ y, revenue, cost, margin, projected, partial }) => (
                <TR key={y.id}>
                  <TD strong>{y.yearNo}</TD>
                  <TD muted>
                    {y.startDate} → {y.endDate}
                  </TD>
                  <TD numeric>{formatShort(fromDb(y.monthlyValue))}</TD>
                  <TD numeric>{formatShort(revenue)}</TD>
                  <TD numeric>{partial ? "—" : formatShort(cost)}</TD>
                  <TD numeric>
                    <span
                      className={
                        partial
                          ? "text-ink-3"
                          : margin < MARGIN_FLOOR
                            ? "text-over"
                            : margin < 22
                              ? "text-warn"
                              : "text-fill"
                      }
                    >
                      {partial ? "—" : `${margin.toFixed(1)}%`}
                    </span>
                  </TD>
                  <TD muted>{partial ? "date parțiale" : projected ? "proiecție" : "realizat"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Sheet>
      </section>
    </div>
  );
}
