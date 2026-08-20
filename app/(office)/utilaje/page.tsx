import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, lte, sql as raw } from "drizzle-orm";

import { Badge, Button, EmptyState, PageHeader, Select } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { shiftPlannings } from "@/app/actions/equipment";
import { db } from "@/lib/db";
import {
  equipment,
  equipmentPlannings,
  handoverProtocols,
  objectives,
  users,
} from "@/lib/db/schema";
import {
  EQUIPMENT_STATUS_LABEL,
  EQUIPMENT_STATUS_TONE,
  formatDay,
  formatQty,
  equipmentAlerts,
  shiftDate,
  startOfWeek,
  today as todayIso,
} from "@/lib/equipment";
import { formatShort, fromDb } from "@/lib/money";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Trei săptămâni: destul cât să vezi ce vine, nu atât cât să nu mai citești nimic. */
const SPAN_DAYS = 21;

export default async function UtilajePage({
  searchParams,
}: {
  searchParams: Promise<{ de_la?: string; stare?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const showPrices = canSeePrices(session.role);

  const today = todayIso();
  const from = sp.de_la ?? startOfWeek(today);
  const to = shiftDate(from, SPAN_DAYS - 1);
  const days = Array.from({ length: SPAN_DAYS }, (_, i) => shiftDate(from, i));

  const [fleet, plannings, openProtocols] = await Promise.all([
    db
      .select()
      .from(equipment)
      .where(sp.stare ? raw`${equipment.status} = ${sp.stare}` : undefined)
      .orderBy(asc(equipment.category), asc(equipment.code)),
    db
      .select({
        planning: equipmentPlannings,
        objective: objectives,
        responsible: users,
      })
      .from(equipmentPlannings)
      .leftJoin(objectives, eq(equipmentPlannings.objectiveId, objectives.id))
      .leftJoin(users, eq(equipmentPlannings.responsibleId, users.id))
      // fereastra: orice planificare care atinge intervalul afișat
      .where(
        and(
          lte(equipmentPlannings.fromDate, to),
          gte(equipmentPlannings.toDate, from),
          inArray(equipmentPlannings.status, ["planificata", "in_derulare"]),
        ),
      )
      .orderBy(asc(equipmentPlannings.fromDate)),
    db
      .select({ protocol: handoverProtocols, eq: equipment })
      .from(handoverProtocols)
      .leftJoin(equipment, eq(handoverProtocols.equipmentId, equipment.id))
      .where(eq(handoverProtocols.status, "deschis"))
      .orderBy(desc(handoverProtocols.handoverDate))
      .limit(20),
  ]);

  const byEquipment = new Map<string, typeof plannings>();
  for (const row of plannings) {
    const list = byEquipment.get(row.planning.equipmentId) ?? [];
    list.push(row);
    byEquipment.set(row.planning.equipmentId, list);
  }

  const alertsBy = new Map(fleet.map((e) => [e.id, equipmentAlerts(e, today)]));
  const expired = fleet.filter((e) => alertsBy.get(e.id)?.some((a) => a.severity === "expirat"));
  const immobilized = fleet.filter((e) => e.immobilizedFrom !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Resurse"
        title="Flota"
        meta="Revizia e scadentă pe dată sau pe ore de funcționare — care vine prima. Un utilaj imobilizat nu produce cost de exploatare cât stă."
        actions={
          <Link href="/utilaje/solicitari">
            <Button variant="primary" size="sm">
              Solicitări de utilaj
            </Button>
          </Link>
        }
      />

      {/* Ce trebuie văzut înainte de calendar: ce e expirat și ce stă imobilizat. */}
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Utilaje" value={String(fleet.length)} hint={`${immobilized.length} imobilizate`} />
        <Stat
          label="Scadențe depășite"
          value={String(expired.length)}
          hint="ITP, RCA, ISCIR sau revizie"
          tone={expired.length ? "over" : undefined}
        />
        <Stat
          label="PV rămase deschise"
          value={String(openProtocols.length)}
          hint="predate și neprimite înapoi"
          tone={openProtocols.length ? "warn" : undefined}
        />
      </div>

      {/* ─────────── calendarul ─────────── */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="eyebrow">
            Calendar · {formatDay(from)} – {formatDay(to)}
          </span>
          <div className="flex items-center gap-1.5">
            <NavLink href={`/utilaje?de_la=${shiftDate(from, -7)}`} label="‹ săptămâna trecută" />
            <NavLink href="/utilaje" label="azi" />
            <NavLink href={`/utilaje?de_la=${shiftDate(from, 7)}`} label="săptămâna viitoare ›" />
          </div>
        </div>

        <form action={shiftPlannings}>
          <Sheet>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-tiny">
                <thead>
                  <tr className="border-b border-rule">
                    <th className="sticky left-0 z-10 bg-sheet px-3 py-2 text-left font-medium text-ink-2">
                      Utilaj
                    </th>
                    {days.map((d) => {
                      const isToday = d === today;
                      const weekend = [5, 6].includes((new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7);
                      return (
                        <th
                          key={d}
                          className={`w-8 border-l border-rule px-0 py-2 text-center text-micro font-normal ${
                            isToday ? "bg-blueprint-soft font-semibold text-blueprint-ink" : ""
                          } ${weekend && !isToday ? "bg-sunk text-ink-3" : "text-ink-2"}`}
                        >
                          {Number(d.slice(8, 10))}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {fleet.map((e) => {
                    const rows = byEquipment.get(e.id) ?? [];
                    return (
                      <tr key={e.id} className="border-b border-rule last:border-0">
                        <td className="sticky left-0 z-10 bg-sheet px-3 py-1.5">
                          <Link href={`/utilaje/${e.id}`} className="font-medium hover:text-blueprint">
                            {e.code}
                          </Link>
                          <span className="ml-2 text-ink-3">{e.name}</span>
                          {e.immobilizedFrom ? (
                            <span className="ml-2 text-micro text-over">imobilizat</span>
                          ) : null}
                        </td>
                        {days.map((d) => {
                          const hit = rows.find(
                            (r) => r.planning.fromDate <= d && d <= r.planning.toDate,
                          );
                          const starts = hit?.planning.fromDate === d;
                          return (
                            <td
                              key={d}
                              className={`border-l border-rule p-0 ${d === today ? "bg-blueprint-soft/40" : ""}`}
                            >
                              {hit ? (
                                <span
                                  title={`${hit.objective?.name ?? "—"} · ${formatDay(hit.planning.fromDate)}–${formatDay(hit.planning.toDate)}${hit.planning.withOperator ? " · cu operator" : ""}`}
                                  className={`block h-5 ${
                                    hit.planning.status === "in_derulare"
                                      ? "bg-warn"
                                      : "bg-blueprint"
                                  } ${starts ? "rounded-l-[2px]" : ""} ${
                                    hit.planning.toDate === d ? "rounded-r-[2px]" : ""
                                  }`}
                                />
                              ) : (
                                <span className="block h-5" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Sheet>

          {/* ─────────── decalarea în masă ─────────── */}
          {plannings.length ? (
            <div className="mt-3 flex flex-wrap items-end gap-3 border border-rule-strong bg-sunk px-4 py-3">
              <div className="min-w-0 grow">
                <div className="eyebrow mb-1">Decalare în masă</div>
                <p className="max-w-prose text-micro text-ink-3">
                  Ploaia mută tot șantierul, nu o singură planificare. Bifează ce se amână și
                  dă numărul de zile. Planificările încheiate nu se decalează — sunt istorie.
                </p>
              </div>
              <label className="shrink-0">
                <span className="eyebrow mb-1 block">Zile</span>
                <Select name="days" defaultValue="1" className="w-28">
                  {[-3, -2, -1, 1, 2, 3, 5, 7].map((n) => (
                    <option key={n} value={n}>
                      {n > 0 ? `+${n}` : n}
                    </option>
                  ))}
                </Select>
              </label>
              <Button type="submit" variant="primary">
                Decalează bifatele
              </Button>
            </div>
          ) : null}

          {plannings.length ? (
            <Sheet className="mt-3">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-8" />
                    <TH>Utilaj</TH>
                    <TH>Obiectiv</TH>
                    <TH>Responsabil</TH>
                    <TH>De la</TH>
                    <TH>Până la</TH>
                    <TH>Operator</TH>
                  </TR>
                </THead>
                <TBody>
                  {plannings.map(({ planning, objective, responsible }) => {
                    const e = fleet.find((f) => f.id === planning.equipmentId);
                    return (
                      <TR key={planning.id}>
                        <TD>
                          <input
                            type="checkbox"
                            name="planningId"
                            value={planning.id}
                            className="size-3.5 accent-[var(--color-blueprint)]"
                          />
                        </TD>
                        <TD>
                          {e ? (
                            <Link href={`/utilaje/${e.id}`} className="hover:text-blueprint">
                              {e.code}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TD>
                        <TD muted className="max-w-56 truncate">
                          {objective?.name ?? "—"}
                        </TD>
                        <TD muted>{responsible?.name ?? "—"}</TD>
                        <TD muted>{formatDay(planning.fromDate)}</TD>
                        <TD muted>{formatDay(planning.toDate)}</TD>
                        <TD muted>{planning.withOperator ? "cu operator" : "fără"}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Sheet>
          ) : null}
        </form>
      </section>

      {/* ─────────── PV-uri rămase deschise ─────────── */}
      {openProtocols.length ? (
        <section className="space-y-2">
          <span className="eyebrow">PV rămase deschise</span>
          <p className="max-w-prose text-micro text-ink-3">
            Utilaj predat și neprimit înapoi. Cât PV-ul e deschis, nimeni nu răspunde formal
            de utilaj și orele lucrate nu au intrat în registrul de cost.
          </p>
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>PV</TH>
                  <TH>Utilaj</TH>
                  <TH>Predat la</TH>
                  <TH>Către</TH>
                  <TH numeric>Contor la predare</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {openProtocols.map(({ protocol, eq: e }) => (
                  <TR key={protocol.id}>
                    <TD>
                      <Link href={`/pv/${protocol.id}`} className="font-medium hover:text-blueprint">
                        {protocol.code}
                      </Link>
                    </TD>
                    <TD muted>{e ? `${e.code} · ${e.name}` : "—"}</TD>
                    <TD muted>{formatDay(protocol.handoverDate)}</TD>
                    <TD muted>{protocol.handoverToPersonName ?? "—"}</TD>
                    <TD numeric>{formatQty(protocol.handoverHourMeter, "h")}</TD>
                    <TD>
                      <Link href={`/pv/${protocol.id}`} className="text-tiny text-blueprint hover:underline">
                        primește înapoi →
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Sheet>
        </section>
      ) : null}

      {/* ─────────── registrul ─────────── */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-2">Registru</span>
          <Chip href="/utilaje" active={!sp.stare} label="Tot" />
          {Object.entries(EQUIPMENT_STATUS_LABEL).map(([key, label]) => (
            <Chip
              key={key}
              href={sp.stare === key ? "/utilaje" : `/utilaje?stare=${key}`}
              active={sp.stare === key}
              label={label}
            />
          ))}
        </div>

        {fleet.length === 0 ? (
          <EmptyState
            title="Niciun utilaj în filtrul ales"
            hint="Registrul ține și utilajele închiriate, nu doar pe cele proprii — costul cu chiria se vede lângă rata internă."
          />
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Cod</TH>
                  <TH>Denumire</TH>
                  <TH>Categorie</TH>
                  <TH>Stare</TH>
                  <TH numeric>Contor</TH>
                  <TH>Scadențe</TH>
                  {showPrices ? <TH numeric>Rată internă</TH> : null}
                </TR>
              </THead>
              <TBody>
                {fleet.map((e) => {
                  const alerts = alertsBy.get(e.id) ?? [];
                  return (
                    <TR key={e.id}>
                      <TD>
                        <Link href={`/utilaje/${e.id}`} className="font-medium hover:text-blueprint">
                          {e.code}
                        </Link>
                      </TD>
                      <TD>
                        <Link href={`/utilaje/${e.id}`} className="hover:text-blueprint">
                          {e.name}
                        </Link>
                        {e.isRented ? (
                          <span className="ml-2 text-micro text-ink-3">închiriat</span>
                        ) : null}
                      </TD>
                      <TD muted>{e.category}</TD>
                      <TD>
                        <Badge tone={EQUIPMENT_STATUS_TONE[e.status]}>
                          {EQUIPMENT_STATUS_LABEL[e.status]}
                        </Badge>
                      </TD>
                      <TD numeric>{formatQty(e.hourMeter, "h")}</TD>
                      <TD>
                        {alerts.length === 0 ? (
                          <span className="text-ink-3">—</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {alerts.map((a) => (
                              <Badge
                                key={a.kind}
                                tone={a.severity === "expirat" ? "over" : "warn"}
                              >
                                {a.label}
                                {a.hours !== null
                                  ? ` ${a.hours < 0 ? `${-a.hours}h depășite` : `${a.hours}h`}`
                                  : a.days !== null
                                    ? ` ${a.days < 0 ? `${-a.days}z depășite` : `${a.days}z`}`
                                    : ""}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </TD>
                      {showPrices ? (
                        <TD numeric>{formatShort(fromDb(e.internalHourlyRate))}/h</TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Sheet>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "over" | "warn";
}) {
  return (
    <div className="border border-rule-strong bg-sheet px-4 py-3">
      <div className="eyebrow mb-1">{label}</div>
      <div
        className={`tabular font-narrow text-[1.5rem] font-semibold leading-none ${
          tone === "over" ? "text-over" : tone === "warn" ? "text-warn" : "text-ink"
        }`}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-micro text-ink-3">{hint}</div> : null}
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-[3px] border border-rule-strong bg-sheet px-2 py-0.5 text-tiny text-ink-2 transition-colors hover:bg-sunk hover:text-ink"
    >
      {label}
    </Link>
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
