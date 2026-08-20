import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { releaseImmobilization } from "@/app/actions/equipment";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { DataPair, Tabs } from "@/components/ui/tabs";
import { Money } from "@/components/ui/gauge";
import { db } from "@/lib/db";
import {
  equipment,
  equipmentPlannings,
  fileNodes,
  fileVersions,
  fuelLogs,
  handoverProtocols,
  objectives,
  repairs,
  requests,
  users,
} from "@/lib/db/schema";
import {
  EQUIPMENT_STATUS_LABEL,
  EQUIPMENT_STATUS_TONE,
  PLANNING_STATUS_LABEL,
  PLANNING_STATUS_TONE,
  PROTOCOL_STATUS_LABEL,
  REPAIR_KIND_LABEL,
  equipmentAlerts,
  formatDay,
  formatQty,
  today as todayIso,
} from "@/lib/equipment";
import { fromDb } from "@/lib/money";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { AddFuelLog, AddRepair } from "./FleetForms";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "detalii", label: "Detalii" },
  { key: "accesorii", label: "Accesorii" },
  { key: "motorina", label: "Motorină" },
  { key: "reparatii", label: "Reparații" },
  { key: "planificari", label: "Planificări" },
  { key: "pv", label: "PV" },
  { key: "poze", label: "Poze" },
] as const;

export default async function UtilajPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fila?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.fila) ? sp.fila! : "detalii";
  const showPrices = canSeePrices(session.role);
  const today = todayIso();

  const [row] = await db.select().from(equipment).where(eq(equipment.id, id)).limit(1);
  if (!row) notFound();

  const [fuel, repairRows, planningRows, protocolRows, photoRows, issueRows] = await Promise.all([
    db.select().from(fuelLogs).where(eq(fuelLogs.equipmentId, id)).orderBy(desc(fuelLogs.day)).limit(60),
    db
      .select({ repair: repairs, request: requests })
      .from(repairs)
      .leftJoin(requests, eq(repairs.requestId, requests.id))
      .where(eq(repairs.equipmentId, id))
      .orderBy(desc(repairs.startedAt))
      .limit(60),
    db
      .select({ planning: equipmentPlannings, objective: objectives, responsible: users })
      .from(equipmentPlannings)
      .leftJoin(objectives, eq(equipmentPlannings.objectiveId, objectives.id))
      .leftJoin(users, eq(equipmentPlannings.responsibleId, users.id))
      .where(eq(equipmentPlannings.equipmentId, id))
      .orderBy(desc(equipmentPlannings.fromDate))
      .limit(60),
    db
      .select()
      .from(handoverProtocols)
      .where(eq(handoverProtocols.equipmentId, id))
      .orderBy(desc(handoverProtocols.handoverDate))
      .limit(40),
    db
      .select({ version: fileVersions, node: fileNodes })
      .from(fileVersions)
      .innerJoin(fileNodes, eq(fileVersions.nodeId, fileNodes.id))
      .where(eq(fileNodes.name, row.code))
      .limit(24),
    db
      .select()
      .from(requests)
      .where(and(eq(requests.equipmentId, id), eq(requests.kind, "observatie_utilaj")))
      .orderBy(desc(requests.createdAt))
      .limit(20),
  ]);

  const alerts = equipmentAlerts(row, today);
  const fuelTotal = fuel.reduce((a, f) => a + fromDb(f.value), 0);
  const fuelLiters = fuel.reduce((a, f) => a + Number(f.liters ?? 0), 0);
  const repairTotal = repairRows.reduce((a, r) => a + fromDb(r.repair.totalCost), 0);
  const repairHours = repairRows.reduce((a, r) => a + Number(r.repair.hours ?? 0), 0);
  const openIssues = issueRows.filter((r) => r.status === "neprocesata");

  const href = (key: string) => `/utilaje/${id}?fila=${key}`;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <Link href="/utilaje" className="hover:text-blueprint">
            ‹ Flota
          </Link>
        }
        title={`${row.code} — ${row.name}`}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={EQUIPMENT_STATUS_TONE[row.status]}>
              {EQUIPMENT_STATUS_LABEL[row.status]}
            </Badge>
            <span>{row.category}</span>
            {row.isRented ? <span>· închiriat</span> : null}
            {row.activities.length ? <span>· {row.activities.join(", ")}</span> : null}
          </span>
        }
        actions={
          showPrices ? (
            <>
              <AddFuelLog
                equipmentId={id}
                hourMeter={String(row.hourMeter ?? "0")}
                today={today}
                lastPrice={fuel[0] ? String(fromDb(fuel[0].pricePerLiter) / 100) : ""}
              />
              <AddRepair
                equipmentId={id}
                today={today}
                openIssues={openIssues.map((r) => ({ id: r.id, label: `${r.code} · ${r.title}` }))}
              />
            </>
          ) : null
        }
      />

      {/* Imobilizarea e cea mai scumpă stare a unui utilaj — se anunță, nu se deduce. */}
      {row.immobilizedFrom ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-over bg-over-soft px-4 py-3">
          <p className="text-tiny text-over">
            <span className="font-medium">Imobilizat din {formatDay(row.immobilizedFrom)}.</span>{" "}
            Cât stă, nu produce cost de exploatare — orele nu se mai facturează intern.
          </p>
          {showPrices ? (
            <form action={releaseImmobilization}>
              <input type="hidden" name="equipmentId" value={id} />
              <Button type="submit" size="sm">
                Scoate din imobilizare
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}

      {alerts.length ? (
        <div className="flex flex-wrap gap-2">
          {alerts.map((a) => (
            <span
              key={a.kind}
              className={`border-l-2 px-3 py-1.5 text-tiny ${
                a.severity === "expirat"
                  ? "border-over bg-over-soft text-over"
                  : "border-warn bg-warn-soft text-warn"
              }`}
            >
              <span className="font-medium">{a.label}</span>{" "}
              {a.hours !== null
                ? a.hours < 0
                  ? `depășită cu ${-a.hours} ore de funcționare`
                  : `în ${a.hours} ore de funcționare`
                : a.days !== null
                  ? a.days < 0
                    ? `expirată de ${-a.days} zile`
                    : `în ${a.days} zile`
                  : ""}
            </span>
          ))}
        </div>
      ) : null}

      <Tabs
        active={tab}
        items={TABS.map((t) => ({
          key: t.key,
          href: href(t.key),
          label: t.label,
          count:
            t.key === "motorina"
              ? fuel.length
              : t.key === "reparatii"
                ? repairRows.length
                : t.key === "planificari"
                  ? planningRows.length
                  : t.key === "pv"
                    ? protocolRows.length
                    : t.key === "accesorii"
                      ? row.accessories.length
                      : t.key === "poze"
                        ? photoRows.length
                        : undefined,
        }))}
      />

      {/* ─────────── Detalii ─────────── */}
      {tab === "detalii" ? (
        <div className="space-y-5">
          <Sheet className="grid gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-3 lg:grid-cols-4">
            <DataPair label="Contor" numeric>
              {formatQty(row.hourMeter, "ore")}
            </DataPair>
            <DataPair label="Kilometraj" numeric>
              {formatQty(row.km, "km")}
            </DataPair>
            <DataPair label="ITP">{formatDay(row.itpExpiry)}</DataPair>
            <DataPair label="RCA">{formatDay(row.rcaExpiry)}</DataPair>
            <DataPair label="ISCIR">{formatDay(row.iscirExpiry)}</DataPair>
            <DataPair label="Revizie (dată)">{formatDay(row.nextServiceDate)}</DataPair>
            <DataPair label="Revizie (contor)" numeric>
              {formatQty(row.nextServiceHours, "ore")}
            </DataPair>
            <DataPair label="Firmă">{row.firmId ? "proprie" : "—"}</DataPair>
            {showPrices ? (
              <DataPair label="Rată internă / oră" numeric>
                <Money value={fromDb(row.internalHourlyRate)} />
              </DataPair>
            ) : null}
            {showPrices && row.isRented ? (
              <DataPair label="Chirie / zi" numeric>
                <Money value={fromDb(row.dailyRentCost)} />
              </DataPair>
            ) : null}
          </Sheet>

          {showPrices ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Total label="Motorină" value={fuelTotal} caption={`${formatQty(fuelLiters, "litri")} în ${fuel.length} alimentări`} />
              <Total label="Reparații" value={repairTotal} caption={`${formatQty(repairHours, "ore")} de funcționare`} />
              <Total
                label="Total exploatare"
                value={fuelTotal + repairTotal}
                caption="fără rata internă, care se aplică pe ore la retur"
              />
            </div>
          ) : null}

          {issueRows.length ? (
            <section className="space-y-2">
              <span className="eyebrow">Observații din teren</span>
              <Sheet>
                <Table>
                  <THead>
                    <TR>
                      <TH>Cod</TH>
                      <TH>Observație</TH>
                      <TH>Stare</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {issueRows.map((r) => (
                      <TR key={r.id}>
                        <TD>{r.code}</TD>
                        <TD>{r.title}</TD>
                        <TD>
                          <Badge tone={r.status === "neprocesata" ? "warn" : "fill"}>
                            {r.status === "neprocesata" ? "deschisă" : "rezolvată"}
                          </Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Sheet>
            </section>
          ) : null}
        </div>
      ) : null}

      {/* ─────────── Accesorii ─────────── */}
      {tab === "accesorii" ? (
        row.accessories.length === 0 ? (
          <EmptyState
            title="Fără accesorii înregistrate"
            hint="Accesoriile se bifează la predare și la retur, pe PV. Așa se vede cine a pierdut cupa de 60 sau lanțul de ridicare."
          />
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Accesoriu</TH>
                  <TH>Ultima predare</TH>
                  <TH>Ultimul retur</TH>
                </TR>
              </THead>
              <TBody>
                {row.accessories.map((acc) => {
                  const lastOut = protocolRows.find((p) => p.handoverAccessories.includes(acc));
                  const lastIn = protocolRows.find((p) => p.returnAccessories.includes(acc));
                  return (
                    <TR key={acc}>
                      <TD>{acc}</TD>
                      <TD muted>{lastOut ? formatDay(lastOut.handoverDate) : "—"}</TD>
                      <TD muted>{lastIn ? formatDay(lastIn.returnDate) : "—"}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Sheet>
        )
      ) : null}

      {/* ─────────── Motorină ─────────── */}
      {tab === "motorina" ? (
        fuel.length === 0 ? (
          <EmptyState
            title="Nicio alimentare înregistrată"
            hint="Fiecare alimentare cere și citirea contorului — e singurul moment în care contorul se actualizează sigur."
          />
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Data</TH>
                  <TH numeric>Litri</TH>
                  <TH numeric>Contor</TH>
                  {showPrices ? <TH numeric>Preț / litru</TH> : null}
                  {showPrices ? <TH numeric>Valoare</TH> : null}
                </TR>
              </THead>
              <TBody>
                {fuel.map((f) => (
                  <TR key={f.id}>
                    <TD>{formatDay(f.day)}</TD>
                    <TD numeric>{formatQty(f.liters)}</TD>
                    <TD numeric muted>{formatQty(f.hourMeter, "h")}</TD>
                    {showPrices ? (
                      <TD numeric muted>
                        <Money value={fromDb(f.pricePerLiter)} unit={null} />
                      </TD>
                    ) : null}
                    {showPrices ? (
                      <TD numeric strong>
                        <Money value={fromDb(f.value)} unit={null} />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
              <tfoot>
                <TFootRow>
                  <TD>{fuel.length} alimentări</TD>
                  <TD numeric>{formatQty(fuelLiters)}</TD>
                  <TD />
                  {showPrices ? <TD /> : null}
                  {showPrices ? (
                    <TD numeric>
                      <Money value={fuelTotal} unit={null} />
                    </TD>
                  ) : null}
                </TFootRow>
              </tfoot>
            </Table>
          </Sheet>
        )
      ) : null}

      {/* ─────────── Reparații ─────────── */}
      {tab === "reparatii" ? (
        repairRows.length === 0 ? (
          <EmptyState
            title="Nicio reparație înregistrată"
            hint="Costul reparației se raportează la ore de funcționare, nu la zile. Un utilaj care a lucrat 900 de ore și a costat 12.000 lei în reparații e alt utilaj decât unul cu aceeași sumă la 200 de ore."
          />
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Început</TH>
                  <TH>Tip</TH>
                  <TH>Descriere</TH>
                  <TH>Din observație</TH>
                  <TH numeric>Ore</TH>
                  {showPrices ? <TH numeric>Manoperă</TH> : null}
                  {showPrices ? <TH numeric>Materiale</TH> : null}
                  {showPrices ? <TH numeric>Total</TH> : null}
                  {showPrices ? <TH numeric>Lei / oră</TH> : null}
                </TR>
              </THead>
              <TBody>
                {repairRows.map(({ repair, request }) => {
                  const hours = Number(repair.hours ?? 0);
                  const total = fromDb(repair.totalCost);
                  return (
                    <TR key={repair.id}>
                      <TD>{formatDay(repair.startedAt)}</TD>
                      <TD muted>{REPAIR_KIND_LABEL[repair.kind]}</TD>
                      <TD className="max-w-72">
                        {repair.description}
                        {repair.immobilized ? (
                          <span className="ml-2 text-micro text-over">imobilizat</span>
                        ) : null}
                      </TD>
                      <TD muted>{request?.code ?? "—"}</TD>
                      <TD numeric>{formatQty(repair.hours)}</TD>
                      {showPrices ? (
                        <TD numeric muted>
                          <Money value={fromDb(repair.laborCost)} unit={null} />
                        </TD>
                      ) : null}
                      {showPrices ? (
                        <TD numeric muted>
                          <Money value={fromDb(repair.materialCost)} unit={null} />
                        </TD>
                      ) : null}
                      {showPrices ? (
                        <TD numeric strong>
                          <Money value={total} unit={null} />
                        </TD>
                      ) : null}
                      {showPrices ? (
                        <TD numeric muted>
                          {hours > 0 ? <Money value={Math.round(total / hours)} unit={null} /> : "—"}
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Sheet>
        )
      ) : null}

      {/* ─────────── Planificări ─────────── */}
      {tab === "planificari" ? (
        planningRows.length === 0 ? (
          <EmptyState title="Nicio planificare" hint="Planificările intră din solicitările de utilaj, când biroul alege bucata concretă." />
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>De la</TH>
                  <TH>Până la</TH>
                  <TH>Obiectiv</TH>
                  <TH>Responsabil</TH>
                  <TH>Operator</TH>
                  <TH>Stare</TH>
                </TR>
              </THead>
              <TBody>
                {planningRows.map(({ planning, objective, responsible }) => (
                  <TR key={planning.id}>
                    <TD>{formatDay(planning.fromDate)}</TD>
                    <TD>{formatDay(planning.toDate)}</TD>
                    <TD muted className="max-w-56 truncate">
                      {objective?.name ?? "—"}
                    </TD>
                    <TD muted>{responsible?.name ?? "—"}</TD>
                    <TD muted>{planning.withOperator ? "cu operator" : "fără"}</TD>
                    <TD>
                      <Badge tone={PLANNING_STATUS_TONE[planning.status]}>
                        {PLANNING_STATUS_LABEL[planning.status]}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Sheet>
        )
      ) : null}

      {/* ─────────── PV ─────────── */}
      {tab === "pv" ? (
        protocolRows.length === 0 ? (
          <EmptyState title="Niciun PV" hint="PV-ul de predare-primire e un singur document cu două etape: predarea se blochează la semnare, primirea se completează la retur." />
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>PV</TH>
                  <TH>Predat</TH>
                  <TH>Către</TH>
                  <TH>Primit</TH>
                  <TH numeric>Ore lucrate</TH>
                  <TH>Stare</TH>
                </TR>
              </THead>
              <TBody>
                {protocolRows.map((p) => {
                  const worked =
                    p.returnHourMeter != null && p.handoverHourMeter != null
                      ? Number(p.returnHourMeter) - Number(p.handoverHourMeter)
                      : null;
                  return (
                    <TR key={p.id}>
                      <TD>
                        <Link href={`/pv/${p.id}`} className="font-medium hover:text-blueprint">
                          {p.code}
                        </Link>
                      </TD>
                      <TD muted>{formatDay(p.handoverDate)}</TD>
                      <TD muted>{p.handoverToPersonName ?? "—"}</TD>
                      <TD muted>{formatDay(p.returnDate)}</TD>
                      <TD numeric>{worked !== null ? formatQty(worked, "h") : "—"}</TD>
                      <TD>
                        <Badge tone={p.status === "deschis" ? "warn" : "fill"}>
                          {PROTOCOL_STATUS_LABEL[p.status]}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Sheet>
        )
      ) : null}

      {/* ─────────── Poze ─────────── */}
      {tab === "poze" ? (
        photoRows.length === 0 ? (
          <EmptyState
            title="Nicio poză"
            hint="Pozele de la predare și retur sunt singura dovadă a stării în care a plecat utilajul. În producție intră cu geotag și thumbnail — vezi cusăturile din PLAN.md §7."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photoRows.map(({ version, node }) => (
              <div key={version.id} className="border border-rule-strong bg-sheet p-2">
                <div className="flex h-28 items-center justify-center border border-dashed border-rule text-micro text-ink-3">
                  {version.mimeType ?? "fișier"}
                </div>
                <div className="mt-2 truncate text-micro text-ink-2">{node.name}</div>
                <div className="text-micro text-ink-3">{version.phase ?? formatDay(version.takenAt ? String(version.takenAt).slice(0, 10) : null)}</div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function Total({ label, value, caption }: { label: string; value: number; caption: string }) {
  return (
    <div className="border border-rule-strong bg-sheet px-4 py-3">
      <div className="eyebrow mb-1">{label}</div>
      <div className="tabular font-narrow text-[1.25rem] font-semibold leading-none text-ink">
        <Money value={value} />
      </div>
      <div className="mt-1 text-micro text-ink-3">{caption}</div>
    </div>
  );
}
