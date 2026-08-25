import { submitTeamAttendance } from "@/app/actions/teren-timp";
import { SubmitBar } from "@/components/domain/FieldKit";
import { PickableLine } from "@/components/domain/FieldParts";
import { Block, Empty, FieldBar, Label, Note, longDate } from "@/components/domain/FieldUI";
import { Select } from "@/components/ui/select";
import { todayIso } from "@/lib/field";
import { myTeam, myWorks } from "@/lib/field-data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * T-F3 — pontajul echipei: opt oameni deodată, aceleași ore.
 *
 * Ecranul de pontaj de până acum împărțea ZIUA MEA pe mai multe lucrări. Ăsta rezolvă
 * problema cealaltă, care apare de fapt în fiecare dimineață: șeful are opt oameni pe
 * un singur șantier, toți de la 7:30 la 17:00. Pontat unul câte unul, ar fi opt drumuri
 * prin același formular.
 *
 * Orele ies din intrare minus plecare, nu se scriu de mână: „07:30–17:00" e ce știe omul,
 * „9,5" e ce vrea baza de date, iar scăderea o poate face calculatorul.
 */
export default async function PontajEchipaPage({
  searchParams,
}: {
  searchParams: Promise<{ ul?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const [works, team] = await Promise.all([myWorks(session.id), myTeam(session.id)]);
  const today = todayIso();

  if (works.length === 0) {
    return (
      <Empty icon="build" title="Nicio lucrare deschisă">
        Pontajul se pune pe o lucrare. Fără ea, orele n-ar avea pe ce cădea.
      </Empty>
    );
  }

  return (
    <form action={submitTeamAttendance}>
      <FieldBar title="Pontaj de azi" sub={longDate(new Date())} back="/teren/pontaj" />

      <Label>Programul zilei</Label>
      <Block>
        <div className="f-fld">
          <label htmlFor="day">Data</label>
          <input id="day" name="day" type="date" defaultValue={today} />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="f-fld" style={{ flex: 1 }}>
            <label htmlFor="fromTime">Intrare</label>
            <input id="fromTime" name="fromTime" type="time" defaultValue="07:30" />
          </div>
          <div className="f-fld" style={{ flex: 1 }}>
            <label htmlFor="toTime">Plecare</label>
            <input id="toTime" name="toTime" type="time" defaultValue="17:00" />
          </div>
        </div>
        <div className="f-fld">
          <label htmlFor="workUnitId">Unde ați lucrat</label>
          <Select tone="field" id="workUnitId" name="workUnitId" defaultValue={sp.ul ?? works[0]?.id}>
            {works.map((work) => (
              <option key={work.id} value={work.id}>
                {work.title} — {work.objectiveName}
              </option>
            ))}
          </Select>
        </div>
      </Block>

      <Label>Cine a fost din echipa mea</Label>
      {team.length === 0 ? (
        <Empty icon="users" title="Echipa e goală">
          Oamenii se adaugă la birou, în nomenclatorul de utilizatori.
        </Empty>
      ) : (
        <Block>
          {team.map((person) => (
            <TeamMember
              key={person.id}
              id={person.id}
              name={person.name}
              qualification={person.qualification}
              me={person.id === session.id}
            />
          ))}
        </Block>
      )}

      <Note>
        Fiecare om primește rândul lui în pontaj, la calificarea lui. Un rând colectiv ar face
        costul de manoperă o medie — electricianul și necalificatul nu costă la fel.
      </Note>

      <SubmitBar label="Trimite pontajul" hint="Orele intră în pontaj și în costul lucrării." />
    </form>
  );
}

/** Un om bifabil. Bifa e mare pentru că se apasă cu mănuși, în frig, la 7:25 dimineața. */
function TeamMember({
  id,
  name,
  qualification,
  me,
}: {
  id: string;
  name: string;
  qualification: string | null;
  me: boolean;
}) {
  return (
    <PickableLine
      id={id}
      name={name}
      meta={[qualification ?? "muncitor", me ? "eu" : null].filter(Boolean).join(" · ")}
      unit="prezent"
      defaultChecked={me}
      fieldName="userId"
      withQuantity={false}
    />
  );
}
