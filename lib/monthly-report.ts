/**
 * Raportul lunar către client (§20.1).
 *
 * „Banii se primesc în baza unui raport" — deci raportul e la fel de important ca
 * factura, și se construiește din aceleași date, nu se scrie de mână în Word.
 *
 * Se agregă pe analitica **folosit** (unde s-a întâmplat fizic munca), nu pe
 * „descărcat". Clientul vrea să știe ce s-a lucrat la obiectivele LUI, indiferent pe
 * ce buget intern a căzut banul.
 */

import { and, eq, inArray, sql as raw } from "drizzle-orm";

import { db } from "./db";
import {
  contractObjectives,
  costEntries,
  fundingAllocations,
  inspectionAnswers,
  interventionDetails,
  objectives,
  timesheets,
  workUnits,
} from "./db/schema";
import { monthlySubscription } from "./budget";
import { fromDb, type Bani } from "./money";
import { monthRange } from "./period";

export type ReportContent = {
  generatedAt: string;
  subscription: Bani;
  totals: {
    inspections: number;
    interventions: number;
    works: number;
    hours: number;
    nokPoints: number;
    objectivesTouched: number;
    objectivesContracted: number;
  };
  lines: {
    objectiveCode: string;
    objectiveName: string;
    items: { code: string; kind: string; title: string; hours: number; status: string }[];
  }[];
  /** constatările deschise din inspecțiile lunii — argumentul pentru lucrările următoare */
  findings: { objectiveName: string; text: string; outcome: string | null }[];
};

export async function buildReportContent(
  contractId: string,
  year: number,
  month: number,
): Promise<ReportContent> {
  const { from, to } = monthRange({ year, month });

  const [contracted, unitRows, subscription] = await Promise.all([
    db
      .select({ objectiveId: contractObjectives.objectiveId })
      .from(contractObjectives)
      .where(
        and(
          eq(contractObjectives.contractId, contractId),
          raw`${contractObjectives.fromDate} <= ${to}`,
          raw`(${contractObjectives.toDate} is null or ${contractObjectives.toDate} >= ${from})`,
        ),
      ),
    /**
     * Unitățile lunii: cele finanțate de contract (alocare activă) SAU cele care au
     * produs cost pe analitica „folosit" a contractului. A doua condiție prinde
     * munca făcută la obiectivele clientului și decontată pe alt buget.
     */
    db
      .selectDistinct({ unit: workUnits, objective: objectives })
      .from(workUnits)
      .innerJoin(objectives, eq(workUnits.objectiveId, objectives.id))
      .leftJoin(fundingAllocations, eq(fundingAllocations.workUnitId, workUnits.id))
      .leftJoin(costEntries, eq(costEntries.workUnitId, workUnits.id))
      .where(
        and(
          raw`coalesce(${workUnits.endDate}, ${workUnits.startDate}) between ${from} and ${to}`,
          raw`(${fundingAllocations.contractId} = ${contractId} or ${costEntries.usedContractId} = ${contractId})`,
        ),
      ),
    monthlySubscription(contractId, year, month),
  ]);

  const unitIds = unitRows.map((r) => r.unit.id);

  const [hoursRows, nokRows, interventions] = await Promise.all([
    unitIds.length
      ? db
          .select({
            workUnitId: timesheets.workUnitId,
            total: raw<string>`sum(${timesheets.hours})`,
          })
          .from(timesheets)
          .where(inArray(timesheets.workUnitId, unitIds))
          .groupBy(timesheets.workUnitId)
      : [],
    unitIds.length
      ? db
          .select({ answer: inspectionAnswers, unit: workUnits, objective: objectives })
          .from(inspectionAnswers)
          .innerJoin(workUnits, eq(inspectionAnswers.workUnitId, workUnits.id))
          .innerJoin(objectives, eq(workUnits.objectiveId, objectives.id))
          .where(and(inArray(inspectionAnswers.workUnitId, unitIds), eq(inspectionAnswers.ok, false)))
      : [],
    unitIds.length
      ? db
          .select()
          .from(interventionDetails)
          .where(inArray(interventionDetails.workUnitId, unitIds))
      : [],
  ]);

  const hoursBy = new Map(hoursRows.map((h) => [h.workUnitId, Number(h.total)]));
  // orele declarate pe fișa de intervenție completează pontajul acolo unde nu există
  for (const detail of interventions) {
    if (!hoursBy.has(detail.workUnitId)) {
      hoursBy.set(detail.workUnitId, Number(detail.hoursDeclared) * detail.peopleCount);
    }
  }

  const byObjective = new Map<string, ReportContent["lines"][number]>();
  for (const { unit, objective } of unitRows) {
    const entry = byObjective.get(objective.id) ?? {
      objectiveCode: objective.code,
      objectiveName: objective.name,
      items: [],
    };
    entry.items.push({
      code: unit.code,
      kind: unit.kind,
      title: unit.title,
      hours: hoursBy.get(unit.id) ?? 0,
      status: unit.status,
    });
    byObjective.set(objective.id, entry);
  }

  const lines = [...byObjective.values()].sort((a, b) =>
    a.objectiveCode.localeCompare(b.objectiveCode),
  );

  return {
    generatedAt: new Date().toISOString(),
    subscription,
    totals: {
      inspections: unitRows.filter((r) => r.unit.kind === "inspectie").length,
      interventions: unitRows.filter((r) => r.unit.kind === "interventie").length,
      works: unitRows.filter((r) => r.unit.kind === "lucrare").length,
      hours: [...hoursBy.values()].reduce((a, h) => a + h, 0),
      nokPoints: nokRows.length,
      objectivesTouched: byObjective.size,
      objectivesContracted: contracted.length,
    },
    lines,
    findings: nokRows.slice(0, 30).map(({ answer, objective }) => ({
      objectiveName: objective.name,
      text: answer.itemText,
      outcome: answer.outcome,
    })),
  };
}

/** Costul real al lunii pe analitica „folosit" — intern, nu apare în raportul clientului. */
export async function internalCostForContract(
  contractId: string,
  year: number,
  month: number,
): Promise<Bani> {
  const [row] = await db
    .select({ total: raw<string>`coalesce(sum(${costEntries.value}), 0)` })
    .from(costEntries)
    .where(
      and(
        eq(costEntries.usedContractId, contractId),
        raw`extract(year from ${costEntries.effectDate}) = ${year}`,
        raw`extract(month from ${costEntries.effectDate}) = ${month}`,
        raw`${costEntries.stage} <> 'angajat'`,
      ),
    );
  return fromDb(row?.total ?? "0");
}
