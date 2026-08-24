import { asc } from "drizzle-orm";

import { requestTransportFromField } from "@/app/actions/teren-comenzi";
import { SubmitBar } from "@/components/domain/FieldKit";
import { ChipPick } from "@/components/domain/FieldParts";
import { Block, Empty, FieldBar, Label, Note } from "@/components/domain/FieldUI";
import { db } from "@/lib/db";
import { objectives, warehouses } from "@/lib/db/schema";
import { todayIso } from "@/lib/field";
import { myWorks } from "@/lib/field-data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Cererea de transport din teren.
 *
 * O singură entitate, mai multe tipuri, o singură coadă centrală (§18): dusul schelei și
 * căratul molozului sunt aceeași problemă de dispecerat, chiar dacă pe șantier se cer ca
 * două lucruri diferite.
 */

const KINDS = [
  { value: "livrare_material", label: "Adus material" },
  { value: "transfer_santiere", label: "Între șantiere" },
  { value: "evacuare_moloz", label: "Cărat moloz" },
  { value: "retur_magazie", label: "Retur la depozit" },
  { value: "transport_utilaj", label: "Mutat utilaj" },
];

export default async function TransportNouPage({
  searchParams,
}: {
  searchParams: Promise<{ ul?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const [works, places, depots] = await Promise.all([
    myWorks(session.id),
    db
      .select({ id: objectives.id, name: objectives.name })
      .from(objectives)
      .orderBy(asc(objectives.name))
      .limit(60),
    db
      .select({ name: warehouses.name })
      .from(warehouses)
      .orderBy(asc(warehouses.name))
      .limit(20),
  ]);

  if (works.length === 0) {
    return (
      <Empty icon="truck" title="Nicio lucrare deschisă">
        Cursa se cere pentru o lucrare.
      </Empty>
    );
  }

  return (
    <form action={requestTransportFromField}>
      <FieldBar title="Cerere transport" sub="Intră în coada de dispecerat" back="/teren/comenzi/nou" />

      <Label>Ce fel de cursă</Label>
      <div className="f-pad" style={{ paddingTop: 0 }}>
        <ChipPick name="kind" value={KINDS[0].value} options={KINDS} />
      </div>

      <Label>De unde până unde</Label>
      <Block>
        <div className="f-fld">
          <label htmlFor="fromText">Se ia de la</label>
          <input
            id="fromText"
            name="fromText"
            list="depozite"
            defaultValue={depots[0]?.name ?? ""}
            placeholder="Ex: Depozit central"
          />
          <datalist id="depozite">
            {depots.map((depot) => (
              <option key={depot.name} value={depot.name} />
            ))}
          </datalist>
        </div>
        <div className="f-fld">
          <label htmlFor="toObjectiveId">Se duce la</label>
          <select id="toObjectiveId" name="toObjectiveId" defaultValue="">
            <option value="">— scriu eu mai jos —</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </div>
        <div className="f-fld">
          <label htmlFor="toText">Sau adresa</label>
          <input id="toText" name="toText" placeholder="Ex: Rampa ecologică Glina" />
        </div>
      </Block>

      <Label>Când și ce</Label>
      <Block>
        <div className="f-fld">
          <label htmlFor="day">Data</label>
          <input id="day" name="day" type="date" defaultValue={todayIso()} />
        </div>
        <div className="f-fld">
          <label htmlFor="workUnitId">Pentru ce lucrare</label>
          <select id="workUnitId" name="workUnitId" defaultValue={sp.ul ?? works[0].id}>
            {works.map((work) => (
              <option key={work.id} value={work.id}>
                {work.title} — {work.objectiveName}
              </option>
            ))}
          </select>
        </div>
        <div className="f-fld">
          <label htmlFor="description">Ce se transportă</label>
          <textarea
            id="description"
            name="description"
            placeholder="Ex: 3 travee schelă + podine, cam 1,2 tone"
          />
        </div>
      </Block>

      <Note>Scrie și tonajul dacă îl știi — de el atârnă ce mașină se trimite.</Note>

      <SubmitBar label="Trimite cererea" />
    </form>
  );
}
