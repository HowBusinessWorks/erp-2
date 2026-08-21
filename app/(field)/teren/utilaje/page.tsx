import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, lte, or } from "drizzle-orm";

import { Icon } from "@/components/domain/FieldIcons";
import {
  Block,
  ButtonLink,
  Buttons,
  Empty,
  FieldBar,
  Label,
  Pill,
  StaticRow,
} from "@/components/domain/FieldUI";
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
      .where(or(eq(workUnits.responsibleId, session.id), eq(workUnits.executant, "propriu")))
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

  /* ─────────── cer un utilaj ─────────── */
  if (view === "cere") {
    return (
      <>
        <FieldBar title="Cer un utilaj" sub="Solicitarea merge la birou" back="/teren/utilaje" />
        <RequestEquipmentForm objectives={myObjectives} />
      </>
    );
  }

  /* ─────────── raportez o problemă ─────────── */
  if (view === "problema") {
    return (
      <>
        <FieldBar title="Am o problemă" sub="Observație pe utilaj" back="/teren/utilaje" />
        {mine.length === 0 ? (
          <Empty icon="crane" title="Nu ai niciun utilaj la tine">
            Deci nu ai ce raporta. Cere unul dacă îți trebuie.
          </Empty>
        ) : (
          <ReportIssueForm
            equipment={mine.map(({ eq: item }) => ({ id: item.id, code: item.code, name: item.name }))}
          />
        )}
      </>
    );
  }

  /* ─────────── lista ─────────── */
  return (
    <>
      <FieldBar title="Utilajele mele" sub={`Ce ai pe șantier · ${formatDay(today)}`} back="/teren">
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Pill tone={mine.length > 0 ? "am-solid" : "on-dark"}>
            {mine.length} {mine.length === 1 ? "utilaj" : "utilaje"}
          </Pill>
          {protocols.length > 0 ? <Pill tone="on-dark">{protocols.length} PV deschise</Pill> : null}
        </div>
      </FieldBar>

      <div style={{ height: 16 }} />

      {mine.length === 0 ? (
        <Empty icon="crane" title="Niciun utilaj la tine azi">
          Dacă îți trebuie unul, cere-l de mai jos — biroul alege care e liber.
        </Empty>
      ) : (
        <Block>
          {mine.map(({ planning, eq: item, objective }) => {
            const open = protocols.find((p) => p.planningId === planning.id);
            const left = Math.max(
              0,
              Math.round(
                (Date.parse(`${planning.toDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
                  86_400_000,
              ),
            );
            return (
              <div key={planning.id} className="f-li" style={{ display: "block" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                  <span className="f-sq f-a">
                    <Icon name="crane" />
                  </span>
                  <span className="f-tx">
                    <b>{item.name}</b>
                    <span>
                      {objective?.name ?? "—"} · {item.code}
                    </span>
                  </span>
                  <Pill tone={left === 0 ? "r" : "n"}>
                    {left === 0 ? "ultima zi" : `${left} zile`}
                  </Pill>
                </div>

                {/* Cantități — contor, zile. Niciun leu. */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px 18px",
                    marginTop: 12,
                    fontSize: 13,
                    color: "var(--f-mut)",
                  }}
                >
                  <span>
                    Contor <b style={{ color: "var(--f-ink)" }}>{formatQty(item.hourMeter, "h")}</b>
                  </span>
                  <span>
                    Până la <b style={{ color: "var(--f-ink)" }}>{formatDay(planning.toDate)}</b>
                  </span>
                  {planning.withOperator ? <span>cu operator</span> : null}
                </div>

                {open ? (
                  <Link href={`/pv/${open.id}`} className="f-bt f-out f-s" style={{ marginTop: 12 }}>
                    <Icon name="pen" />
                    PV {open.code} — de semnat la retur
                  </Link>
                ) : null}
              </div>
            );
          })}
        </Block>
      )}

      <Buttons>
        <ButtonLink href="/teren/utilaje?ce=cere" icon="plus" variant="pri">
          Cer un utilaj
        </ButtonLink>
        {mine.length > 0 ? (
          <ButtonLink href="/teren/utilaje?ce=problema" icon="alert" variant="out">
            Am o problemă
          </ButtonLink>
        ) : null}
      </Buttons>

      {openRequests.length > 0 ? (
        <>
          <Label>Trimise, în așteptare</Label>
          <Block>
            {openRequests.map((request) => (
              <StaticRow
                key={request.id}
                icon="clock"
                tone="a"
                title={request.title}
                meta={request.code}
                right={<Pill tone="a">Așteaptă</Pill>}
              />
            ))}
          </Block>
        </>
      ) : null}
    </>
  );
}
