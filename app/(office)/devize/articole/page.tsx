import Link from "next/link";
import { desc, sql as raw } from "drizzle-orm";

import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Money } from "@/components/ui/gauge";
import { db } from "@/lib/db";
import { devizLines, normedArticles } from "@/lib/db/schema";
import { fromDb } from "@/lib/money";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ArticolePage() {
  const session = await requireSession();
  const showPrices = canSeePrices(session.role);

  const [rows, usage] = await Promise.all([
    db.select().from(normedArticles).orderBy(desc(normedArticles.usageCount)),
    db
      .select({ articleId: devizLines.normedArticleId, n: raw<string>`count(*)` })
      .from(devizLines)
      .where(raw`${devizLines.normedArticleId} is not null`)
      .groupBy(devizLines.normedArticleId),
  ]);

  const usedBy = new Map(usage.map((u) => [u.articleId!, Number(u.n)]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/devize" className="hover:text-blueprint">
            ‹ Devize
          </Link>
        }
        title="Articole normate"
        meta="Biblioteca nu se construiește dintr-un import de 4.000 de rânduri pe care nu-i deschide nimeni, ci din pozițiile pe care devizierul le-a scris deja o dată. Numărul de folosiri spune care merită păstrate."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Biblioteca e goală"
          hint="Se umple din butonul „salvează poziția ca articol”, din devizul intern."
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Cod</TH>
                <TH>Denumire</TH>
                <TH>Categorie</TH>
                <TH>UM</TH>
                <TH numeric>Ore manoperă</TH>
                <TH>Calificare</TH>
                {showPrices ? <TH numeric>Cost material</TH> : null}
                <TH numeric>Folosit</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((a) => {
                const n = usedBy.get(a.id) ?? a.usageCount;
                return (
                  <TR key={a.id}>
                    <TD className="font-medium">{a.code}</TD>
                    <TD className="max-w-80">{a.name}</TD>
                    <TD muted>{a.category ?? "—"}</TD>
                    <TD muted>{a.unit}</TD>
                    <TD numeric>{Number(a.laborHours ?? 0)}</TD>
                    <TD muted>{a.qualification ?? "—"}</TD>
                    {showPrices ? (
                      <TD numeric muted>
                        <Money value={fromDb(a.materialCost)} unit={null} />
                      </TD>
                    ) : null}
                    <TD numeric>
                      <span className={n === 0 ? "text-ink-3" : undefined}>
                        {n === 0 ? "—" : `${n}×`}
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Sheet>
      )}

      <p className="max-w-prose text-micro text-ink-3">
        Un articol cu 0 folosiri e un articol pe care cineva l-a salvat o dată și nu l-a mai
        deschis. La lustruire merită ascunse, nu șterse: cineva tot îl caută odată pe an.
      </p>
    </div>
  );
}
