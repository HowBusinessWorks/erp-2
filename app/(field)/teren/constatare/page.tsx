import { asc, eq, inArray } from "drizzle-orm";

import { submitObservation } from "@/app/actions/field";
import { FieldHeader, SubmitBar } from "@/components/domain/FieldKit";
import { db } from "@/lib/db";
import { objectives, workUnits } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Constatarea din teren — intrarea în inboxul de cereri (ecranul 7).
 *
 * Omul din teren nu evaluează, nu rutează, nu deschide lucrare. Scrie ce a văzut și
 * pleacă mai departe. Biroul decide, pe cifre, la ecranul 8.
 */
export default async function ConstatarePage({
  searchParams,
}: {
  searchParams: Promise<{ ul?: string }>;
}) {
  await requireSession();
  const sp = await searchParams;

  const [units, objectiveRows] = await Promise.all([
    db
      .select()
      .from(workUnits)
      .where(inArray(workUnits.status, ["planificata", "in_lucru"]))
      .orderBy(asc(workUnits.code))
      .limit(30),
    db.select().from(objectives).orderBy(asc(objectives.name)).limit(200),
  ]);

  const unit = units.find((u) => u.id === sp.ul) ?? units[0] ?? null;

  return (
    <form action={submitObservation} className="px-4 py-4">
      <input type="hidden" name="workUnitId" value={unit?.id ?? ""} />

      <FieldHeader eyebrow="Constatare" title="Ce ai văzut" />

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="eyebrow mb-1 block">Pe scurt</span>
          <input
            name="title"
            required
            autoFocus
            placeholder="Ex: burlan spart la colțul clădirii"
            className="h-12 w-full rounded-[3px] border border-rule-strong bg-sheet px-3 text-[0.9375rem] text-ink"
          />
        </label>

        <label className="block">
          <span className="eyebrow mb-1 block">Detalii</span>
          <textarea
            name="description"
            rows={3}
            placeholder="Opțional"
            className="w-full rounded-[3px] border border-rule-strong bg-sheet px-3 py-2.5 text-[0.9375rem] leading-relaxed text-ink"
          />
        </label>

        <label className="block">
          <span className="eyebrow mb-1 block">Obiectiv</span>
          <select
            name="objectiveId"
            defaultValue={unit?.objectiveId ?? objectiveRows[0]?.id}
            className="h-11 w-full rounded-[3px] border border-rule-strong bg-sheet px-2 text-[0.875rem] text-ink"
          >
            {objectiveRows.map((objective) => (
              <option key={objective.id} value={objective.id}>
                {objective.code} — {objective.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SubmitBar
        label="Trimite constatarea"
        hint="Ajunge la birou, care decide dacă e intervenție pe mentenanță, lucrare din Delta sau ofertă separată."
      />
    </form>
  );
}
