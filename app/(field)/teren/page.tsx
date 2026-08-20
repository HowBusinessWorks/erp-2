import Link from "next/link";
import { and, desc, eq, inArray, or } from "drizzle-orm";

import { Badge } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { objectives, workUnits } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  inspectie: "Inspecție",
  interventie: "Intervenție",
  lucrare: "Lucrare",
};

export default async function TerenPage() {
  const session = await requireSession();

  const rows = await db
    .select({ unit: workUnits, objective: objectives })
    .from(workUnits)
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(
      and(
        inArray(workUnits.status, ["planificata", "in_lucru", "propusa"]),
        or(eq(workUnits.responsibleId, session.id), eq(workUnits.executant, "propriu")),
      ),
    )
    .orderBy(desc(workUnits.startDate))
    .limit(14);

  return (
    <div className="px-4 py-4">
      <div className="eyebrow">Azi</div>
      <h1 className="mt-1 font-narrow text-xl font-semibold tracking-tight text-ink">
        {new Intl.DateTimeFormat("ro-RO", { weekday: "long", day: "numeric", month: "long" }).format(
          new Date(),
        )}
      </h1>

      {/* Pe teren se văd cantități, stări, ore — niciun leu. Nu e o setare de rol,
          e o constrângere de proiectare (§18.1.1, §21.8). */}
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {rows.length === 0 ? (
          <li className="py-8 text-tiny text-ink-2">
            Nu ai nimic deschis. Deschide o inspecție cu butonul ＋.
          </li>
        ) : (
          rows.map(({ unit, objective }) => (
            <li key={unit.id}>
              <Link href={`/teren/${unit.id}`} className="block py-3 active:bg-sunk">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium text-ink">{unit.title}</span>
                  <Badge tone={unit.kind === "lucrare" ? "blueprint" : "neutral"}>
                    {KIND_LABEL[unit.kind]}
                  </Badge>
                </div>
                <div className="mt-0.5 text-tiny text-ink-2">
                  {objective?.name ?? "—"} · {unit.code}
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>

      {/* ＋ costă o atingere, alegerea acțiunii încă una. Ecranul de sub are voie
          la una singură: Trimite. */}
      <div className="fixed bottom-16 right-4 z-30">
        <button
          type="button"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blueprint text-2xl font-light text-white shadow-[0_6px_20px_-6px_rgba(24,20,16,0.5)]"
          aria-label="Adaugă"
        >
          ＋
        </button>
      </div>
    </div>
  );
}
