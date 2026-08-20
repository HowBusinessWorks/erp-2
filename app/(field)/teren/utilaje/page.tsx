import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, lte, or } from "drizzle-orm";

import { FieldHeader } from "@/components/domain/FieldKit";
import { db } from "@/lib/db";
import {
  equipment,
  equipmentPlannings,
  handoverProtocols,
  objectives,
  requests,
  workUnits,
} from "@/lib/db/schema";
import { formatDay, formatQty, today as todayIso } from "@/lib/equipment";
import { requireSession } from "@/lib/session";
import { ReportIssueForm, RequestEquipmentForm } from "./FieldEquipmentForms";

export const dynamic = "force-dynamic";

/**
 * T7 — „Utilajele mele".
 *
 * Doar ce am pe șantier, nu toată flota. **Cantități, nu bani** — contorul, litrii,
 * zilele rămase. Rata internă și costul reparațiilor nu au ce căuta aici; regula 5
 * din CLAUDE.md nu are excepții.
 */
export default async function TerenUtilajePage({
  searchParams,
}: {
  searchParams: Promise<{ ce?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const today = todayIso();

  const [mine, myObjectives, openRequests] = await Promise.all([
    db
      .select({ planning: equipmentPlannings, eq: equipment, objective: objectives })
      .from(equipmentPlannings)
      .innerJoin(equipment, eq(equipmentPlannings.equipmentId, equipment.id))
      .leftJoin(objectives, eq(equipmentPlannings.objectiveId, objectives.id))
      .where(
        and(
          eq(equipmentPlannings.responsibleId, session.id),
          lte(equipmentPlannings.fromDate, today),
          gte(equipmentPlannings.toDate, today),
          inArray(equipmentPlannings.status, ["planificata", "in_derulare"]),
        ),
      )
      .orderBy(asc(equipmentPlannings.toDate)),
    db
      .selectDistinct({ id: objectives.id, name: objectives.name })
      .from(objectives)
      .innerJoin(workUnits, eq(workUnits.objectiveId, objectives.id))
      .where(
        or(eq(workUnits.responsibleId, session.id), eq(workUnits.executant, "propriu")),
      )
      .orderBy(asc(objectives.name))
      .limit(30),
    db
      .select()
      .from(requests)
      .where(
        and(
          eq(requests.requestedBy, session.id),
          inArray(requests.kind, ["solicitare_utilaj", "observatie_utilaj"]),
          eq(requests.status, "neprocesata"),
        ),
      )
      .orderBy(desc(requests.createdAt))
      .limit(10),
  ]);

  const protocolIds = mine.map((m) => m.planning.id);
  const protocols = protocolIds.length
    ? await db
        .select()
        .from(handoverProtocols)
        .where(
          and(
            inArray(handoverProtocols.planningId, protocolIds),
            eq(handoverProtocols.status, "deschis"),
          ),
        )
    : [];

  const view = sp.ce === "cere" ? "cere" : sp.ce === "problema" ? "problema" : "lista";

  return (
    <div className="px-4 py-4">
      <FieldHeader
        eyebrow="Utilajele mele"
        title={
          view === "cere"
            ? "Cer un utilaj"
            : view === "problema"
              ? "Raportez o problemă"
              : "Ce am pe șantier"
        }
        meta={
          view === "lista"
            ? `${mine.length} ${mine.length === 1 ? "utilaj" : "utilaje"} · ${formatDay(today)}`
            : undefined
        }
      />

      {/* ─────────── lista ─────────── */}
      {view === "lista" ? (
        <div className="mt-4 space-y-4">
          {mine.length === 0 ? (
            <p className="border border-dashed border-rule-strong px-4 py-6 text-tiny text-ink-2">
              Niciun utilaj la tine azi. Dacă îți trebuie unul, cere-l de mai jos — biroul alege
              care e liber.
            </p>
          ) : (
            <div className="space-y-2">
              {mine.map(({ planning, eq: e, objective }) => {
                const open = protocols.find((p) => p.planningId === planning.id);
                const left = Math.max(
                  0,
                  Math.round(
                    (Date.parse(planning.toDate + "T00:00:00Z") -
                      Date.parse(today + "T00:00:00Z")) /
                      86_400_000,
                  ),
                );
                return (
                  <div key={planning.id} className="border border-rule-strong bg-sheet px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-narrow text-[1rem] font-semibold text-ink">
                        {e.name}
                      </span>
                      <span className="shrink-0 tabular text-tiny text-ink-2">{e.code}</span>
                    </div>
                    <div className="mt-1 text-tiny text-ink-2">{objective?.name ?? "—"}</div>

                    {/* Cantități — contor, zile. Niciun leu. */}
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-tiny">
                      <span className="text-ink-2">
                        Contor <span className="tabular text-ink">{formatQty(e.hourMeter, "h")}</span>
                      </span>
                      <span className="text-ink-2">
                        Până la{" "}
                        <span className="text-ink">{formatDay(planning.toDate)}</span>
                        {left === 0 ? (
                          <span className="text-warn"> · azi e ultima zi</span>
                        ) : (
                          <span className="text-ink-3"> · {left} zile</span>
                        )}
                      </span>
                      {planning.withOperator ? (
                        <span className="text-ink-2">cu operator</span>
                      ) : null}
                    </div>

                    {open ? (
                      <Link
                        href={`/pv/${open.id}`}
                        className="mt-2 block text-tiny font-medium text-blueprint"
                      >
                        PV {open.code} — deschis, de semnat la retur →
                      </Link>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {/* Cele două acțiuni: a doua atingere din cele trei. */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Link
              href="/teren/utilaje?ce=cere"
              className="flex h-14 items-center justify-center rounded-[4px] bg-blueprint text-[0.9375rem] font-semibold text-white active:brightness-95"
            >
              Cer un utilaj
            </Link>
            <Link
              href="/teren/utilaje?ce=problema"
              className={`flex h-14 items-center justify-center rounded-[4px] border border-rule-strong bg-sheet text-[0.9375rem] font-semibold text-ink active:bg-sunk ${
                mine.length === 0 ? "pointer-events-none opacity-40" : ""
              }`}
            >
              Am o problemă
            </Link>
          </div>

          {openRequests.length ? (
            <div className="border-t border-rule pt-3">
              <div className="eyebrow mb-2">Trimise, în așteptare</div>
              <div className="space-y-1.5">
                {openRequests.map((r) => (
                  <div key={r.id} className="flex items-baseline justify-between gap-3 text-tiny">
                    <span className="truncate text-ink-2">{r.title}</span>
                    <span className="shrink-0 tabular text-ink-3">{r.code}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ─────────── cer un utilaj ─────────── */}
      {view === "cere" ? (
        <div className="mt-4">
          <RequestEquipmentForm objectives={myObjectives} />
          <BackLink />
        </div>
      ) : null}

      {/* ─────────── raportez o problemă ─────────── */}
      {view === "problema" ? (
        <div className="mt-4">
          {mine.length === 0 ? (
            <p className="border border-dashed border-rule-strong px-4 py-6 text-tiny text-ink-2">
              Nu ai niciun utilaj la tine, deci nu ai ce raporta.
            </p>
          ) : (
            <ReportIssueForm
              equipment={mine.map(({ eq: e }) => ({ id: e.id, code: e.code, name: e.name }))}
            />
          )}
          <BackLink />
        </div>
      ) : null}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/teren/utilaje" className="mt-4 block text-center text-tiny text-ink-2">
      ← Înapoi la utilajele mele
    </Link>
  );
}
