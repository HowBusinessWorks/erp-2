import { and, asc, eq, inArray, or } from "drizzle-orm";

import { submitTimesheet } from "@/app/actions/field";
import { SubmitBar } from "@/components/domain/FieldKit";
import { Block, Empty, FieldBar, Label, Note, longDate } from "@/components/domain/FieldUI";
import { db } from "@/lib/db";
import { objectives, timesheets, workUnits } from "@/lib/db/schema";
import { todayIso } from "@/lib/field";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const QUALIFICATIONS = [
  { value: "muncitor", label: "Muncitor" },
  { value: "electrician", label: "Electrician" },
  { value: "instalator", label: "Instalator" },
  { value: "sef_santier", label: "Șef de șantier" },
];

/**
 * T5 — pontaj.
 *
 * Ziua se împarte pe mai multe unități de lucru, pe același ecran. Dacă nu se poate
 * împărți, cineva pune opt ore pe o singură lucrare când a lucrat la trei, iar costul
 * de manoperă al fiecăreia devine ficțiune.
 *
 * O singură atingere aici: Trimite. Câmpurile de ore sunt mari, cu tastatură numerică.
 */
export default async function PontajPage() {
  const session = await requireSession();
  const today = todayIso();

  const [rows, existing] = await Promise.all([
    db
      .select({ unit: workUnits, objective: objectives })
      .from(workUnits)
      .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
      .where(
        and(
          inArray(workUnits.status, ["planificata", "in_lucru"]),
          or(eq(workUnits.responsibleId, session.id), eq(workUnits.executant, "propriu")),
        ),
      )
      .orderBy(asc(workUnits.code))
      .limit(10),
    db
      .select()
      .from(timesheets)
      .where(and(eq(timesheets.userId, session.id), eq(timesheets.day, today))),
  ]);

  const alreadyBy = new Map<string, number>();
  for (const entry of existing) {
    alreadyBy.set(entry.workUnitId, (alreadyBy.get(entry.workUnitId) ?? 0) + Number(entry.hours));
  }
  const total = existing.reduce((sum, entry) => sum + Number(entry.hours), 0);

  return (
    <form action={submitTimesheet}>
      <input type="hidden" name="day" value={today} />

      <FieldBar
        title="Pontajul de azi"
        sub={longDate(new Date())}
        back="/teren/eu"
      >
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <div className="f-stat-dark">
            <div className="f-n">{total}</div>
            <div className="f-l">ore pontate azi</div>
          </div>
          <div className="f-stat-dark">
            <div className="f-n">{rows.length}</div>
            <div className="f-l">lucrări deschise</div>
          </div>
        </div>
      </FieldBar>

      <Label>Calificare</Label>
      <Block>
        <div className="f-fld">
          <label htmlFor="qualification">Cum ai lucrat azi</label>
          <select id="qualification" name="qualification" defaultValue="muncitor">
            {QUALIFICATIONS.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </div>
      </Block>

      <Label>Câte ore, pe fiecare lucrare</Label>
      {rows.length === 0 ? (
        <Empty icon="clock" title="Nu ai lucrări deschise">
          Pontajul se pune pe o unitate de lucru. Când biroul îți atribuie una, apare aici.
        </Empty>
      ) : (
        <Block>
          {rows.map(({ unit, objective }) => (
            <div key={unit.id} className="f-li">
              <input type="hidden" name="workUnitId" value={unit.id} />
              <div className="f-tx">
                <b>{unit.title}</b>
                <span>
                  {objective?.name ?? "—"} · {unit.code}
                  {alreadyBy.has(unit.id) ? ` · ${alreadyBy.get(unit.id)} ore deja` : ""}
                </span>
              </div>
              <input
                className="f-num"
                name={`hours_${unit.id}`}
                inputMode="decimal"
                placeholder="0"
                aria-label={`Ore pe ${unit.title}`}
              />
            </div>
          ))}
        </Block>
      )}

      <Note>
        Orele intră direct pe costul fiecărei lucrări. De aceea contează pe care le pui,
        nu doar câte.
      </Note>

      <SubmitBar label="Trimite pontajul" />
    </form>
  );
}
