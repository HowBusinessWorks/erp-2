import Link from "next/link";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";

import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import { equipment, equipmentPlannings, objectives, requests, users } from "@/lib/db/schema";
import { formatDay, shiftDate, today as todayIso } from "@/lib/equipment";
import { requireSession } from "@/lib/session";
import { AllocateForm, type Candidate } from "./AllocateForm";

export const dynamic = "force-dynamic";

/** Fereastra în care ne uităm după conflicte când alocăm: două luni înainte. */
const HORIZON_DAYS = 60;

export default async function SolicitariUtilajPage({
  searchParams,
}: {
  searchParams: Promise<{ tip?: string }>;
}) {
  await requireSession();
  const sp = await searchParams;
  const today = todayIso();
  const kind = sp.tip === "observatie" ? "observatie_utilaj" : "solicitare_utilaj";

  const [rows, fleet, plannings, counts] = await Promise.all([
    db
      .select({ request: requests, objective: objectives, requester: users, eq: equipment })
      .from(requests)
      .leftJoin(objectives, eq(requests.objectiveId, objectives.id))
      .leftJoin(users, eq(requests.requestedBy, users.id))
      .leftJoin(equipment, eq(requests.equipmentId, equipment.id))
      .where(eq(requests.kind, kind))
      // neprocesatele sus: ele sunt treaba de azi
      .orderBy(asc(requests.status), desc(requests.createdAt))
      .limit(80),
    db
      .select()
      .from(equipment)
      .where(inArray(equipment.status, ["disponibil", "indisponibil", "service"]))
      .orderBy(asc(equipment.category), asc(equipment.code)),
    db
      .select()
      .from(equipmentPlannings)
      .where(
        and(
          gte(equipmentPlannings.toDate, today),
          inArray(equipmentPlannings.status, ["planificata", "in_derulare"]),
        ),
      ),
    db
      .select({ kind: requests.kind, status: requests.status })
      .from(requests)
      .where(inArray(requests.kind, ["solicitare_utilaj", "observatie_utilaj"])),
  ]);

  const busyBy = new Map<string, { from: string; to: string }[]>();
  for (const p of plannings) {
    const list = busyBy.get(p.equipmentId) ?? [];
    list.push({ from: p.fromDate, to: p.toDate });
    busyBy.set(p.equipmentId, list);
  }

  const candidates: Candidate[] = fleet.map((e) => ({
    id: e.id,
    code: e.code,
    name: e.name,
    category: e.category,
    activities: e.activities,
    busyOn: busyBy.get(e.id) ?? [],
    status: e.status,
    immobilized: e.immobilizedFrom !== null,
  }));

  const openCount = (k: string) =>
    counts.filter((c) => c.kind === k && c.status === "neprocesata").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/utilaje" className="hover:text-blueprint">
            ‹ Flota
          </Link>
        }
        title="Solicitări de utilaj"
        meta="Terenul cere o capacitate — „un excavator, trei zile, la Berceni”. Biroul alege bucata concretă, pentru că numai el știe care e liberă. Solicitantul rămâne responsabil de utilaj cât e la el."
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip
          href="/utilaje/solicitari"
          active={kind === "solicitare_utilaj"}
          label={`Solicitări · ${openCount("solicitare_utilaj")} deschise`}
        />
        <Chip
          href="/utilaje/solicitari?tip=observatie"
          active={kind === "observatie_utilaj"}
          label={`Observații pe utilaj · ${openCount("observatie_utilaj")} deschise`}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nicio solicitare"
          hint="Solicitările intră din ecranul „Utilajele mele” de pe teren, în două atingeri: activitatea și numărul de zile."
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Cod</TH>
                <TH>Ce se cere</TH>
                <TH>Obiectiv</TH>
                {kind === "observatie_utilaj" ? <TH>Utilaj</TH> : null}
                <TH>Solicitant</TH>
                <TH>Primită</TH>
                <TH>Stare</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {rows.map(({ request, objective, requester, eq: e }) => (
                <TR key={request.id}>
                  <TD>
                    <Link href={`/cereri/${request.id}`} className="font-medium hover:text-blueprint">
                      {request.code}
                    </Link>
                  </TD>
                  <TD className="max-w-72">{request.title}</TD>
                  <TD muted className="max-w-48 truncate">
                    {objective?.name ?? "—"}
                  </TD>
                  {kind === "observatie_utilaj" ? (
                    <TD muted>
                      {e ? (
                        <Link href={`/utilaje/${e.id}`} className="hover:text-blueprint">
                          {e.code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TD>
                  ) : null}
                  <TD muted>{requester?.name ?? "—"}</TD>
                  <TD muted>{formatDay(String(request.createdAt).slice(0, 10))}</TD>
                  <TD>
                    <Badge tone={request.status === "neprocesata" ? "warn" : "fill"}>
                      {request.status === "neprocesata" ? "de alocat" : "alocată"}
                    </Badge>
                  </TD>
                  <TD>
                    {kind === "solicitare_utilaj" && request.status === "neprocesata" ? (
                      <AllocateForm
                        requestId={request.id}
                        requestTitle={request.title}
                        suggestedFrom={today}
                        suggestedTo={shiftDate(today, 2)}
                        candidates={candidates}
                      />
                    ) : kind === "observatie_utilaj" && e ? (
                      <Link
                        href={`/utilaje/${e.id}?fila=reparatii`}
                        className="text-tiny text-blueprint hover:underline"
                      >
                        deschide reparație →
                      </Link>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Sheet>
      )}

      <p className="max-w-prose text-micro text-ink-3">
        Conflictele se calculează pe {HORIZON_DAYS} de zile înainte. Un utilaj ocupat nu dispare
        din listă — se vede marcat, pentru că uneori decizia corectă e să decalezi cealaltă
        planificare, nu să cauți alt utilaj.
      </p>
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-[3px] border px-2 py-0.5 text-tiny transition-colors ${
        active
          ? "border-blueprint bg-blueprint text-white"
          : "border-rule-strong bg-sheet text-ink-2 hover:bg-sunk hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
