import { and, asc, eq, inArray, or } from "drizzle-orm";

import { submitTimesheet } from "@/app/actions/field";
import { FieldHeader, SubmitBar } from "@/components/domain/FieldKit";
import { db } from "@/lib/db";
import { objectives, timesheets, workUnits } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * T5 — pontaj.
 *
 * Ziua se împarte pe mai multe unități de lucru, pe același ecran. Dacă nu se poate
 * împărți, cineva pune opt ore pe o singură lucrare când a lucrat la trei, iar costul
 * de manoperă al fiecăreia devine ficțiune.
 */
export default async function PontajPage() {
  const session = await requireSession();
  const today = new Date().toISOString().slice(0, 10);

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

  const alreadyBy = new Map(existing.map((t) => [t.workUnitId, Number(t.hours)]));
  const total = existing.reduce((a, t) => a + Number(t.hours), 0);

  return (
    <form action={submitTimesheet} className="px-4 py-4">
      <input type="hidden" name="day" value={today} />

      <FieldHeader
        eyebrow="Pontaj"
        title={new Intl.DateTimeFormat("ro-RO", { weekday: "long", day: "numeric", month: "long" }).format(
          new Date(),
        )}
        meta={total > 0 ? `${total} ore deja pontate azi` : "Nimic pontat azi"}
      />

      <label className="mt-4 block">
        <span className="eyebrow mb-1 block">Calificare</span>
        <select
          name="qualification"
          defaultValue={session.role === "sef_santier" ? "muncitor" : "muncitor"}
          className="h-11 w-full rounded-[3px] border border-rule-strong bg-sheet px-2 text-[0.875rem] text-ink"
        >
          <option value="muncitor">Muncitor</option>
          <option value="electrician">Electrician</option>
          <option value="instalator">Instalator</option>
        </select>
      </label>

      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {rows.map(({ unit, objective }) => (
          <li key={unit.id} className="flex items-center justify-between gap-3 py-3">
            <input type="hidden" name="workUnitId" value={unit.id} />
            <span className="min-w-0">
              <span className="block text-[0.9375rem] leading-snug text-ink">{unit.title}</span>
              <span className="block text-tiny text-ink-2">
                {objective?.name ?? "—"} · {unit.code}
                {alreadyBy.has(unit.id) ? (
                  <span className="text-fill"> · {alreadyBy.get(unit.id)} ore</span>
                ) : null}
              </span>
            </span>
            <input
              name={`hours_${unit.id}`}
              inputMode="decimal"
              placeholder="0"
              className="h-12 w-20 shrink-0 rounded-[3px] border border-rule-strong bg-sheet px-2 text-right text-[1rem] tabular text-ink"
            />
          </li>
        ))}
      </ul>

      {rows.length === 0 ? (
        <p className="py-8 text-tiny text-ink-2">Nu ai unități de lucru deschise.</p>
      ) : null}

      <SubmitBar label="Trimite pontajul" hint="Orele intră direct pe costul fiecărei unități de lucru." />
    </form>
  );
}
