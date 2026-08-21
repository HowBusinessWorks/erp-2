import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";

import { Icon } from "@/components/domain/FieldIcons";
import { Block, Empty, FieldBar, Note, Pill } from "@/components/domain/FieldUI";
import { db } from "@/lib/db";
import { objectives, packages, partners, situatiiLucrari, slLines, workUnits } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const MONTHS = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

/**
 * T8 — situațiile de verificat.
 *
 * **Zero prețuri pe ecran.** Șeful de șantier confirmă cantități: dacă s-au turnat
 * 40 sau 32 de metri pătrați. Dacă ar vedea și valoarea, verificarea ar deveni o
 * negociere — iar el nu negociază, el a fost acolo.
 */
export default async function TerenSituatiiPage() {
  await requireSession();

  const rows = await db
    .select({
      sl: situatiiLucrari,
      subcontractor: partners,
      objective: objectives,
    })
    .from(situatiiLucrari)
    .leftJoin(packages, eq(situatiiLucrari.packageId, packages.id))
    .leftJoin(partners, eq(packages.subcontractorId, partners.id))
    .leftJoin(workUnits, eq(packages.workUnitId, workUnits.id))
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(eq(situatiiLucrari.status, "declarata"))
    .orderBy(desc(situatiiLucrari.year), desc(situatiiLucrari.month))
    .limit(20);

  const ids = rows.map((r) => r.sl.id);
  const lines = ids.length
    ? await db
        .select({ situatieId: slLines.situatieId, verdict: slLines.verdict })
        .from(slLines)
        .where(inArray(slLines.situatieId, ids))
    : [];

  const left = new Map<string, number>();
  for (const line of lines) {
    if (line.verdict === "neverificat") {
      left.set(line.situatieId, (left.get(line.situatieId) ?? 0) + 1);
    }
  }
  const todoTotal = [...left.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <FieldBar title="Situații de verificat" sub="Ce au raportat subcontractanții" back="/teren">
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Pill tone={todoTotal > 0 ? "am-solid" : "on-dark"}>
            {todoTotal} {todoTotal === 1 ? "poziție de verificat" : "poziții de verificat"}
          </Pill>
        </div>
      </FieldBar>

      <div style={{ height: 16 }} />

      {rows.length === 0 ? (
        <Empty icon="clip" title="Nimic de verificat acum">
          Situațiile apar aici după ce subcontractantul le declară din portalul lui.
        </Empty>
      ) : (
        <Block>
          {rows.map(({ sl, subcontractor, objective }) => {
            const todo = left.get(sl.id) ?? 0;
            return (
              <Link key={sl.id} href={`/teren/situatii/${sl.id}`} className="f-brow">
                <span className={`f-sq f-${todo > 0 ? "r" : "g"}`}>
                  <Icon name={todo > 0 ? "clip" : "check"} />
                </span>
                <span className="f-tx">
                  <b>{subcontractor?.name ?? "Subcontractant"}</b>
                  <span>
                    {objective?.name ?? "—"} · {MONTHS[sl.month - 1]} {sl.year}
                  </span>
                </span>
                <Pill tone={todo > 0 ? "r" : "g"}>{todo > 0 ? `${todo} de văzut` : "Verificat"}</Pill>
              </Link>
            );
          })}
        </Block>
      )}

      <Note>
        Confirmi cantități, nu bani. Dacă cifra declarată nu se potrivește cu ce s-a
        lucrat, apeși „Nu e așa" și scrii cât a fost de fapt.
      </Note>
    </>
  );
}
