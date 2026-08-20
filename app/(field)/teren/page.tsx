import Link from "next/link";
import { and, asc, desc, eq, inArray, or, sql as raw } from "drizzle-orm";

import { FieldAddButton, FieldHeader } from "@/components/domain/FieldKit";
import { Badge } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { inspectionAnswers, objectives, timesheets, workUnits } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";
import { KIND_LABEL } from "@/lib/work-units";

export const dynamic = "force-dynamic";

/**
 * T1 — Azi.
 *
 * Lista a ce am de făcut, plus ＋. Nimic altceva: fiecare element în plus pe ecranul
 * ăsta e o atingere pe care o plătește cineva cu mâinile murdare, în ploaie.
 * Zero lei, aici și pe toate ecranele de sub el.
 */
export default async function TerenPage() {
  const session = await requireSession();
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({ unit: workUnits, objective: objectives })
    .from(workUnits)
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(
      and(
        inArray(workUnits.status, ["planificata", "in_lucru", "propusa"]),
        or(eq(workUnits.responsibleId, session.id), eq(workUnits.executant, "propriu")),
      ),
    )
    .orderBy(asc(workUnits.status), desc(workUnits.startDate))
    .limit(14);

  const unitIds = rows.map((r) => r.unit.id);
  const [answered, hoursToday] = await Promise.all([
    unitIds.length
      ? db
          .select({ workUnitId: inspectionAnswers.workUnitId, n: raw<string>`count(*)` })
          .from(inspectionAnswers)
          .where(inArray(inspectionAnswers.workUnitId, unitIds))
          .groupBy(inspectionAnswers.workUnitId)
      : [],
    db
      .select({ total: raw<string>`coalesce(sum(${timesheets.hours}), 0)` })
      .from(timesheets)
      .where(and(eq(timesheets.userId, session.id), eq(timesheets.day, today))),
  ]);
  const startedBy = new Set(answered.map((a) => a.workUnitId));
  const hours = Number(hoursToday[0]?.total ?? 0);

  return (
    <div className="px-4 py-4">
      <FieldHeader
        eyebrow="Azi"
        title={new Intl.DateTimeFormat("ro-RO", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(new Date())}
        meta={
          hours > 0 ? (
            <>
              {hours} ore pontate azi ·{" "}
              <Link href="/teren/pontaj" className="underline">
                completează
              </Link>
            </>
          ) : (
            <>
              Niciun pont azi ·{" "}
              <Link href="/teren/pontaj" className="underline">
                pontează
              </Link>
            </>
          )
        }
      />

      <ul className="mt-2 divide-y divide-rule border-b border-rule">
        {rows.length === 0 ? (
          <li className="py-8 text-tiny text-ink-2">
            Nu ai nimic deschis. Butonul ＋ deschide ce ai nevoie.
          </li>
        ) : (
          rows.map(({ unit, objective }) => (
            <li key={unit.id}>
              <Link href={`/teren/${unit.id}`} className="block py-3.5 active:bg-sunk">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium leading-snug text-ink">{unit.title}</span>
                  <Badge tone={unit.kind === "inspectie" ? "blueprint" : unit.kind === "lucrare" ? "fill" : "neutral"}>
                    {KIND_LABEL[unit.kind as keyof typeof KIND_LABEL]}
                  </Badge>
                </div>
                <div className="mt-0.5 text-tiny text-ink-2">
                  {objective?.name ?? "—"} · {unit.code}
                  {startedBy.has(unit.id) ? (
                    <span className="ml-1 text-warn">· începută</span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>

      <FieldAddButton workUnitId={rows[0]?.unit.id} />
    </div>
  );
}
