import Link from "next/link";
import { desc, eq, inArray, sql as raw } from "drizzle-orm";

import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { Money } from "@/components/ui/gauge";
import { db } from "@/lib/db";
import { devizLines, devize, objectives, users, workUnits } from "@/lib/db/schema";
import {
  DEVIZ_KIND_LABEL,
  DEVIZ_STATUS_LABEL,
  DEVIZ_STATUS_TONE,
  devizTotals,
} from "@/lib/deviz";
import { formatDay } from "@/lib/equipment";
import { fromDb } from "@/lib/money";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DevizePage({
  searchParams,
}: {
  searchParams: Promise<{ tip?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const showPrices = canSeePrices(session.role);

  const rows = await db
    .select({ deviz: devize, unit: workUnits, objective: objectives, author: users })
    .from(devize)
    .leftJoin(workUnits, eq(devize.workUnitId, workUnits.id))
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .leftJoin(users, eq(devize.createdBy, users.id))
    .where(sp.tip ? raw`${devize.kind} = ${sp.tip}` : undefined)
    .orderBy(desc(devize.createdAt))
    .limit(80);

  // o singură agregare pentru toate devizele de pe ecran, nu una per rând
  const ids = rows.map((r) => r.deviz.id);
  const sums = ids.length
    ? await db
        .select({ devizId: devizLines.devizId, total: raw<string>`sum(${devizLines.total})` })
        .from(devizLines)
        .where(inArray(devizLines.devizId, ids))
        .groupBy(devizLines.devizId)
    : [];
  const subtotalBy = new Map(sums.map((s) => [s.devizId, fromDb(s.total)]));

  const grand = rows.reduce((a, r) => {
    const t = devizTotals(
      subtotalBy.get(r.deviz.id) ?? 0,
      r.deviz.overheadPercent,
      r.deviz.profitPercent,
    );
    return a + t.total;
  }, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comercial"
        title="Devize"
        meta="Devizul client și devizul intern sunt documente diferite, legate N:M. O poziție ofertată se poate executa din trei articole interne — de asta maparea are coeficient, nu bifă."
        actions={
          <Link
            href="/devize/articole"
            className="rounded-[3px] border border-rule-strong bg-sheet px-2.5 py-1 text-tiny text-ink-2 hover:bg-sunk hover:text-ink"
          >
            Articole normate
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip href="/devize" active={!sp.tip} label="Tot" />
        {Object.entries(DEVIZ_KIND_LABEL).map(([key, label]) => (
          <Chip
            key={key}
            href={sp.tip === key ? "/devize" : `/devize?tip=${key}`}
            active={sp.tip === key}
            label={label}
          />
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Niciun deviz"
          hint="Devizul intern se face pe unitatea de lucru și e sursa pachetelor. Cel client e ce vede beneficiarul."
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Unitate de lucru</TH>
                <TH>Obiectiv</TH>
                <TH>Tip</TH>
                <TH numeric>Versiune</TH>
                <TH>Stare</TH>
                <TH>Întocmit</TH>
                {showPrices ? <TH numeric>Subtotal</TH> : null}
                {showPrices ? <TH numeric>Indirecte + profit</TH> : null}
                {showPrices ? <TH numeric>Total</TH> : null}
              </TR>
            </THead>
            <TBody>
              {rows.map(({ deviz, unit, objective, author }) => {
                const subtotal = subtotalBy.get(deviz.id) ?? 0;
                const t = devizTotals(subtotal, deviz.overheadPercent, deviz.profitPercent);
                return (
                  <TR key={deviz.id}>
                    <TD>
                      <Link href={`/devize/${deviz.id}`} className="font-medium hover:text-blueprint">
                        {unit?.code ?? "—"}
                      </Link>
                      <span className="ml-2 text-ink-3">{unit?.title}</span>
                    </TD>
                    <TD muted className="max-w-48 truncate">
                      {objective?.name ?? "—"}
                    </TD>
                    <TD muted>{DEVIZ_KIND_LABEL[deviz.kind]}</TD>
                    <TD numeric muted>
                      v{deviz.version}
                    </TD>
                    <TD>
                      <Badge tone={DEVIZ_STATUS_TONE[deviz.status]}>
                        {DEVIZ_STATUS_LABEL[deviz.status]}
                      </Badge>
                    </TD>
                    <TD muted>
                      {author?.name ?? "—"}
                      <span className="block text-micro text-ink-3">
                        {formatDay(String(deviz.createdAt).slice(0, 10))}
                      </span>
                    </TD>
                    {showPrices ? (
                      <TD numeric muted>
                        <Money value={subtotal} unit={null} />
                      </TD>
                    ) : null}
                    {showPrices ? (
                      <TD numeric muted>
                        {deviz.kind === "client" ? (
                          <Money value={t.overhead + t.profit} unit={null} />
                        ) : (
                          "—"
                        )}
                      </TD>
                    ) : null}
                    {showPrices ? (
                      <TD numeric strong>
                        <Money value={t.total} unit={null} />
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </TBody>
            {showPrices ? (
              <tfoot>
                <TFootRow>
                  <TD colSpan={8}>{rows.length} devize</TD>
                  <TD numeric>
                    <Money value={grand} unit={null} />
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
