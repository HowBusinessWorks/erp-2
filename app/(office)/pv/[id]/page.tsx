import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { Badge, PageHeader } from "@/components/ui/primitives";
import { DataPair } from "@/components/ui/tabs";
import { SignatureImage } from "@/components/domain/SignaturePad";
import { db } from "@/lib/db";
import {
  equipment,
  equipmentPlannings,
  handoverProtocols,
  objectives,
  partners,
  users,
  workUnits,
} from "@/lib/db/schema";
import { PROTOCOL_STATUS_LABEL, formatDay, formatQty } from "@/lib/equipment";
import { requireSession } from "@/lib/session";
import { HandoverStage, ReturnStage } from "./PvForms";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function PvPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const [row] = await db
    .select({
      protocol: handoverProtocols,
      eq: equipment,
      planning: equipmentPlannings,
      objective: objectives,
      unit: workUnits,
      toUser: users,
      toPartner: partners,
    })
    .from(handoverProtocols)
    .leftJoin(equipment, eq(handoverProtocols.equipmentId, equipment.id))
    .leftJoin(equipmentPlannings, eq(handoverProtocols.planningId, equipmentPlannings.id))
    .leftJoin(objectives, eq(equipmentPlannings.objectiveId, objectives.id))
    .leftJoin(workUnits, eq(handoverProtocols.workUnitId, workUnits.id))
    .leftJoin(users, eq(handoverProtocols.handoverToUserId, users.id))
    .leftJoin(partners, eq(handoverProtocols.handoverToPartnerId, partners.id))
    .where(eq(handoverProtocols.id, id))
    .limit(1);

  if (!row) notFound();
  const { protocol, eq: machine, objective, unit, toUser, toPartner } = row;

  const receiver =
    protocol.handoverToPersonName ?? toUser?.name ?? toPartner?.name ?? "—";

  const worked =
    protocol.returnHourMeter != null && protocol.handoverHourMeter != null
      ? Number(protocol.returnHourMeter) - Number(protocol.handoverHourMeter)
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div data-print="hide">
        <PageHeader
          eyebrow={
            machine ? (
              <Link href={`/utilaje/${machine.id}?fila=pv`} className="hover:text-blueprint">
                ‹ {machine.code}
              </Link>
            ) : (
              <Link href="/utilaje" className="hover:text-blueprint">
                ‹ Flota
              </Link>
            )
          }
          title={`Proces-verbal ${protocol.code}`}
          meta="Un document, două etape. Predarea se blochează la semnare; primirea se completează la retur și închide bucla economică."
          actions={
            <>
              <Badge tone={protocol.status === "deschis" ? "warn" : "fill"}>
                {PROTOCOL_STATUS_LABEL[protocol.status]}
              </Badge>
              <PrintButton />
            </>
          }
        />
      </div>

      {/* ─────────── documentul, așa cum iese pe hârtie ─────────── */}
      <article className="sheet space-y-5 px-8 py-7">
        <header className="border-b border-rule-strong pb-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="eyebrow mb-1">Damina Construct SRL</div>
              <h2 className="font-narrow text-[1.25rem] font-semibold tracking-tight text-ink">
                Proces-verbal de predare-primire
              </h2>
            </div>
            <div className="text-right">
              <div className="eyebrow mb-0.5">Număr</div>
              <div className="tabular font-narrow text-[1.0625rem] font-semibold text-ink">
                {protocol.code}
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
          <DataPair label="Utilaj">
            {machine ? `${machine.code} — ${machine.name}` : "—"}
          </DataPair>
          <DataPair label="Categorie">{machine?.category ?? "—"}</DataPair>
          <DataPair label="Obiectiv">{objective?.name ?? unit?.title ?? "—"}</DataPair>
        </section>

        {/* ─────────── etapa 1 ─────────── */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="eyebrow shrink-0">Etapa 1 · Predarea</span>
            <span aria-hidden className="h-px grow bg-rule" />
            <span className="shrink-0 text-tiny text-ink-2">
              {formatDay(protocol.handoverDate)}
            </span>
          </div>

          {protocol.handoverLocked ? (
            <>
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-4">
                <DataPair label="Predat de">{protocol.handoverByName}</DataPair>
                <DataPair label="Primit de">{receiver}</DataPair>
                <DataPair label="Contor" numeric>
                  {formatQty(protocol.handoverHourMeter, "ore")}
                </DataPair>
                <DataPair label="Motorină" numeric>
                  {formatQty(protocol.handoverFuel, "litri")}
                </DataPair>
                <DataPair label="Stare">{protocol.handoverCondition ?? "—"}</DataPair>
                <DataPair label="Observații">{protocol.handoverNotes ?? "—"}</DataPair>
              </div>

              {protocol.handoverAccessories.length ? (
                <div>
                  <div className="eyebrow mb-1">Accesorii predate</div>
                  <div className="flex flex-wrap gap-1.5">
                    {protocol.handoverAccessories.map((a) => (
                      <Badge key={a}>{a}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {protocol.handoverSignature ? (
                <div className="pt-2">
                  <SignatureImage
                    src={protocol.handoverSignature}
                    caption={`${receiver} · ${formatDay(protocol.handoverDate)}`}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div data-print="hide">
              <HandoverStage
                protocolId={protocol.id}
                defaultName={session.name}
                hourMeter={String(machine?.hourMeter ?? "0")}
              />
            </div>
          )}
        </section>

        {/* ─────────── etapa 2 ─────────── */}
        <section className="space-y-3 border-t border-rule pt-5">
          <div className="flex items-center gap-3">
            <span className="eyebrow shrink-0">Etapa 2 · Primirea înapoi</span>
            <span aria-hidden className="h-px grow bg-rule" />
            <span className="shrink-0 text-tiny text-ink-2">
              {protocol.returnDate ? formatDay(protocol.returnDate) : "neîncheiată"}
            </span>
          </div>

          {protocol.status === "inchis" ? (
            <>
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-4">
                <DataPair label="Predat înapoi de">{protocol.returnByName ?? "—"}</DataPair>
                <DataPair label="Contor" numeric>
                  {formatQty(protocol.returnHourMeter, "ore")}
                </DataPair>
                <DataPair label="Ore lucrate" numeric>
                  {worked !== null ? formatQty(worked, "ore") : "—"}
                </DataPair>
                <DataPair label="Motorină" numeric>
                  {formatQty(protocol.returnFuel, "litri")}
                </DataPair>
                <DataPair label="Stare">{protocol.returnCondition ?? "—"}</DataPair>
                <DataPair label="Probleme constatate">{protocol.returnIssues ?? "fără"}</DataPair>
              </div>

              {protocol.returnSignature ? (
                <div className="pt-2">
                  <SignatureImage
                    src={protocol.returnSignature}
                    caption={`${protocol.returnByName ?? "—"} · ${formatDay(protocol.returnDate)}`}
                  />
                </div>
              ) : null}
            </>
          ) : protocol.handoverLocked ? (
            <div data-print="hide">
              <ReturnStage
                protocolId={protocol.id}
                handoverHourMeter={String(protocol.handoverHourMeter ?? "0")}
              />
            </div>
          ) : (
            <p className="text-tiny text-ink-3">
              Se completează după ce predarea e semnată.
            </p>
          )}
        </section>

        {/* Golul cunoscut, scris pe document, nu ascuns în documentație. */}
        <footer className="border-t border-rule pt-4 text-micro text-ink-3" data-print="hide">
          Prototip: semnătura se păstrează ca desen, cu numele și momentul. În producție se
          adaugă hash-ul SHA-256 al documentului la semnare — altfel semnătura dovedește că
          cineva a semnat ceva, nu <em>ce</em> a semnat. Vezi PLAN.md §7.
        </footer>
      </article>
    </div>
  );
}
