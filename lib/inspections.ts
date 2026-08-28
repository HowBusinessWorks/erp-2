import { and, asc, eq, isNull, or, sql as raw } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  checklistItems,
  checklistTemplates,
  contractChecklists,
  contractObjectives,
  inspectionChecks,
  objectiveChecklists,
  ticketTypes,
} from "@/lib/db/schema";

/**
 * Listele de inspecție și acoperirea lunară.
 *
 * Două reguli care ies din discuția cu utilizatorul și nu se citesc din schemă:
 *
 * 1. **Moștenirea e o legătură, nu o copie.** Obiectivul cu `inspection_source = 'contract'`
 *    citește `contract_checklists`. Modifici lista pe contract — o iau toate obiectivele
 *    care moștenesc, fără migrare. Cine vrea altceva comută pe „propriu" și de atunci
 *    citește `objective_checklists`.
 *
 * 2. **Nu există scadență pe zi.** Mentenanța se face „când are cineva timp în luna aia".
 *    Deci întrebarea nu e „a întârziat cu 3 zile", ci „luna asta e acoperită sau nu".
 *    De-aia fișa poartă o LUNĂ DE RAPORTARE, nu doar data faptei.
 */

export type CheckPoint = {
  id: string;
  /** punctul din catalog, când există */
  checkId: string | null;
  text: string;
  section: string | null;
  guidance: string | null;
  requiresPhoto: boolean;
  requiresValue: boolean;
  valueUnit: string | null;
};

export type EffectiveList = {
  templateId: string;
  templateName: string;
  ticketTypeId: string | null;
  discipline: string;
  frequencyMonths: number;
  /** de unde vine: moștenită de la contract sau proprie obiectivului */
  inherited: boolean;
  points: CheckPoint[];
};

/**
 * Listele efective pentru obiectivele date, la data dată.
 * Un singur set de interogări pentru toate obiectivele — ecranul de teren le vrea
 * pe toate deodată, ca alegerea obiectivului să nu coste un tur la server.
 */
export async function effectiveLists(day: string): Promise<Map<string, EffectiveList[]>> {
  const links = await db
    .select({ link: contractObjectives })
    .from(contractObjectives)
    .where(
      and(
        raw`${contractObjectives.fromDate} <= ${day}`,
        or(isNull(contractObjectives.toDate), raw`${contractObjectives.toDate} >= ${day}`),
      ),
    );
  if (links.length === 0) return new Map();

  const [fromContract, fromObjective, templates, points] = await Promise.all([
    db
      .select({ row: contractChecklists })
      .from(contractChecklists),
    db.select({ row: objectiveChecklists }).from(objectiveChecklists),
    db
      .select({ t: checklistTemplates, type: ticketTypes })
      .from(checklistTemplates)
      .leftJoin(ticketTypes, eq(checklistTemplates.ticketTypeId, ticketTypes.id))
      .where(eq(checklistTemplates.active, true)),
    db
      .select({ item: checklistItems, check: inspectionChecks })
      .from(checklistItems)
      .leftJoin(inspectionChecks, eq(checklistItems.checkId, inspectionChecks.id))
      .orderBy(asc(checklistItems.position)),
  ]);

  const templateById = new Map(templates.map((r) => [r.t.id, r]));
  const pointsByTemplate = new Map<string, CheckPoint[]>();
  for (const row of points) {
    const list = pointsByTemplate.get(row.item.templateId) ?? [];
    list.push({
      id: row.item.id,
      checkId: row.item.checkId,
      text: row.check?.name ?? row.item.text,
      section: row.item.section,
      guidance: row.check?.guidance ?? null,
      requiresPhoto: row.check?.requiresPhoto ?? false,
      requiresValue: row.check?.requiresValue ?? false,
      valueUnit: row.check?.valueUnit ?? null,
    });
    pointsByTemplate.set(row.item.templateId, list);
  }

  const contractSets = new Map<string, { templateId: string; frequencyMonths: number }[]>();
  for (const { row } of fromContract) {
    const list = contractSets.get(row.contractId) ?? [];
    list.push({ templateId: row.templateId, frequencyMonths: row.frequencyMonths });
    contractSets.set(row.contractId, list);
  }
  const objectiveSets = new Map<string, { templateId: string; frequencyMonths: number }[]>();
  for (const { row } of fromObjective) {
    const list = objectiveSets.get(row.contractObjectiveId) ?? [];
    list.push({ templateId: row.templateId, frequencyMonths: row.frequencyMonths });
    objectiveSets.set(row.contractObjectiveId, list);
  }

  const result = new Map<string, EffectiveList[]>();
  for (const { link } of links) {
    const own = link.inspectionSource === "propriu";
    const source = own ? objectiveSets.get(link.id) : contractSets.get(link.contractId);
    const rows = source ?? [];

    // Compatibilitate cu datele vechi: un singur șablon pus direct pe legătură.
    const legacy =
      rows.length === 0 && link.checklistTemplateId
        ? [
            {
              templateId: link.checklistTemplateId,
              frequencyMonths: link.inspectionFrequencyMonths ?? 1,
            },
          ]
        : [];

    const lists: EffectiveList[] = [];
    for (const row of [...rows, ...legacy]) {
      const tpl = templateById.get(row.templateId);
      if (!tpl) continue;
      lists.push({
        templateId: tpl.t.id,
        templateName: tpl.t.name,
        ticketTypeId: tpl.t.ticketTypeId,
        discipline: tpl.type?.name ?? tpl.t.discipline ?? "General",
        frequencyMonths: row.frequencyMonths,
        inherited: !own,
        points: pointsByTemplate.get(tpl.t.id) ?? [],
      });
    }

    const existing = result.get(link.objectiveId) ?? [];
    // Același obiectiv poate fi pe două contracte — listele se adună, fără dublare.
    for (const list of lists) {
      if (!existing.some((e) => e.templateId === list.templateId)) existing.push(list);
    }
    result.set(link.objectiveId, existing);
  }
  return result;
}

/** Listele efective pentru un singur obiectiv. */
export async function listsForObjective(objectiveId: string, day: string): Promise<EffectiveList[]> {
  const all = await effectiveLists(day);
  return all.get(objectiveId) ?? [];
}

/**
 * Luna în care se datorează o listă cu ritm de N luni. Ancora e ianuarie:
 * la 3 luni se datorează în ianuarie, aprilie, iulie, octombrie. Simplu de explicat
 * clientului și nu depinde de când a fost făcută ultima dată.
 */
export function isDueInMonth(frequencyMonths: number, month: number): boolean {
  if (frequencyMonths <= 1) return true;
  return (month - 1) % frequencyMonths === 0;
}

/** Luna de raportare implicită pentru o dată de execuție. */
export function reportPeriodFor(day: string): { year: number; month: number } {
  const [y, m] = day.split("-");
  return { year: Number(y), month: Number(m) };
}
