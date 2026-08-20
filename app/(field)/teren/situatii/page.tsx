import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";

import { FieldHeader } from "@/components/domain/FieldKit";
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
      pkg: packages,
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
  for (const l of lines) {
    if (l.verdict === "neverificat") left.set(l.situatieId, (left.get(l.situatieId) ?? 0) + 1);
  }

  return (
    <div className="px-4 py-4">
      <FieldHeader
        eyebrow="Verificare"
        title="Situații de verificat"
        meta={`${rows.length} ${rows.length === 1 ? "situație declarată" : "situații declarate"}`}
      />

      <div className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <p className="border border-dashed border-rule-strong px-4 py-6 text-tiny text-ink-2">
            Nimic de verificat acum. Situațiile apar aici după ce subcontractantul le declară.
          </p>
        ) : (
          rows.map(({ sl, subcontractor, objective }) => {
            const todo = left.get(sl.id) ?? 0;
            return (
              <Link
                key={sl.id}
                href={`/teren/situatii/${sl.id}`}
                className="block border border-rule-strong bg-sheet px-4 py-3 active:bg-sunk"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-narrow text-[1rem] font-semibold text-ink">
                    {subcontractor?.name ?? "—"}
                  </span>
                  <span className="shrink-0 tabular text-tiny text-ink-2">{sl.code ?? ""}</span>
                </div>
                <div className="mt-1 text-tiny text-ink-2">
                  {objective?.name ?? "—"} · {MONTHS[sl.month - 1]} {sl.year}
                </div>
                <div className="mt-1.5 text-tiny">
                  {todo === 0 ? (
                    <span className="text-fill">tot verificat</span>
                  ) : (
                    <span className="font-medium text-warn">
                      {todo} {todo === 1 ? "poziție" : "poziții"} de verificat
                    </span>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
