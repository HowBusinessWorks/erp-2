import { submitSubcontractorAttendance } from "@/app/actions/teren-timp";
import { SubmitBar } from "@/components/domain/FieldKit";
import { QtyStepper } from "@/components/domain/FieldParts";
import { Alert, Block, Empty, FieldBar, Label, Note, Pill, longDate } from "@/components/domain/FieldUI";
import { todayIso } from "@/lib/field";
import { myWorks, subcontractorDay, subcontractorPartners } from "@/lib/field-data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * T-F4 — pontajul subcontractanților.
 *
 * Firmele nu se pontează ca oamenii: nu contează cine a venit de la Termo Fasade, contează
 * că au venit unsprezece și au stat de la 7:30 la 17:00. Cifra care iese — ore-om — e
 * singura cu care se poate contrazice, la sfârșitul lunii, situația de lucrări pe care o
 * trimit ei. De asta ecranul ăsta n-are prețuri și nici nu produce cost: manopera lor
 * intră prin situație, nu prin pontaj.
 *
 * Ziua se REscrie, nu se adaugă. Șeful care corectează la ora 16 „au fost 9, nu 11" trebuie
 * să schimbe cifra, nu să o dubleze.
 */
export default async function PontajFirmePage({
  searchParams,
}: {
  searchParams: Promise<{ ul?: string; zi?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const works = await myWorks(session.id);
  if (works.length === 0) {
    return (
      <Empty icon="build" title="Nicio lucrare deschisă">
        Pontajul firmelor se pune pe o lucrare.
      </Empty>
    );
  }

  const workUnitId = sp.ul && works.some((w) => w.id === sp.ul) ? sp.ul : works[0].id;
  const day = sp.zi ?? todayIso();
  const work = works.find((w) => w.id === workUnitId)!;

  const [partners, existing] = await Promise.all([
    subcontractorPartners(),
    subcontractorDay(workUnitId, day),
  ]);

  const already = new Map(existing.map((row) => [row.partner.id, row.row]));

  const manHours = existing.reduce(
    (sum, row) => sum + row.row.peopleCount * Number(row.row.hoursPerPerson),
    0,
  );

  return (
    <form action={submitSubcontractorAttendance}>
      <input type="hidden" name="workUnitId" value={workUnitId} />
      <input type="hidden" name="day" value={day} />

      <FieldBar
        title="Pontaj subcontractanți"
        sub={`${work.title} · ${longDate(new Date(`${day}T12:00:00`))}`}
        back={`/teren/lucrare/${workUnitId}?f=echipa`}
      >
        {manHours > 0 ? (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Pill tone="am-solid">{manHours} ore-om trecute azi</Pill>
          </div>
        ) : null}
      </FieldBar>

      <Alert tone="b" icon="info" title="Bifează firmele care au fost azi">
        Orele sunt puse din start 07:30–17:00. Le poți schimba la fiecare firmă.
      </Alert>

      {partners.length === 0 ? (
        <Empty icon="users" title="Niciun subcontractant în nomenclator">
          Se adaugă la birou, în lista de parteneri.
        </Empty>
      ) : (
        partners.map((partner) => {
          const row = already.get(partner.id);
          return (
            <div key={partner.id}>
              <input type="hidden" name="partnerId" value={partner.id} />
              <Label>{partner.name}</Label>
              <Block>
                <div className="f-li">
                  <div className="f-tx">
                    <b>A fost azi</b>
                    <span>bifează dacă a avut oameni pe șantier</span>
                  </div>
                  <label className="f-sw">
                    <input
                      type="checkbox"
                      name={`present_${partner.id}`}
                      value="da"
                      defaultChecked={Boolean(row)}
                    />
                    <span />
                  </label>
                </div>
                <div className="f-li">
                  <div className="f-tx">
                    <b>Câți oameni</b>
                  </div>
                  <QtyStepper
                    name={`people_${partner.id}`}
                    defaultValue={row?.peopleCount ?? 0}
                    ariaLabel={`Oameni de la ${partner.name}`}
                  />
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div className="f-fld" style={{ flex: 1 }}>
                    <label htmlFor={`from_${partner.id}`}>Intrare</label>
                    <input
                      id={`from_${partner.id}`}
                      name={`from_${partner.id}`}
                      type="time"
                      defaultValue={row?.fromTime ?? "07:30"}
                    />
                  </div>
                  <div className="f-fld" style={{ flex: 1 }}>
                    <label htmlFor={`to_${partner.id}`}>Plecare</label>
                    <input
                      id={`to_${partner.id}`}
                      name={`to_${partner.id}`}
                      type="time"
                      defaultValue={row?.toTime ?? "17:00"}
                    />
                  </div>
                </div>
                <div className="f-fld">
                  <label htmlFor={`note_${partner.id}`}>Ce au lucrat</label>
                  <input
                    id={`note_${partner.id}`}
                    name={`note_${partner.id}`}
                    defaultValue={row?.note ?? ""}
                    placeholder="Opțional"
                  />
                </div>
              </Block>
            </div>
          );
        })
      )}

      <Note>
        Orele astea se compară automat cu situația de lucrări pe care o trimite firma la
        sfârșit de lună. Fără ele, cuvântul ei e singura sursă.
      </Note>

      <SubmitBar label="Trimite pontajul de azi" hint="Ziua se rescrie întreagă, cu ce e bifat acum." />
    </form>
  );
}
