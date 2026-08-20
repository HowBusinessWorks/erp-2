import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { setRequestStatus } from "@/app/actions/requests";
import { Badge, Button, Field, PageHeader, SectionRule, Textarea } from "@/components/ui/primitives";
import { DataPair } from "@/components/ui/tabs";
import { db } from "@/lib/db";
import { contracts, objectives, operationCatalog, requests, users } from "@/lib/db/schema";
import { format, formatShort, fromDb } from "@/lib/money";
import { currentPeriod, labelPeriod } from "@/lib/period";
import { canSeePrices } from "@/lib/permissions";
import { ROUTING_LABELS, routingContext } from "@/lib/routing";
import { requireSession } from "@/lib/session";

import { RoutingForm } from "./RoutingForm";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  tichet: "Tichet",
  solicitare: "Solicitare",
  constatare: "Constatare",
  propunere: "Propunere",
  solicitare_utilaj: "Solicitare de utilaj",
  observatie_utilaj: "Observație pe utilaj",
};

export default async function CerereePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const [row] = await db
    .select({
      request: requests,
      objective: objectives,
      contract: contracts,
      operation: operationCatalog,
      decider: users,
    })
    .from(requests)
    .leftJoin(objectives, eq(requests.objectiveId, objectives.id))
    .leftJoin(contracts, eq(requests.contractId, contracts.id))
    .leftJoin(operationCatalog, eq(requests.operationId, operationCatalog.id))
    .leftJoin(users, eq(requests.decidedBy, users.id))
    .where(eq(requests.id, id))
    .limit(1);

  if (!row) notFound();
  const { request, objective, contract, operation, decider } = row;

  const period = currentPeriod();
  const estimated = fromDb(request.estimatedValue);
  const context = contract
    ? await routingContext(contract.id, estimated, period.year, period.month)
    : null;

  const email = request.sourceEmail as { from?: string; subject?: string } | null;
  const showPrices = canSeePrices(session.role);
  const decided = Boolean(request.decision);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/cereri" className="hover:text-blueprint">Cereri și tichete</Link>}
        title={request.title}
        meta={
          <>
            {request.code} · {KIND_LABEL[request.kind]} · sursă {request.source.replace("_", " ")}
            {objective ? ` · ${objective.name}` : null}
          </>
        }
        actions={
          request.workUnitId ? (
            <Link href={`/lucrari/${request.workUnitId}`}>
              <Button variant="primary" size="sm">Vezi unitatea de lucru</Button>
            </Link>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {/* Ce a intrat, exact așa cum a intrat. Emailul original rămâne dovada. */}
          <section className="space-y-3">
            <SectionRule>Cererea</SectionRule>
            <p className="max-w-prose text-[0.8125rem] leading-relaxed text-ink">
              {request.description ?? "Fără descriere."}
            </p>
            {email ? (
              <div className="border-l-2 border-rule-strong bg-sunk/50 px-3 py-2 text-tiny text-ink-2">
                <div className="eyebrow mb-0.5">e-mail original</div>
                {email.subject} — de la {email.from}
              </div>
            ) : null}
          </section>

          {decided ? (
            <section className="space-y-3">
              <SectionRule>Decizia luată</SectionRule>
              <div className="sheet px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-narrow text-[1.0625rem] font-semibold text-ink">
                    {ROUTING_LABELS[request.decision as keyof typeof ROUTING_LABELS]}
                  </span>
                  <span className="text-tiny text-ink-2">
                    {decider?.name ?? "—"} ·{" "}
                    {request.decidedAt
                      ? new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium" }).format(
                          request.decidedAt,
                        )
                      : "—"}
                  </span>
                </div>
                {request.decisionNote ? (
                  <p className="mt-1.5 text-tiny text-ink-2">{request.decisionNote}</p>
                ) : null}
              </div>
            </section>
          ) : context && showPrices ? (
            <RoutingForm
              requestId={request.id}
              context={context}
              period={period}
              periodLabel={labelPeriod(period)}
            />
          ) : (
            <section className="space-y-3">
              <SectionRule>Rutare</SectionRule>
              <p className="text-tiny text-ink-2">
                {!contract
                  ? "Cererea nu e legată de un contract, deci nu se poate ruta. Alege întâi contractul."
                  : "Decizia de rutare se ia de către managerul de proiect."}
              </p>
            </section>
          )}

          {/* Triere: nu tot ce intră devine lucrare. Respins și amânat rămân decizii cu autor. */}
          {!decided ? (
            <section className="space-y-3">
              <SectionRule>Sau triază fără să produci lucrare</SectionRule>
              <form action={setRequestStatus} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="requestId" value={request.id} />
                <div className="min-w-64 grow">
                  <Field label="Motiv">
                    <Textarea name="note" rows={2} placeholder="De ce se amână sau se respinge" />
                  </Field>
                </div>
                <Button type="submit" name="status" value="amanata" size="sm">
                  Amână
                </Button>
                <Button type="submit" name="status" value="respinsa" variant="danger" size="sm">
                  Respinge
                </Button>
              </form>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="sheet space-y-3 px-4 py-3">
            <DataPair label="Obiectiv">
              {objective ? (
                <Link href={`/obiective/${objective.id}`} className="hover:text-blueprint">
                  {objective.name}
                </Link>
              ) : (
                "—"
              )}
            </DataPair>
            <DataPair label="Contract">
              {contract ? (
                <Link href={`/contracte/${contract.id}`} className="hover:text-blueprint">
                  {contract.code} — {contract.name}
                </Link>
              ) : (
                "—"
              )}
            </DataPair>
            <DataPair label="Operațiune din catalog">
              {operation ? `${operation.code} — ${operation.name}` : "—"}
              {operation ? (
                <span className="block text-micro text-ink-3">
                  normă {Number(operation.standardHours)} ore · {operation.qualification ?? "—"}
                </span>
              ) : null}
            </DataPair>
            {showPrices ? (
              <>
                <DataPair label="Cost estimat" numeric>
                  {format(estimated)} lei
                </DataPair>
                <DataPair label="Prag mentenanță pe contract" numeric>
                  {contract ? `${formatShort(fromDb(contract.maintenanceThreshold))} lei` : "—"}
                </DataPair>
              </>
            ) : null}
            {request.expiresAt ? (
              <DataPair label="Expiră">
                {request.expiresAt}
                <span className="block text-micro text-ink-3">
                  Propunerile expiră; altfel backlogul se umple de lucruri moarte.
                </span>
              </DataPair>
            ) : null}
            <DataPair label="Stare">
              <Badge tone={request.decision ? "fill" : "warn"}>{request.status}</Badge>
            </DataPair>
          </div>
        </aside>
      </div>
    </div>
  );
}
