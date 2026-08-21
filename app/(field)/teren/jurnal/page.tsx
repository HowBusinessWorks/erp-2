import { asc, desc, eq, inArray } from "drizzle-orm";

import { submitJournal } from "@/app/actions/field";
import { SubmitBar } from "@/components/domain/FieldKit";
import { Block, Empty, FieldBar, Label, longDate, shortDate } from "@/components/domain/FieldUI";
import { db } from "@/lib/db";
import { objectives, siteJournalEntries, workUnits } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const WEATHER = ["senin", "înnorat", "ploaie", "vânt", "ger", "caniculă"];

/**
 * T6 — jurnalul de șantier.
 *
 * Se deschide GATA DE SCRIS: cursorul e deja în câmpul de text, lucrarea e
 * precompletată din locul de unde ai venit, vremea are butoane. Trimite e singura
 * atingere pe care o mai faci.
 */
export default async function JurnalPage({
  searchParams,
}: {
  searchParams: Promise<{ ul?: string }>;
}) {
  await requireSession();
  const sp = await searchParams;

  const rows = await db
    .select({ unit: workUnits, objective: objectives })
    .from(workUnits)
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(inArray(workUnits.status, ["planificata", "in_lucru"]))
    .orderBy(asc(workUnits.code))
    .limit(30);

  const selected = sp.ul ?? rows[0]?.unit.id ?? "";
  const place = rows.find((r) => r.unit.id === selected);

  const recent = selected
    ? await db
        .select()
        .from(siteJournalEntries)
        .where(eq(siteJournalEntries.workUnitId, selected))
        .orderBy(desc(siteJournalEntries.day))
        .limit(3)
    : [];

  return (
    <>
      <form action={submitJournal}>
        <FieldBar
          title="Jurnal de șantier"
          sub={`${longDate(new Date())}${place?.objective ? ` · ${place.objective.name}` : ""}`}
          back="/teren"
        />

        <h2 className="f-q">Ce s-a lucrat azi?</h2>
        <p className="f-qs">Scrie pe scurt, cum i-ai spune unui coleg la telefon.</p>

        <Block>
          <div className="f-fld">
            <textarea
              name="text"
              required
              autoFocus
              placeholder="Ex: s-a montat polistiren pe fațada de nord, tronsonul 2, cam 180 mp"
            />
          </div>
        </Block>

        <Label>Vremea</Label>
        <div className="f-chz">
          {WEATHER.map((weather, i) => (
            <label key={weather}>
              <input type="radio" name="weather" value={weather} defaultChecked={i === 0} />
              <span>{weather}</span>
            </label>
          ))}
        </div>

        <Label>Detalii</Label>
        <Block>
          <div className="f-fld">
            <label htmlFor="people">Câți oameni au fost</label>
            <input id="people" name="people" inputMode="numeric" defaultValue="3" />
          </div>
          <div className="f-fld">
            <label htmlFor="blocker">Ce a blocat lucrul</label>
            <input id="blocker" name="blocker" placeholder="Gol dacă nimic" />
          </div>
          <div className="f-fld">
            <label htmlFor="workUnitId">Lucrarea</label>
            <select id="workUnitId" name="workUnitId" defaultValue={selected}>
              {rows.map(({ unit, objective }) => (
                <option key={unit.id} value={unit.id}>
                  {objective?.name ?? unit.title} — {unit.code}
                </option>
              ))}
            </select>
          </div>
        </Block>

        <SubmitBar label="Salvează în jurnal" />
      </form>

      <Label>Ultimele însemnări</Label>
      {recent.length === 0 ? (
        <Empty icon="file" title="Jurnalul e gol">
          Prima însemnare de pe lucrarea asta o scrii tu, acum.
        </Empty>
      ) : (
        recent.map((entry) => (
          <div key={entry.id} className="f-jc">
            <div className="f-h">
              <b style={{ fontSize: 16 }}>{shortDate(entry.day)}</b>
              {entry.weather ? <span className="f-pil">{entry.weather}</span> : null}
            </div>
            <p>{entry.text}</p>
            <div className="f-m">
              {entry.peopleCount ? <span>{entry.peopleCount} oameni</span> : null}
              {entry.blocker ? (
                <span style={{ color: "var(--f-rd)", fontWeight: 700 }}>blocaj: {entry.blocker}</span>
              ) : (
                <span style={{ color: "var(--f-gr)", fontWeight: 700 }}>fără blocaje</span>
              )}
            </div>
          </div>
        ))
      )}
    </>
  );
}
