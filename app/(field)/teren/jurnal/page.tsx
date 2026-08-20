import { asc, desc, eq, inArray } from "drizzle-orm";

import { submitJournal } from "@/app/actions/field";
import { FieldHeader, SubmitBar } from "@/components/domain/FieldKit";
import { db } from "@/lib/db";
import { objectives, siteJournalEntries, workUnits } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const WEATHER = ["senin", "înnorat", "ploaie", "vânt", "ger", "caniculă"];

/**
 * T6 — jurnalul de șantier.
 *
 * Se deschide GATA DE SCRIS: cursorul e deja în câmpul de text, unitatea de lucru e
 * precompletată, vremea are butoane. Trimite e singura atingere pe care o mai faci.
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

  const recent = selected
    ? await db
        .select()
        .from(siteJournalEntries)
        .where(eq(siteJournalEntries.workUnitId, selected))
        .orderBy(desc(siteJournalEntries.day))
        .limit(3)
    : [];

  return (
    <div className="px-4 py-4">
      <form action={submitJournal}>
        <FieldHeader
          eyebrow="Jurnal de șantier"
          title={new Intl.DateTimeFormat("ro-RO", {
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date())}
        />

        <div className="mt-3 space-y-3">
          <textarea
            name="text"
            rows={5}
            autoFocus
            required
            placeholder="Ce s-a lucrat azi"
            className="w-full rounded-[3px] border border-rule-strong bg-sheet px-3 py-2.5 text-[0.9375rem] leading-relaxed text-ink"
          />

          <div className="flex flex-wrap gap-1.5">
            {WEATHER.map((w, i) => (
              <label key={w}>
                <input
                  type="radio"
                  name="weather"
                  value={w}
                  defaultChecked={i === 0}
                  className="peer sr-only"
                />
                <span className="block cursor-pointer rounded-[3px] border border-rule-strong bg-sheet px-3 py-2 text-tiny text-ink-2 peer-checked:border-blueprint peer-checked:bg-blueprint peer-checked:text-white">
                  {w}
                </span>
              </label>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="eyebrow mb-1 block">Oameni</span>
              <input
                name="people"
                inputMode="numeric"
                defaultValue="3"
                className="h-11 w-full rounded-[3px] border border-rule-strong bg-sheet px-2.5 text-right text-[0.9375rem] tabular text-ink"
              />
            </label>
            <label className="col-span-2 block">
              <span className="eyebrow mb-1 block">Ce a blocat</span>
              <input
                name="blocker"
                placeholder="gol dacă nimic"
                className="h-11 w-full rounded-[3px] border border-rule-strong bg-sheet px-2.5 text-[0.875rem] text-ink"
              />
            </label>
          </div>

          <label className="block">
            <span className="eyebrow mb-1 block">Lucrarea</span>
            <select
              name="workUnitId"
              defaultValue={selected}
              className="h-11 w-full rounded-[3px] border border-rule-strong bg-sheet px-2 text-[0.875rem] text-ink"
            >
              {rows.map(({ unit, objective }) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code} — {objective?.name ?? unit.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <SubmitBar label="Trimite" />
      </form>

      {recent.length ? (
        <section className="mt-6">
          <div className="eyebrow mb-2">Ultimele însemnări</div>
          <ul className="divide-y divide-rule border-y border-rule">
            {recent.map((entry) => (
              <li key={entry.id} className="py-2.5">
                <div className="text-micro text-ink-3">
                  {entry.day}
                  {entry.weather ? ` · ${entry.weather}` : ""}
                </div>
                <p className="mt-0.5 text-tiny leading-relaxed text-ink">{entry.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
