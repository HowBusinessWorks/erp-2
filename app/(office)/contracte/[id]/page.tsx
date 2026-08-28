import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, sql as raw } from "drizzle-orm";

import { MonthNav } from "@/components/domain/MonthNav";
import { ObjectiveForm } from "@/components/domain/ObjectiveForm";
import { BudgetRow } from "@/components/ui/gauge";
import { Badge, EmptyState, PageHeader, SectionRule } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import {
  BudgetForm,
  ContractEditForm,
  ContractYearForm,
  ContractChecklistForm,
  LinkObjectiveForm,
  ObjectiveListsForm,
  RemoveChecklistButton,
  UnlinkObjectiveButton,
} from "./ContractForms";
import { budgetsForMonth, marginOf } from "@/lib/budget";
import { db } from "@/lib/db";
import {
  checklistTemplates,
  contractChecklists,
  objectiveChecklists,
  ticketTypes,
  componentBudgets,
  contractComponents,
  contractObjectives,
  contractYears,
  contracts,
  costEntries,
  firms,
  fundingAllocations,
  objectives,
  partners,
  periods,
  users,
  workUnits,
} from "@/lib/db/schema";
import { formatShort, fromDb } from "@/lib/money";
import { MONTHS_SHORT, labelPeriod, periodFromParams } from "@/lib/period";
import { can, canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const UNIT_KIND: Record<string, string> = {
  inspectie: "Inspecție",
  interventie: "Intervenție",
  lucrare: "Lucrare",
};

export default async function ContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ an?: string; luna?: string }>;
}) {
  const session = await requireSession();
  const showPrices = canSeePrices(session.role);
  const canEdit = can(session.role, "contracte.editeaza");
  const { id } = await params;
  const period = periodFromParams(await searchParams);

  const [row] = await db
    .select({ contract: contracts, client: partners, owner: users })
    .from(contracts)
    .leftJoin(partners, eq(contracts.clientId, partners.id))
    .leftJoin(users, eq(contracts.ownerId, users.id))
    .where(eq(contracts.id, id))
    .limit(1);
  if (!row) notFound();

  const { contract, client, owner } = row;

  const budgets = await budgetsForMonth(period.year, period.month, [id]);
  const budget = budgets.get(id);

  const [periodRow] = await db
    .select()
    .from(periods)
    .where(
      and(
        eq(periods.firmId, contract.firmId),
        eq(periods.year, period.year),
        eq(periods.month, period.month),
      ),
    )
    .limit(1);
  const isClosed = Boolean(periodRow?.closedAt);

  // Anul contractual în care cade luna afișată — marja se citește pe an, nu doar cumulat (§22.6).
  const day = `${period.year}-${String(period.month).padStart(2, "0")}-15`;
  const years = await db.select().from(contractYears).where(eq(contractYears.contractId, id));
  const activeYear = years.find((y) => y.startDate <= day && day <= y.endDate);

  // Cumulatul pe anul contractual curent
  const [cumulative] = activeYear
    ? await db
        .select({ total: raw<string>`coalesce(sum(${costEntries.value}), 0)` })
        .from(costEntries)
        .where(
          and(
            eq(costEntries.chargedContractId, id),
            raw`${costEntries.effectDate} between ${activeYear.startDate} and ${activeYear.endDate}`,
            raw`${costEntries.stage} <> 'angajat'`,
          ),
        )
    : [{ total: "0" }];

  const monthsElapsed = activeYear
    ? Math.max(
        1,
        Math.round(
          (new Date(day).getTime() - new Date(activeYear.startDate).getTime()) /
            (1000 * 60 * 60 * 24 * 30.4),
        ),
      )
    : 1;
  const cumulativeRevenue = (budget?.revenue ?? 0) * monthsElapsed;
  const cumulativeMargin = marginOf(cumulativeRevenue, fromDb(cumulative.total));

  // Unitățile de lucru finanțate din luna asta
  const financed = await db
    .select({
      unit: workUnits,
      objective: objectives,
      component: contractComponents,
      allocation: fundingAllocations,
    })
    .from(fundingAllocations)
    .innerJoin(workUnits, eq(fundingAllocations.workUnitId, workUnits.id))
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .leftJoin(contractComponents, eq(fundingAllocations.componentId, contractComponents.id))
    .where(
      and(
        eq(fundingAllocations.contractId, id),
        eq(fundingAllocations.year, period.year),
        eq(fundingAllocations.month, period.month),
        eq(fundingAllocations.status, "activ"),
      ),
    )
    .limit(60);

  // Pasul 4 din §9.2: obiectivele arondate, cu profilul lor de inspecție.
  const linked = await db
    .select({ link: contractObjectives, objective: objectives, template: checklistTemplates })
    .from(contractObjectives)
    .innerJoin(objectives, eq(contractObjectives.objectiveId, objectives.id))
    .leftJoin(checklistTemplates, eq(contractObjectives.checklistTemplateId, checklistTemplates.id))
    .where(eq(contractObjectives.contractId, id))
    .orderBy(asc(objectives.code));

  const activeLinks = linked.filter((l) => !l.link.toDate || l.link.toDate >= day);

  // Listele de inspecție: setul contractului + seturile proprii ale obiectivelor desprinse.
  const [contractLists, objectiveLists] = await Promise.all([
    db
      .select({ row: contractChecklists, template: checklistTemplates, type: ticketTypes })
      .from(contractChecklists)
      .innerJoin(checklistTemplates, eq(contractChecklists.templateId, checklistTemplates.id))
      .leftJoin(ticketTypes, eq(checklistTemplates.ticketTypeId, ticketTypes.id))
      .where(eq(contractChecklists.contractId, id))
      .orderBy(asc(checklistTemplates.name)),
    db
      .select({ row: objectiveChecklists, template: checklistTemplates })
      .from(objectiveChecklists)
      .innerJoin(checklistTemplates, eq(objectiveChecklists.templateId, checklistTemplates.id)),
  ]);

  const ownLists = new Map<string, { id: string; name: string; frequencyMonths: number }[]>();
  for (const { row, template } of objectiveLists) {
    const list = ownLists.get(row.contractObjectiveId) ?? [];
    list.push({ id: row.id, name: template.name, frequencyMonths: row.frequencyMonths });
    ownLists.set(row.contractObjectiveId, list);
  }

  // Datele de referință ale formularelor — doar când rolul poate edita.
  const components = await db
    .select()
    .from(contractComponents)
    .where(eq(contractComponents.contractId, id))
    .orderBy(asc(contractComponents.createdAt));

  const componentIds = components.map((c) => c.id);
  const monthBudgets = canEdit && componentIds.length > 0
    ? await db
        .select()
        .from(componentBudgets)
        .where(
          and(
            inArray(componentBudgets.componentId, componentIds),
            eq(componentBudgets.year, period.year),
            eq(componentBudgets.month, period.month),
          ),
        )
    : [];
  const budgetOf = new Map(monthBudgets.map((b) => [b.componentId, b]));

  const [firmOpts, clientOpts, ownerOpts, freeObjectives, templateOpts] = canEdit
    ? await Promise.all([
        db.select({ value: firms.id, label: firms.name }).from(firms).where(eq(firms.active, true)),
        db
          .select({ value: partners.id, label: partners.name })
          .from(partners)
          .where(raw`${partners.active} = true and 'client' = any(${partners.types})`),
        db
          .select({ value: users.id, label: users.name })
          .from(users)
          .where(raw`${users.active} = true and ${users.role} in ('pm', 'admin')`),
        db
          .select({ value: objectives.id, label: raw<string>`${objectives.code} || ' — ' || ${objectives.name}` })
          .from(objectives)
          .orderBy(asc(objectives.code)),
        db
          .select({ value: checklistTemplates.id, label: checklistTemplates.name })
          .from(checklistTemplates),
      ])
    : [[], [], [], [], []];

  const linkedIds = new Set(activeLinks.map((l) => l.objective.id));
  const availableObjectives = freeObjectives.filter((o) => !linkedIds.has(o.value));

  // Anul următor, propus: continuă de unde s-a oprit ultimul.
  const lastYear = [...years].sort((a, b) => b.yearNo - a.yearNo)[0];
  const nextStart = lastYear
    ? new Date(new Date(lastYear.endDate).getTime() + 86400000).toISOString().slice(0, 10)
    : contract.startDate;
  const nextEnd = `${Number(nextStart.slice(0, 4)) + 1}${nextStart.slice(4)}`;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={`Contract · ${client?.name ?? "—"}`}
        title={`${contract.code} — ${contract.name}`}
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Proprietar: {owner?.name ?? "—"}</span>
            <span aria-hidden>·</span>
            <span>
              {contract.startDate} → {contract.endDate}
            </span>
            <span aria-hidden>·</span>
            <span>{activeLinks.length} obiective</span>
            {activeYear ? (
              <>
                <span aria-hidden>·</span>
                <span>
                  anul {activeYear.yearNo} din {years.length}
                </span>
              </>
            ) : null}
            {Number(contract.indexationPercent) === 0 ? (
              <Badge tone="over">indexare 0%</Badge>
            ) : null}
          </span>
        }
        actions={
          <>
            <MonthNav period={period} basePath={`/contracte/${id}`} closed={isClosed} />
            {canEdit ? (
              <ContractEditForm
                contract={{
                  id: contract.id,
                  code: contract.code,
                  name: contract.name,
                  firmId: contract.firmId,
                  clientId: contract.clientId,
                  ownerId: contract.ownerId,
                  kind: contract.kind,
                  startDate: contract.startDate,
                  endDate: contract.endDate,
                  totalValue: contract.totalValue,
                  monthlyValue: contract.monthlyValue,
                  paymentDays: contract.paymentDays,
                  indexationPercent: contract.indexationPercent,
                  maintenanceThreshold: contract.maintenanceThreshold,
                  expiryAlertMonths: contract.expiryAlertMonths,
                }}
                firms={firmOpts}
                clients={clientOpts}
                owners={ownerOpts}
              />
            ) : null}
          </>
        }
      />

      <nav className="flex gap-4 border-b border-rule text-tiny">
        <span className="border-b-2 border-blueprint pb-1.5 font-medium text-ink">Plafoane</span>
        <Link
          href={`/contracte/${id}/ani`}
          className="pb-1.5 text-ink-2 transition-colors hover:text-ink"
        >
          Marjă pe ani
        </Link>
        <Link
          href={`/cost?contract=${id}&an=${period.year}&luna=${period.month}`}
          className="pb-1.5 text-ink-2 transition-colors hover:text-ink"
        >
          Registrul de cost
        </Link>
      </nav>

      {/* Ecranul din §4.3 — un singur bloc, per contract, per lună. */}
      {budget && showPrices ? (
        <section className="sheet px-5 py-4">
          <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
            <span className="eyebrow">Abonament lunar</span>
            <span className="tabular text-xl font-semibold text-ink">
              {formatShort(budget.subscription)} <span className="text-tiny text-ink-3">lei</span>
            </span>
          </div>

          <div className="divide-y divide-rule">
            {budget.views.map((view) => (
              <BudgetRow
                key={view.componentId}
                label={view.name}
                direction={view.direction}
                percent={view.percent}
                caption={
                  view.direction === "umple"
                    ? `plafon venit ${formatShort(view.cap)} · umplut ${formatShort(view.cap - (view.unfilled ?? 0))} · liber ${formatShort(view.unfilled ?? 0)}`
                    : `venit ${formatShort(view.revenue)} · plafon cost ${formatShort(view.cap)}`
                }
                right={
                  view.direction === "umple"
                    ? undefined
                    : `angajat ${formatShort(view.committed)} · consumat ${formatShort(view.consumed)} · rest ${formatShort(view.remaining)}`
                }
              />
            ))}
          </div>

          {/* Delta neumplută e venit pierdut fără cost — se spune pe față, nu se deduce. */}
          {budget.views
            .filter((v) => v.direction === "umple" && (v.unfilled ?? 0) > 0)
            .map((v) => (
              <p
                key={v.componentId}
                className="mt-2 border-l-2 border-over bg-over-soft px-3 py-2 text-tiny text-over"
              >
                {formatShort(v.unfilled ?? 0)} lei neumpluți din Delta lunii. Nu se reportează în
                luna următoare. <Link href="/cereri" className="underline">Vezi backlogul de propuneri</Link>
              </p>
            ))}

          <footer className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-rule-strong pt-2.5 text-tiny">
            <span className="text-ink-2">
              Marjă lună{" "}
              <span
                className={`tabular font-semibold ${budget.margin < 15 ? "text-over" : budget.margin < 22 ? "text-warn" : "text-fill"}`}
              >
                {budget.margin.toFixed(1)}%
              </span>
            </span>
            {activeYear ? (
              <span className="text-ink-2">
                Marjă cumulată anul {activeYear.yearNo}{" "}
                <span
                  className={`tabular font-semibold ${cumulativeMargin < 15 ? "text-over" : cumulativeMargin < 22 ? "text-warn" : "text-fill"}`}
                >
                  {cumulativeMargin.toFixed(1)}%
                </span>
              </span>
            ) : null}
          </footer>
        </section>
      ) : null}

      {canEdit && components.length > 0 ? (
        <section>
          <SectionRule right={isClosed ? "luna e închisă — plafoanele nu se mai schimbă" : undefined}>
            Plafoanele lunii {labelPeriod(period)}
          </SectionRule>
          <Sheet className="mt-2.5 flex flex-wrap items-center gap-2 px-3 py-2.5">
            {isClosed ? (
              <p className="text-tiny text-ink-2">
                Cifrele lunii au intrat deja în raport. Corecția e o realocare, nu o rescriere.
              </p>
            ) : (
              components.map((c) => {
                const b = budgetOf.get(c.id);
                return (
                  <span key={c.id} className="flex items-center gap-1.5 border border-rule px-2 py-1">
                    <span className="text-tiny text-ink-2">{c.name}</span>
                    <span className="tabular text-tiny font-medium text-ink">
                      {formatShort(fromDb(b?.plan ?? "0"))}
                    </span>
                    <BudgetForm
                      componentId={c.id}
                      componentName={c.name}
                      isDelta={c.kind === "delta"}
                      year={period.year}
                      month={period.month}
                      monthLabel={`${MONTHS_SHORT[period.month - 1]} ${period.year}`}
                      plan={b?.plan ?? "0"}
                      manualCap={b?.manualCap ?? null}
                      notes={b?.notes ?? null}
                    />
                  </span>
                );
              })
            )}
          </Sheet>
        </section>
      ) : null}

      <section>
        <SectionRule
          right={
            canEdit ? (
              <ContractChecklistForm contractId={id} templates={templateOpts} />
            ) : (
              `${contractLists.length} liste`
            )
          }
        >
          Liste de inspecție
        </SectionRule>
        <Sheet className="mt-2.5">
          {contractLists.length === 0 ? (
            <EmptyState
              title="Nicio listă pe contract"
              hint="Fără liste, inspecțiile rămân text liber. Listele puse aici se moștenesc automat de toate obiectivele contractului."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Listă</TH>
                  <TH>Tip de inspecție</TH>
                  <TH>Ritm</TH>
                  {canEdit ? <TH /> : null}
                </TR>
              </THead>
              <TBody>
                {contractLists.map(({ row, template, type }) => (
                  <TR key={row.id}>
                    <TD strong>{template.name}</TD>
                    <TD muted>{type?.name ?? template.discipline ?? "—"}</TD>
                    <TD>
                      <Badge tone="blueprint">
                        {row.frequencyMonths === 1 ? "lunar" : `la ${row.frequencyMonths} luni`}
                      </Badge>
                    </TD>
                    {canEdit ? (
                      <TD numeric>
                        <RemoveChecklistButton rowId={row.id} scope="contract" contractId={id} />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Sheet>
      </section>

      <section>
        <SectionRule
          right={
            canEdit ? (
              <span className="flex items-center gap-2">
                <ObjectiveForm contractId={id} label="＋ Obiectiv nou" variant="quiet" />
                <LinkObjectiveForm
                  contractId={id}
                  objectives={availableObjectives}
                  templates={templateOpts}
                />
              </span>
            ) : (
              `${activeLinks.length} obiective`
            )
          }
        >
          Obiective arondate
        </SectionRule>
        <Sheet className="mt-2.5">
          {linked.length === 0 ? (
            <EmptyState
              title="Niciun obiectiv pe contract"
              hint="Fără obiective, contractul n-are unde produce lucrări. Arondează unul existent sau creează-l pe loc."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Cod</TH>
                  <TH>Denumire</TH>
                  <TH>Tip</TH>
                  <TH>Perioadă pe contract</TH>
                  <TH>Inspecție</TH>
                  <TH>Liste</TH>
                  {canEdit ? <TH /> : null}
                </TR>
              </THead>
              <TBody>
                {linked.map(({ link, objective, template }) => {
                  const out = Boolean(link.toDate && link.toDate < day);
                  return (
                    <TR key={link.id} className={out ? "opacity-55" : undefined}>
                      <TD strong>
                        <Link href={`/obiective/${objective.id}`} className="hover:text-blueprint">
                          {objective.code}
                        </Link>
                      </TD>
                      <TD>{objective.name}</TD>
                      <TD muted>{objective.kind.replaceAll("_", " ")}</TD>
                      <TD muted>
                        {link.fromDate} → {link.toDate ?? "nedefinit"}
                      </TD>
                      <TD>
                        {link.inspectionFrequencyMonths ? (
                          <Badge tone="blueprint">la {link.inspectionFrequencyMonths} luni</Badge>
                        ) : (
                          <span className="text-ink-3">neprogramată</span>
                        )}
                      </TD>
                      <TD muted>
                        {link.inspectionSource === "propriu" ? (
                          <span>
                            proprii · {(ownLists.get(link.id) ?? []).length}
                          </span>
                        ) : (
                          <span className="text-ink-3">
                            moștenite · {contractLists.length}
                            {template ? ` (+ ${template.name})` : ""}
                          </span>
                        )}
                      </TD>
                      {canEdit ? (
                        <TD numeric>
                          {out ? (
                            <span className="text-micro text-ink-3">scos</span>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <ObjectiveListsForm
                                linkId={link.id}
                                contractId={id}
                                objectiveName={objective.name}
                                source={link.inspectionSource}
                                templates={templateOpts}
                                own={ownLists.get(link.id) ?? []}
                              />
                              <UnlinkObjectiveButton linkId={link.id} contractId={id} />
                            </div>
                          )}
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Sheet>
      </section>

      <section>
        <SectionRule
          right={
            canEdit ? (
              <ContractYearForm
                contractId={id}
                nextYearNo={(lastYear?.yearNo ?? 0) + 1}
                suggestedStart={nextStart}
                suggestedEnd={nextEnd}
                indexationPercent={contract.indexationPercent}
              />
            ) : (
              `${years.length} ani`
            )
          }
        >
          Ani contractuali
        </SectionRule>
        <Sheet className="mt-2.5 flex flex-wrap items-center gap-2 px-3 py-2.5">
          {years.length === 0 ? (
            <p className="text-tiny text-ink-2">Niciun an înregistrat.</p>
          ) : (
            [...years]
              .sort((a, b) => a.yearNo - b.yearNo)
              .map((y) => (
                <span
                  key={y.id}
                  className={`flex items-center gap-2 border px-2 py-1 ${
                    activeYear?.id === y.id ? "border-blueprint bg-blueprint-soft" : "border-rule"
                  }`}
                >
                  <span className="eyebrow">An {y.yearNo}</span>
                  <span className="text-micro text-ink-3">
                    {y.startDate} → {y.endDate}
                  </span>
                  {showPrices ? (
                    <span className="tabular text-tiny font-medium">
                      {formatShort(fromDb(y.monthlyValue))} lei/lună
                    </span>
                  ) : null}
                </span>
              ))
          )}
        </Sheet>
      </section>

      <section>
        <SectionRule right={`${financed.length} unități`}>
          Finanțate din {labelPeriod(period)}
        </SectionRule>
        <Sheet className="mt-2.5">
          {financed.length === 0 ? (
            <EmptyState
              title="Nicio unitate de lucru finanțată luna asta"
              hint="Unitățile apar aici după ce o cerere e rutată către o componentă a contractului, din ecranul de cereri."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Cod</TH>
                  <TH>Tip</TH>
                  <TH>Denumire</TH>
                  <TH>Obiectiv</TH>
                  <TH>Componentă</TH>
                  <TH numeric>Alocat</TH>
                </TR>
              </THead>
              <TBody>
                {financed.map(({ unit, objective, component, allocation }) => (
                  <TR key={allocation.id}>
                    <TD strong>
                      <Link href={`/lucrari/${unit.id}`} className="hover:text-blueprint">
                        {unit.code}
                      </Link>
                    </TD>
                    <TD>
                      <Badge tone={unit.kind === "lucrare" ? "blueprint" : "neutral"}>
                        {UNIT_KIND[unit.kind]}
                      </Badge>
                    </TD>
                    <TD>{unit.title}</TD>
                    <TD muted>{objective?.name ?? "—"}</TD>
                    <TD muted>{component?.name ?? "—"}</TD>
                    <TD numeric>
                      {showPrices ? formatShort(fromDb(allocation.allocatedValue)) : "····"}
                    </TD>
                  </TR>
                ))}
              </TBody>
              {showPrices ? (
                <tfoot>
                  <TFootRow>
                    <TD colSpan={5}>Total alocat</TD>
                    <TD numeric>
                      {formatShort(
                        financed.reduce((a, f) => a + fromDb(f.allocation.allocatedValue), 0),
                      )}
                    </TD>
                  </TFootRow>
                </tfoot>
              ) : null}
            </Table>
          )}
        </Sheet>
      </section>
    </div>
  );
}
