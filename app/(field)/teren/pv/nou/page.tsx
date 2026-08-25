import { asc, eq, inArray } from "drizzle-orm";

import { createFieldPv } from "@/app/actions/teren-acte";
import { ActionButton } from "@/components/domain/FieldKit";
import { PhotoDeck, PickableLine, SignaturePad } from "@/components/domain/FieldParts";
import { Block, Empty, FieldBar, Label, Note } from "@/components/domain/FieldUI";
import { Select } from "@/components/ui/select";
import { db } from "@/lib/db";
import { users, workUnitStages } from "@/lib/db/schema";
import { todayIso } from "@/lib/field";
import { myWorks, pvTemplateList } from "@/lib/field-data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Proces verbal nou, făcut de pe șantier.
 *
 * Semnătura se desenează cu degetul și pleacă ca imagine în același câmp folosit și de
 * semnarea prin link tokenizat de la birou. Un al doilea mecanism de semnat, doar pentru
 * că omul e pe telefon, ar însemna două feluri de PV semnat în aceeași bază — și, la
 * prima dispută, două răspunsuri diferite la întrebarea „cine a semnat".
 *
 * Ecranul nu știe unde cade fiecare câmp pe pagina A4: asta o decide șablonul, prin
 * câmpurile lui procentuale (ecranul 33).
 */
export default async function PvNouPage({
  searchParams,
}: {
  searchParams: Promise<{ ul?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const [works, templates] = await Promise.all([myWorks(session.id), pvTemplateList()]);

  if (templates.length === 0) {
    return (
      <Empty icon="pen" title="Niciun șablon de proces verbal">
        Șabloanele se încarcă la birou, pe ecranul de documente.
      </Empty>
    );
  }

  const workUnitId = sp.ul && works.some((w) => w.id === sp.ul) ? sp.ul : works[0]?.id;

  const [stages, colleagues] = await Promise.all([
    workUnitId
      ? db
          .select()
          .from(workUnitStages)
          .where(eq(workUnitStages.workUnitId, workUnitId))
          .orderBy(asc(workUnitStages.position))
      : Promise.resolve([]),
    db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(inArray(users.role, ["pm", "admin", "sef_santier"]))
      .orderBy(asc(users.name))
      .limit(20),
  ]);

  return (
    <form action={createFieldPv}>
      <input type="hidden" name="workUnitId" value={workUnitId ?? ""} />

      <FieldBar
        title="Proces verbal nou"
        sub="Se semnează pe loc, cu degetul"
        back={workUnitId ? `/teren/lucrare/${workUnitId}?f=acte` : "/teren"}
      />

      <Label>Ce fel de proces verbal</Label>
      <Block>
        <div className="f-fld">
          <label htmlFor="templateId">Șablon</label>
          <Select tone="field" id="templateId" name="templateId" defaultValue={templates[0].id}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="f-fld">
          <label htmlFor="day">Data</label>
          <input id="day" name="day" type="date" defaultValue={todayIso()} />
        </div>
        {stages.length > 0 ? (
          <div className="f-fld">
            <label htmlFor="stageName">Etapa</label>
            <Select tone="field" id="stageName" name="stageName" defaultValue={stages[0].name}>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.name}>
                  {stage.position}. {stage.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="f-fld">
          <label htmlFor="subject">Obiectul procesului verbal</label>
          <textarea
            id="subject"
            name="subject"
            required
            placeholder="Ex: se predă frontul de lucru pentru tronsonul 2, fațada nord, etajele 1–5"
          />
        </div>
      </Block>

      <Label>Poze</Label>
      <PhotoDeck />

      <Label>Cine semnează</Label>
      <Block>
        {colleagues.map((person) => (
          <PickableLine
            key={person.id}
            id={person.name}
            name={person.name}
            meta={person.id === session.id ? "eu" : person.role.replace(/_/g, " ")}
            unit="semnatar"
            fieldName="signer"
            withQuantity={false}
            defaultChecked={person.id === session.id}
          />
        ))}
      </Block>

      <Label>Semnătura mea</Label>
      <div className="f-blk f-p">
        <SignaturePad />
      </div>

      <Note>
        Fără semnătură, procesul verbal rămâne ciornă. Cu semnătură, pleacă mai departe la
        ceilalți semnatari.
      </Note>

      <div className="f-bts">
        <ActionButton label="Semnează și trimite" variant="pri" small={false} icon="check" />
      </div>
    </form>
  );
}
