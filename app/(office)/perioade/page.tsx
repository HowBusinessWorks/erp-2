import { notFound } from "next/navigation";
import { sql as raw } from "drizzle-orm";

import { closePeriod, reopenPeriod } from "@/app/actions/periods";
import { Button, PageHeader, SectionRule } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import { costEntries, firms, periods } from "@/lib/db/schema";
import { formatShort, fromDb } from "@/lib/money";
import { MONTHS_SHORT, currentPeriod, lastPeriods } from "@/lib/period";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Închiderea de perioadă (§21, punctul 1 — critic).
 *
 * Nu e o funcționalitate de raportare. E **precondiția regulii §13.1**: când muți
 * finanțarea unei unități de lucru, comportamentul diferă după cum luna e deschisă
 * (se rescrie `charged_*`) sau închisă (se emite document de realocare). Fără
 * mecanismul ăsta, regula de mutare n-are pe ce să se sprijine.
 *
 * În prototip: buton + flag. În producție: blocaje reale + audit trail (PLAN.md §7).
 */
export default async function PerioadePage() {
  const session = await requireSession();
  if (!can(session.role, "perioada.inchide")) notFound();

  const firmRows = await db.select().from(firms).orderBy(firms.name);
  const periodRows = await db.select().from(periods);
  const months = lastPeriods(10);
  const now = currentPeriod();

  const costAgg = await db
    .select({
      firmId: costEntries.firmId,
      ym: raw<string>`to_char(${costEntries.effectDate}, 'YYYY-MM')`,
      total: raw<string>`sum(${costEntries.value})`,
    })
    .from(costEntries)
    .groupBy(costEntries.firmId, raw`to_char(${costEntries.effectDate}, 'YYYY-MM')`);

  const key = (firmId: string, y: number, m: number) => `${firmId}|${y}-${String(m).padStart(2, "0")}`;
  const closedMap = new Map(
    periodRows.map((p) => [key(p.firmId, p.year, p.month), p.closedAt]),
  );
  const costMap = new Map(costAgg.map((c) => [`${c.firmId}|${c.ym}`, fromDb(c.total)]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Evidență"
        title="Închiderea de perioadă"
        meta="Cât timp luna e deschisă, mutarea finanțării rescrie liniile de cost. După închidere, se emite document de realocare în luna curentă, iar liniile rămân datate în luna lor."
      />

      <section>
        <SectionRule right={`ultimele ${months.length} luni`}>Stare pe firmă și lună</SectionRule>
        <Sheet className="mt-2.5">
          <Table>
            <THead>
              <TR>
                <TH>Firmă</TH>
                {months.map((m) => (
                  <TH key={`${m.year}-${m.month}`} numeric>
                    {MONTHS_SHORT[m.month - 1]}
                    <span className="ml-0.5 text-ink-3">{String(m.year).slice(2)}</span>
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {firmRows.map((firm) => (
                <TR key={firm.id}>
                  <TD strong className="whitespace-nowrap">
                    {firm.name}
                  </TD>
                  {months.map((m) => {
                    const closed = Boolean(closedMap.get(key(firm.id, m.year, m.month)));
                    const cost = costMap.get(`${firm.id}|${m.year}-${String(m.month).padStart(2, "0")}`) ?? 0;
                    const isFuture = m.year > now.year || (m.year === now.year && m.month > now.month);
                    return (
                      <TD key={`${m.year}-${m.month}`} numeric>
                        {isFuture ? (
                          <span className="text-ink-3">—</span>
                        ) : (
                          <form
                            action={
                              closed
                                ? reopenPeriod.bind(null, firm.id, m.year, m.month)
                                : closePeriod.bind(null, firm.id, m.year, m.month)
                            }
                          >
                            <button
                              type="submit"
                              title={`${cost > 0 ? `${formatShort(cost)} lei în registru · ` : ""}${closed ? "Redeschide luna" : "Închide luna"}`}
                              className={`w-full rounded-[2px] border px-1.5 py-1 text-micro tabular transition-colors ${
                                closed
                                  ? "border-rule-strong bg-sunk text-ink-3 hover:border-warn/40 hover:bg-warn-soft hover:text-warn"
                                  : "border-fill/30 bg-fill-soft text-fill hover:bg-fill hover:text-white"
                              }`}
                            >
                              {closed ? "închisă" : "deschisă"}
                            </button>
                          </form>
                        )}
                      </TD>
                    );
                  })}
                </TR>
              ))}
            </TBody>
          </Table>
        </Sheet>
        <p className="mt-2 text-micro text-ink-3">
          Apasă pe o celulă ca să schimbi starea lunii. Valoarea din registru pentru luna
          respectivă apare la trecerea cu mouse-ul.
        </p>
      </section>

      <section>
        <SectionRule>De ce contează</SectionRule>
        <div className="mt-2.5 grid gap-3 md:grid-cols-2">
          <div className="border border-rule bg-sheet px-4 py-3">
            <div className="font-narrow text-[0.8125rem] font-semibold uppercase tracking-wide text-fill">
              Lună deschisă
            </div>
            <p className="mt-1 text-tiny leading-relaxed text-ink-2">
              Mutarea finanțării unei unități de lucru rescrie direct{" "}
              <code className="text-ink">contract_descărcat</code> și{" "}
              <code className="text-ink">componentă_descărcat</code> pe liniile de cost existente.
              Simplu, direct, cu urmă în audit.
            </p>
          </div>
          <div className="border border-rule bg-sheet px-4 py-3">
            <div className="font-narrow text-[0.8125rem] font-semibold uppercase tracking-wide text-ink-2">
              Lună închisă
            </div>
            <p className="mt-1 text-tiny leading-relaxed text-ink-2">
              Liniile originale rămân datate în luna lor — nu rescrii o lună deja raportată și
              facturată. Se emite un document de realocare în luna curentă, care scoate valoarea din
              componenta veche și o pune pe cea nouă. Ambele mișcări rămân vizibile.
            </p>
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-tiny text-ink-2">
          Ce nu se schimbă niciodată, în niciunul din cazuri: data documentului și analitica{" "}
          <strong className="text-ink">folosit</strong> — unde s-a întâmplat fizic munca. Istoricul
          obiectivului rămâne intact indiferent de câte ori se mută finanțarea.
        </p>
      </section>
    </div>
  );
}
