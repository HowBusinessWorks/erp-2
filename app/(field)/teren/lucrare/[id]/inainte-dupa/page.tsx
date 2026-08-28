import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { declareWorkPhotos } from "@/app/actions/teren-acte";
import { Icon } from "@/components/domain/FieldIcons";
import { SubmitBar } from "@/components/domain/FieldKit";
import { ChipPick, PhotoDeck } from "@/components/domain/FieldParts";
import { Alert, Block, FieldBar, Label, Pill } from "@/components/domain/FieldUI";
import { db } from "@/lib/db";
import { mediaSlots, workUnits } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * ÎNAINTE și DUPĂ — două seturi de poze, nu două etape de lucru.
 *
 * Cum arăta la început și cum arată la final e ce se folosește la recepție și la
 * următoarea ofertă. De asta stau ca rânduri proprii în `media_slots`, cu unghi pe
 * fiecare (N, S, E, V): „fă pozele din aceleași unghiuri" nu se poate cere dacă
 * nimeni nu ține minte din ce unghiuri s-au făcut primele.
 */
export default async function InainteDupaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ slot?: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const slot = sp.slot === "dupa" ? "dupa" : "inainte";

  const [unit] = await db.select().from(workUnits).where(eq(workUnits.id, id)).limit(1);
  if (!unit) notFound();

  const [before, after] = await Promise.all([
    db
      .select()
      .from(mediaSlots)
      .where(and(eq(mediaSlots.workUnitId, id), eq(mediaSlots.slot, "inainte")))
      .orderBy(asc(mediaSlots.createdAt)),
    db
      .select()
      .from(mediaSlots)
      .where(and(eq(mediaSlots.workUnitId, id), eq(mediaSlots.slot, "dupa")))
      .orderBy(asc(mediaSlots.createdAt)),
  ]);

  const sets = [
    { key: "inainte", title: "Înainte", rows: before },
    { key: "dupa", title: "După", rows: after },
  ];

  return (
    <form action={declareWorkPhotos}>
      <input type="hidden" name="workUnitId" value={id} />

      <FieldBar title="Înainte & După" sub={unit.title} back={`/teren/lucrare/${id}`} />

      <Alert tone="b" icon="info" title="Prima și ultima etapă sunt doar poze">
        Cum arăta la început și cum arată la final. Se folosesc la recepție și la oferte.
      </Alert>

      {sets.map((set) => (
        <div key={set.key}>
          <Label>
            {set.title}
            <span style={{ float: "right", textTransform: "none", letterSpacing: 0 }}>
              {set.rows.length} {set.rows.length === 1 ? "fișier" : "fișiere"}
            </span>
          </Label>
          {set.rows.length === 0 ? (
            <Block padded>
              <p className="f-xs f-mut" style={{ margin: 0 }}>
                {set.key === "dupa"
                  ? "Fă pozele din aceleași unghiuri ca la „Înainte”."
                  : "Niciun fișier încă."}
              </p>
            </Block>
          ) : (
            <div className="f-blk f-p">
              <div className="f-phs">
                {set.rows.map((row) => (
                  <div key={row.id} className="f-ph">
                    <Icon name={row.kind === "video" ? "video" : "img"} />
                    <span className="f-tg">{row.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <Label>Adaugă în setul</Label>
      <div className="f-pad" style={{ paddingTop: 0 }}>
        <ChipPick
          name="slot"
          value={slot}
          options={[
            { value: "inainte", label: "Înainte" },
            { value: "dupa", label: "După" },
          ]}
        />
      </div>

      <Label>Unghiul</Label>
      <div className="f-pad" style={{ paddingTop: 0 }}>
        <ChipPick
          name="label"
          value="N"
          options={[
            { value: "N", label: "Nord" },
            { value: "S", label: "Sud" },
            { value: "E", label: "Est" },
            { value: "V", label: "Vest" },
          ]}
        />
      </div>

      <Label>Poze și filmări</Label>
      <PhotoDeck />

      <div style={{ padding: "12px 16px 0" }}>
        <Pill tone="n">
          {before.length} înainte · {after.length} după
        </Pill>
      </div>

      <SubmitBar
        label="Adaugă în set"
        hint="Fișierele se declară acum; conținutul se încarcă la sincronizare."
      />
    </form>
  );
}
