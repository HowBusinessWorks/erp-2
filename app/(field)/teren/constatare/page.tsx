import { asc, eq, inArray } from "drizzle-orm";

import { submitObservation } from "@/app/actions/field";
import { SubmitBar } from "@/components/domain/FieldKit";
import { Block, FieldBar, Label, Note } from "@/components/domain/FieldUI";
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
    <form action={submitObservation}>
      <input type="hidden" name="workUnitId" value={unit?.id ?? ""} />

      <FieldBar title="Constatare" sub="Ce ai văzut și trebuie rezolvat" back="/teren" />

      <h2 className="f-q">Ce ai văzut?</h2>
      <p className="f-qs">Scrie simplu, ca într-un mesaj. Biroul decide ce se face.</p>

      <Block>
        <div className="f-fld">
          <label htmlFor="title">Pe scurt</label>
          <input
            id="title"
            name="title"
            required
            autoFocus
            placeholder="Ex: burlan spart la colțul clădirii"
          />
        </div>
        <div className="f-fld">
          <label htmlFor="description">Detalii</label>
          <textarea id="description" name="description" placeholder="Opțional" />
        </div>
      </Block>

      <Label>Unde</Label>
      <Block>
        <div className="f-fld">
          <select
            name="objectiveId"
            defaultValue={unit?.objectiveId ?? objectiveRows[0]?.id}
            aria-label="Obiectivul"
          >
            {objectiveRows.map((objective) => (
              <option key={objective.id} value={objective.id}>
                {objective.name} — {objective.code}
              </option>
            ))}
          </select>
        </div>
      </Block>

      <Note>
        Ajunge la birou, care decide dacă e intervenție pe mentenanță, lucrare din Delta
        sau ofertă separată. Vezi răspunsul în „Cererile mele".
      </Note>

      <SubmitBar label="Trimite constatarea" />
    </form>
  );
}
