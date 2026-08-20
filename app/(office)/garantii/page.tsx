import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";

import { decideSupplement, releaseRetention } from "@/app/actions/deviz";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { Money } from "@/components/ui/gauge";
import { db } from "@/lib/db";
import {
  contracts,
  packages,
  partners,
  retentions,
  situatiiLucrari,
  supplements,
  users,
  workUnits,
} from "@/lib/db/schema";
import {
  SUPPLEMENT_STATUS_LABEL,
  VERDICT_LABEL,
  VERDICT_TONE,
  retentionSchedule,
} from "@/lib/deviz";
import { formatDay, today as todayIso } from "@/lib/equipment";
import { fromDb, multiplyQty } from "@/lib/money";
import { can, canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function GarantiiPage() {
  const session = await requireSession();
  const showPrices = canSeePrices(session.role);
  const canDecide = can(session.role, "suplimentari.decide");
  const today = todayIso();

  const [supplementRows, retentionRows] = await Promise.all([
    db
      .select({
        supplement: supplements,
        pkg: packages,
        subcontractor: partners,
        sl: situatiiLucrari,
        decider: users,
      })
      .from(supplements)
      .leftJoin(packages, eq(supplements.packageId, packages.id))
      .leftJoin(partners, eq(packages.subcontractorId, partners.id))
      .leftJoin(situatiiLucrari, eq(supplements.situatieId, situatiiLucrari.id))
      .leftJoin(users, eq(supplements.decidedBy, users.id))
      .orderBy(asc(supplements.status), desc(supplements.createdAt))
      .limit(60),
    db
      .select({
        retention: retentions,
        partner: partners,
        contract: contracts,
        unit: workUnits,
      })
      .from(retentions)
      .leftJoin(partners, eq(retentions.partnerId, partners.id))
      .leftJoin(contracts, eq(retentions.contractId, contracts.id))
      .leftJoin(workUnits, eq(retentions.workUnitId, workUnits.id))
      .orderBy(asc(retentions.dueDate))
      .limit(120),
  ]);

  const schedule = retentionSchedule(
    retentionRows.map((r) => ({
      value: r.retention.value,
      dueDate: r.retention.dueDate,
      releasedAt: r.retention.releasedAt,
    })),
    today,
    fromDb,
  );

  const pending = supplementRows.filter((s) => s.supplement.status === "propus");
  const held = retentionRows.filter((r) => r.retention.direction === "retinuta");
  const owed = retentionRows.filter((r) => r.retention.direction === "datorata");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comercial"
        title="Suplimentări și garanții"
        meta="Suplimentarea e atomică: linia de pachet și linia de situație se creează în aceeași tranzacție. În doi pași, o cădere între ei ar lăsa o situație facturabilă fără acoperire în pachet."
      />

      {/* ─────────── suplimentări ─────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="eyebrow shrink-0">Suplimentări</span>
          <span aria-hidden className="h-px grow bg-rule" />
          <span className="shrink-0 text-micro text-ink-3">
            {pending.length} de decis din {supplementRows.length}
          </span>
        </div>

        {supplementRows.length === 0 ? (
          <EmptyState
            title="Nicio suplimentare"
            hint="O suplimentare apare când s-a executat mai mult decât s-a contractat. E singura ieșire corectă dintr-o situație care depășește cantitatea."
          />
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Ce s-a executat în plus</TH>
                  <TH>Pachet</TH>
                  <TH>Subcontractant</TH>
                  <TH>UM</TH>
                  <TH numeric>Cantitate</TH>
                  {showPrices ? <TH numeric>Preț</TH> : null}
                  {showPrices ? <TH numeric>Valoare</TH> : null}
                  <TH>Verificare teren</TH>
                  <TH>Motiv</TH>
                  <TH>Decizie</TH>
                </TR>
              </THead>
              <TBody>
                {supplementRows.map(({ supplement, pkg, subcontractor, decider }) => {
                  const value = multiplyQty(
                    fromDb(supplement.unitPrice),
                    Number(supplement.quantity ?? 0),
                  );
                  return (
                    <TR key={supplement.id}>
                      <TD className="max-w-64">{supplement.name}</TD>
                      <TD muted>
                        {pkg ? (
                          <Link href={`/pachete/${pkg.id}`} className="hover:text-blueprint">
                            {pkg.code}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD muted>{subcontractor?.name ?? "—"}</TD>
                      <TD muted>{supplement.unit}</TD>
                      <TD numeric>{Number(supplement.quantity ?? 0)}</TD>
                      {showPrices ? (
                        <TD numeric muted>
                          <Money value={fromDb(supplement.unitPrice)} unit={null} />
                        </TD>
                      ) : null}
                      {showPrices ? (
                        <TD numeric strong>
                          <Money value={value} unit={null} />
                        </TD>
                      ) : null}
                      <TD>
                        <Badge tone={VERDICT_TONE[supplement.verdict]}>
                          {VERDICT_LABEL[supplement.verdict]}
                        </Badge>
                      </TD>
                      <TD muted className="max-w-48 truncate" title={supplement.reason ?? ""}>
                        {supplement.reason ?? "—"}
                      </TD>
                      <TD>
                        {supplement.status !== "propus" ? (
                          <span className="text-tiny">
                            <Badge tone={supplement.status === "acceptat" ? "fill" : "neutral"}>
                              {SUPPLEMENT_STATUS_LABEL[supplement.status]}
                            </Badge>
                            {decider ? (
                              <span className="ml-1.5 text-micro text-ink-3">{decider.name}</span>
                            ) : null}
                          </span>
                        ) : canDecide ? (
                          <div className="flex items-center gap-1.5">
                            <form action={decideSupplement}>
                              <input type="hidden" name="supplementId" value={supplement.id} />
                              <input type="hidden" name="decision" value="acceptat" />
                              <Button type="submit" size="sm" variant="primary">
                                Acceptă
                              </Button>
                            </form>
                            <form action={decideSupplement}>
                              <input type="hidden" name="supplementId" value={supplement.id} />
                              <input type="hidden" name="decision" value="respins" />
                              <button
                                type="submit"
                                className="text-micro text-over hover:underline"
                              >
                                respinge
                              </button>
                            </form>
                          </div>
                        ) : (
                          <Badge tone="warn">Propusă</Badge>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Sheet>
        )}

        {pending.length ? (
          <p className="max-w-prose border-l-2 border-blueprint bg-blueprint-soft px-3 py-2 text-tiny text-blueprint-ink">
            La acceptare, linia intră în pachet ca <em>cantitate contractată</em> și, în aceeași
            tranzacție, în situația care a cerut-o. De aici încolo, cumulatul are unde să încapă.
          </p>
        ) : null}
      </section>

      {/* ─────────── garanții ─────────── */}
      {showPrices ? (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="eyebrow shrink-0">Garanții de bună execuție</span>
            <span aria-hidden className="h-px grow bg-rule" />
            <span className="shrink-0 text-micro text-ink-3">
              {held.length} reținute de noi · {owed.length} reținute nouă
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {Object.entries(schedule).map(([key, bucket]) => (
              <div
                key={key}
                className={`border px-4 py-3 ${
                  key === "scadente" && bucket.value > 0
                    ? "border-warn bg-warn-soft"
                    : "border-rule-strong bg-sheet"
                }`}
              >
                <div className="eyebrow mb-1">{bucket.label}</div>
                <div
                  className={`tabular font-narrow text-[1.25rem] font-semibold leading-none ${
                    key === "scadente" && bucket.value > 0 ? "text-warn" : "text-ink"
                  }`}
                >
                  <Money value={bucket.value} />
                </div>
                <div className="mt-1 text-micro text-ink-3">
                  {bucket.count} {bucket.count === 1 ? "reținere" : "rețineri"}
                </div>
              </div>
            ))}
          </div>

          {retentionRows.length === 0 ? (
            <EmptyState
              title="Nicio garanție"
              hint="Garanția se naște din situația aprobată, nu se introduce de mână."
            />
          ) : (
            <Sheet>
              <Table>
                <THead>
                  <TR>
                    <TH>Sens</TH>
                    <TH>Partener</TH>
                    <TH>Din</TH>
                    <TH numeric>Procent</TH>
                    <TH numeric>Valoare</TH>
                    <TH>Scadență</TH>
                    <TH>Stare</TH>
                    {canDecide ? <TH /> : null}
                  </TR>
                </THead>
                <TBody>
                  {retentionRows.map(({ retention, partner, unit }) => {
                    const due = retention.dueDate;
                    const overdue = !retention.releasedAt && due !== null && due <= today;
                    return (
                      <TR key={retention.id}>
                        <TD muted>
                          {retention.direction === "retinuta" ? "reținem noi" : "ni se reține"}
                        </TD>
                        <TD>{partner?.name ?? "—"}</TD>
                        <TD muted className="max-w-40 truncate">
                          {unit?.code ?? retention.note ?? "—"}
                        </TD>
                        <TD numeric muted>
                          {retention.percent ? `${Number(retention.percent)}%` : "—"}
                        </TD>
                        <TD numeric strong>
                          <Money value={fromDb(retention.value)} unit={null} />
                        </TD>
                        <TD muted className={overdue ? "text-warn" : undefined}>
                          {formatDay(due)}
                        </TD>
                        <TD>
                          {retention.releasedAt ? (
                            <Badge tone="fill">
                              Eliberată {formatDay(String(retention.releasedAt).slice(0, 10))}
                            </Badge>
                          ) : overdue ? (
                            <Badge tone="warn">Scadentă</Badge>
                          ) : (
                            <Badge>Reținută</Badge>
                          )}
                        </TD>
                        {canDecide ? (
                          <TD>
                            {!retention.releasedAt && overdue ? (
                              <form action={releaseRetention}>
                                <input type="hidden" name="retentionId" value={retention.id} />
                                <Button type="submit" size="sm">
                                  Eliberează
                                </Button>
                              </form>
                            ) : null}
                          </TD>
                        ) : null}
                      </TR>
                    );
                  })}
                </TBody>
                <tfoot>
                  <TFootRow>
                    <TD colSpan={4}>{retentionRows.length} rețineri</TD>
                    <TD numeric>
                      <Money
                        value={retentionRows.reduce((a, r) => a + fromDb(r.retention.value), 0)}
                        unit={null}
                      />
                    </TD>
                    <TD colSpan={canDecide ? 3 : 2} />
                  </TFootRow>
                </tfoot>
              </Table>
            </Sheet>
          )}
        </section>
      ) : null}
    </div>
  );
}
