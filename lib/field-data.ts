import { and, asc, desc, eq, inArray, isNull, or, sql as raw } from "drizzle-orm";

import { db } from "./db";
import {
  contractObjectives,
  contracts,
  handoverProtocols,
  inspectionAnswers,
  interventionDetails,
  mediaSlots,
  objectives,
  packages,
  partners,
  poLines,
  products,
  purchaseOrders,
  pvDocuments,
  pvTemplates,
  siteJournalEntries,
  situatiiLucrari,
  slLines,
  stock,
  subcontractorAttendance,
  timesheets,
  tools,
  transports,
  users,
  warehouses,
  workUnitStages,
  workUnits,
} from "./db/schema";
import { todayIso } from "./field";

/**
 * Datele ecranelor noi de teren (blocul F — mockup-ul v3).
 *
 * Aceleași reguli ca în `lib/field.ts`: nicio funcție de aici nu întoarce lei.
 * Cantități, ore, ore-om, stări — atât. Șeful de șantier nu vede prețuri nicăieri.
 */

/* ══════════════════════════ mentenanță ══════════════════════════ */

export type MaintenanceRow = {
  id: string;
  code: string;
  title: string;
  kind: "inspectie" | "interventie";
  status: string;
  objectiveId: string;
  objectiveName: string;
  contractLabel: string | null;
  sourceTag: string | null;
  /** doar la inspecții: verdictul agregat al punctelor bifate */
  verdict: "fara_probleme" | "cu_probleme" | "rezolvate" | null;
  day: string | null;
};

export const SOURCE_LABEL: Record<string, string> = {
  tichet: "Tichet",
  solicitare: "Solicitare",
  inspectie: "În urma inspecției",
};

export const INSPECTION_TYPE_LABEL: Record<string, string> = {
  lunara: "Lunară",
  trimestriala: "Trimestrială",
  anuala: "Anuală",
  la_cerere: "La cerere",
};

export const DISCIPLINES = ["HVAC", "Electrice", "Sanitare", "PSI", "Construcții"];

/**
 * Tot ce ține de mentenanță pentru omul ăsta, inspecții și intervenții la un loc.
 *
 * Verdictul inspecției nu se ține pe unitate: se calculează din răspunsuri. Un câmp
 * `verdict` s-ar desincroniza în prima săptămână, la primul punct corectat.
 */
export async function maintenanceRows(userId: string): Promise<MaintenanceRow[]> {
  const rows = await db
    .select({ unit: workUnits, objective: objectives })
    .from(workUnits)
    .innerJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(
      and(
        inArray(workUnits.kind, ["inspectie", "interventie"]),
        or(eq(workUnits.responsibleId, userId), eq(workUnits.executant, "propriu")),
      ),
    )
    .orderBy(desc(workUnits.startDate), desc(workUnits.createdAt))
    .limit(80);

  if (rows.length === 0) return [];

  const unitIds = rows.map((r) => r.unit.id);
  const objectiveIds = [...new Set(rows.map((r) => r.objective.id))];

  const [answers, links] = await Promise.all([
    db
      .select({
        workUnitId: inspectionAnswers.workUnitId,
        ok: inspectionAnswers.ok,
        outcome: inspectionAnswers.outcome,
      })
      .from(inspectionAnswers)
      .where(inArray(inspectionAnswers.workUnitId, unitIds)),
    db
      .select({ objectiveId: contractObjectives.objectiveId, code: contracts.code })
      .from(contractObjectives)
      .innerJoin(contracts, eq(contractObjectives.contractId, contracts.id))
      .where(inArray(contractObjectives.objectiveId, objectiveIds)),
  ]);

  const contractByObjective = new Map<string, string>();
  for (const link of links) {
    if (!contractByObjective.has(link.objectiveId)) {
      contractByObjective.set(link.objectiveId, link.code);
    }
  }

  const byUnit = new Map<string, { nok: number; open: number }>();
  for (const answer of answers) {
    const acc = byUnit.get(answer.workUnitId) ?? { nok: 0, open: 0 };
    if (answer.ok === false) {
      acc.nok += 1;
      if (answer.outcome !== "rezolvat") acc.open += 1;
    }
    byUnit.set(answer.workUnitId, acc);
  }

  return rows.map(({ unit, objective }) => {
    const acc = byUnit.get(unit.id);
    return {
      id: unit.id,
      code: unit.code,
      title: unit.title,
      kind: unit.kind as "inspectie" | "interventie",
      status: unit.status,
      objectiveId: objective.id,
      objectiveName: objective.name,
      contractLabel: contractByObjective.get(objective.id) ?? null,
      sourceTag: unit.sourceTag,
      verdict:
        unit.kind !== "inspectie"
          ? null
          : !acc || acc.nok === 0
            ? ("fara_probleme" as const)
            : acc.open > 0
              ? ("cu_probleme" as const)
              : ("rezolvate" as const),
      day: unit.endDate ?? unit.startDate,
    };
  });
}

/** Fișa unei inspecții: antetul, punctele și intervenția pe care a produs-o. */
export async function inspectionDetail(id: string) {
  const [head] = await db
    .select({ unit: workUnits, objective: objectives, responsible: users })
    .from(workUnits)
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .leftJoin(users, eq(workUnits.responsibleId, users.id))
    .where(eq(workUnits.id, id))
    .limit(1);
  if (!head) return null;

  const [answers, media, followUps, subcontractor, link] = await Promise.all([
    db
      .select()
      .from(inspectionAnswers)
      .where(eq(inspectionAnswers.workUnitId, id))
      .orderBy(asc(inspectionAnswers.createdAt)),
    db
      .select()
      .from(mediaSlots)
      .where(eq(mediaSlots.workUnitId, id))
      .orderBy(asc(mediaSlots.createdAt)),
    db
      .select()
      .from(workUnits)
      .where(eq(workUnits.sourceUnitId, id))
      .orderBy(asc(workUnits.createdAt)),
    head.unit.subcontractorId
      ? db.select().from(partners).where(eq(partners.id, head.unit.subcontractorId)).limit(1)
      : Promise.resolve([]),
    db
      .select({ code: contracts.code })
      .from(contractObjectives)
      .innerJoin(contracts, eq(contractObjectives.contractId, contracts.id))
      .where(eq(contractObjectives.objectiveId, head.unit.objectiveId))
      .orderBy(desc(contractObjectives.fromDate))
      .limit(1),
  ]);

  return {
    unit: head.unit,
    objective: head.objective,
    responsibleName: head.responsible?.name ?? null,
    subcontractorName: subcontractor[0]?.name ?? null,
    contractLabel: link[0]?.code ?? null,
    answers,
    media,
    followUps,
  };
}

export type InterventionEvent = {
  key: string;
  at: Date;
  kind: "jurnal" | "ore" | "descriere";
  author: string | null;
  text: string;
  amount: string | null;
};

/**
 * Firul unei intervenții: descrieri, jurnal și ore, într-o singură ordine cronologică.
 *
 * Ecranul din v3 arată o conversație. Nu are nevoie de o tabelă de mesaje — evenimentele
 * există deja, împrăștiate în trei tabele. Le împletim aici, la citire.
 */
export async function interventionThread(id: string) {
  const [head] = await db
    .select({ unit: workUnits, objective: objectives, responsible: users })
    .from(workUnits)
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .leftJoin(users, eq(workUnits.responsibleId, users.id))
    .where(eq(workUnits.id, id))
    .limit(1);
  if (!head) return null;

  const [journal, hours, details, media, source, subcontractor, link, consumed] = await Promise.all([
    db
      .select({ entry: siteJournalEntries, author: users })
      .from(siteJournalEntries)
      .leftJoin(users, eq(siteJournalEntries.createdBy, users.id))
      .where(eq(siteJournalEntries.workUnitId, id))
      .orderBy(asc(siteJournalEntries.createdAt)),
    db
      .select({ sheet: timesheets, author: users })
      .from(timesheets)
      .leftJoin(users, eq(timesheets.userId, users.id))
      .where(eq(timesheets.workUnitId, id))
      .orderBy(asc(timesheets.createdAt)),
    db
      .select()
      .from(interventionDetails)
      .where(eq(interventionDetails.workUnitId, id))
      .orderBy(asc(interventionDetails.createdAt)),
    db
      .select()
      .from(mediaSlots)
      .where(eq(mediaSlots.workUnitId, id))
      .orderBy(asc(mediaSlots.createdAt)),
    head.unit.sourceUnitId
      ? db.select().from(workUnits).where(eq(workUnits.id, head.unit.sourceUnitId)).limit(1)
      : Promise.resolve([]),
    head.unit.subcontractorId
      ? db.select().from(partners).where(eq(partners.id, head.unit.subcontractorId)).limit(1)
      : Promise.resolve([]),
    db
      .select({ code: contracts.code })
      .from(contractObjectives)
      .innerJoin(contracts, eq(contractObjectives.contractId, contracts.id))
      .where(eq(contractObjectives.objectiveId, head.unit.objectiveId))
      .orderBy(desc(contractObjectives.fromDate))
      .limit(1),
    // materialele consumate pe fișă — CANTITĂȚI, niciodată valoarea
    db.execute<{ name: string; unit: string; quantity: string }>(
      raw`select p.name, p.unit, sum(cl.quantity) as quantity
          from consumption_notes cn
          join consumption_lines cl on cl.note_id = cn.id
          join products p on p.id = cl.product_id
          where cn.work_unit_id = ${id}
          group by p.name, p.unit
          order by p.name`,
    ),
  ]);

  const events: InterventionEvent[] = [];

  for (const detail of details) {
    if (!detail.description) continue;
    events.push({
      key: `d-${detail.id}`,
      at: detail.createdAt,
      kind: "descriere",
      author: head.responsible?.name ?? null,
      text: detail.description,
      amount: null,
    });
  }
  for (const { entry, author } of journal) {
    events.push({
      key: `j-${entry.id}`,
      at: entry.createdAt,
      kind: "jurnal",
      author: author?.name ?? null,
      text: entry.text,
      amount: null,
    });
  }
  for (const { sheet, author } of hours) {
    events.push({
      key: `t-${sheet.id}`,
      at: sheet.createdAt,
      kind: "ore",
      author: author?.name ?? null,
      text: sheet.note ?? "Ore trecute pe fișă",
      amount: `${Number(sheet.hours)} h`,
    });
  }

  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    unit: head.unit,
    objective: head.objective,
    responsibleName: head.responsible?.name ?? null,
    subcontractorName: subcontractor[0]?.name ?? null,
    contractLabel: link[0]?.code ?? null,
    sourceUnit: source[0] ?? null,
    events,
    totalHours: hours.reduce((sum, h) => sum + Number(h.sheet.hours), 0),
    materials: [...consumed].map((m) => ({
      name: m.name,
      unit: m.unit,
      quantity: Number(m.quantity),
    })),
    media,
  };
}

/* ══════════════════════════ timp ══════════════════════════ */

/** Echipa mea — oamenii pe care îi pot ponta. Prototip: colegii activi din aceeași firmă. */
export async function myTeam(userId: string) {
  const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return db
    .select({ id: users.id, name: users.name, qualification: users.qualification })
    .from(users)
    .where(
      and(eq(users.active, true), me?.firmId ? eq(users.firmId, me.firmId) : raw`true`),
    )
    .orderBy(asc(users.name))
    .limit(40);
}

/** Subcontractanții — pentru pontajul pe firme. */
export async function subcontractorPartners() {
  return db
    .select({ id: partners.id, name: partners.name })
    .from(partners)
    .where(raw`'subcontractant' = any(${partners.types})`)
    .orderBy(asc(partners.name))
    .limit(50);
}

/** Ce s-a pontat pe firme la o lucrare, într-o zi. */
export async function subcontractorDay(workUnitId: string, day: string) {
  return db
    .select({ row: subcontractorAttendance, partner: partners })
    .from(subcontractorAttendance)
    .innerJoin(partners, eq(subcontractorAttendance.partnerId, partners.id))
    .where(
      and(eq(subcontractorAttendance.workUnitId, workUnitId), eq(subcontractorAttendance.day, day)),
    )
    .orderBy(asc(partners.name));
}

/** Cumulul lunii pe firmă — cifra care se compară cu situația de lucrări declarată de ea. */
export async function subcontractorMonth(workUnitId: string, prefix: string) {
  return db
    .select({
      name: partners.name,
      manHours: raw<string>`coalesce(sum(${subcontractorAttendance.peopleCount} * ${subcontractorAttendance.hoursPerPerson}), 0)`,
    })
    .from(subcontractorAttendance)
    .innerJoin(partners, eq(subcontractorAttendance.partnerId, partners.id))
    .where(
      and(
        eq(subcontractorAttendance.workUnitId, workUnitId),
        raw`to_char(${subcontractorAttendance.day}, 'YYYY-MM') = ${prefix}`,
      ),
    )
    .groupBy(partners.name)
    .orderBy(asc(partners.name));
}

/* ══════════════════════════ lucrarea ══════════════════════════ */

/** Lucrările mele — lista din care se intră în ecranul cu patru file. */
export async function myWorks(userId: string) {
  const rows = await db
    .select({ unit: workUnits, objective: objectives })
    .from(workUnits)
    .innerJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(
      and(
        eq(workUnits.kind, "lucrare"),
        or(eq(workUnits.responsibleId, userId), eq(workUnits.executant, "propriu")),
      ),
    )
    .orderBy(desc(workUnits.startDate))
    .limit(30);

  if (rows.length === 0) return [];

  const stages = await db
    .select()
    .from(workUnitStages)
    .where(
      inArray(
        workUnitStages.workUnitId,
        rows.map((r) => r.unit.id),
      ),
    )
    .orderBy(asc(workUnitStages.position));

  const today = todayIso();
  return rows.map(({ unit, objective }) => {
    const list = stages.filter((s) => s.workUnitId === unit.id);
    const done = list.filter((s) => s.endDate && s.endDate < today).length;
    const current = list[Math.min(done, Math.max(list.length - 1, 0))] ?? null;
    return {
      id: unit.id,
      code: unit.code,
      title: unit.title,
      status: unit.status,
      objectiveName: objective.name,
      address: objective.address,
      stageLabel: current ? `Etapa ${current.position} din ${list.length} — ${current.name}` : null,
      percent: list.length ? Math.round((done / list.length) * 100) : 0,
      stageCount: list.length,
    };
  });
}

/** Tot ce încape în cele patru file ale unei lucrări: Jurnal · Echipă · Depozit · Acte. */
export async function workDetail(id: string) {
  const [head] = await db
    .select({ unit: workUnits, objective: objectives, responsible: users })
    .from(workUnits)
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .leftJoin(users, eq(workUnits.responsibleId, users.id))
    .where(eq(workUnits.id, id))
    .limit(1);
  if (!head) return null;

  const today = todayIso();
  const monthPrefix = today.slice(0, 7);

  const [stages, journal, media, siteStock, toolRows, situations, pvRows, firmsToday, firmsMonth, teamHours] =
    await Promise.all([
      db
        .select()
        .from(workUnitStages)
        .where(eq(workUnitStages.workUnitId, id))
        .orderBy(asc(workUnitStages.position)),
      db
        .select({ entry: siteJournalEntries, author: users })
        .from(siteJournalEntries)
        .leftJoin(users, eq(siteJournalEntries.createdBy, users.id))
        .where(eq(siteJournalEntries.workUnitId, id))
        .orderBy(desc(siteJournalEntries.createdAt))
        .limit(25),
      db.select().from(mediaSlots).where(eq(mediaSlots.workUnitId, id)),
      db
        .select({ stock, product: products, warehouse: warehouses })
        .from(stock)
        .innerJoin(products, eq(stock.productId, products.id))
        .innerJoin(warehouses, eq(stock.warehouseId, warehouses.id))
        .where(and(eq(warehouses.workUnitId, id), raw`${stock.quantity} > 0`))
        .orderBy(asc(products.name))
        .limit(40),
      db
        .select({ tool: tools, protocol: handoverProtocols })
        .from(handoverProtocols)
        .innerJoin(tools, eq(handoverProtocols.toolId, tools.id))
        .where(eq(handoverProtocols.workUnitId, id))
        .orderBy(desc(handoverProtocols.handoverDate))
        .limit(20),
      // Situația atârnă de PACHET, iar pachetul de lucrare — subcontractantul e pe pachet.
      db
        .select({
          situatie: situatiiLucrari,
          partner: partners,
          pending: raw<string>`(select count(*) from sl_lines l where l.situatie_id = ${situatiiLucrari.id} and l.verdict = 'neverificat')`,
        })
        .from(situatiiLucrari)
        .innerJoin(packages, eq(situatiiLucrari.packageId, packages.id))
        .leftJoin(partners, eq(packages.subcontractorId, partners.id))
        .where(eq(packages.workUnitId, id))
        .orderBy(desc(situatiiLucrari.year), desc(situatiiLucrari.month))
        .limit(10),
      db
        .select({ doc: pvDocuments, template: pvTemplates })
        .from(pvDocuments)
        .leftJoin(pvTemplates, eq(pvDocuments.templateId, pvTemplates.id))
        .where(eq(pvDocuments.workUnitId, id))
        .orderBy(desc(pvDocuments.createdAt))
        .limit(15),
      subcontractorDay(id, today),
      subcontractorMonth(id, monthPrefix),
      db
        .select({ total: raw<string>`coalesce(sum(${timesheets.hours}), 0)` })
        .from(timesheets)
        .where(and(eq(timesheets.workUnitId, id), eq(timesheets.day, today))),
    ]);

  const done = stages.filter((s) => s.endDate && s.endDate < today).length;
  const current = stages[Math.min(done, Math.max(stages.length - 1, 0))] ?? null;

  return {
    unit: head.unit,
    objective: head.objective,
    responsibleName: head.responsible?.name ?? null,
    stages,
    currentStage: current,
    percent: stages.length ? Math.round((done / stages.length) * 100) : 0,
    journal,
    media,
    beforeCount: media.filter((m) => m.slot === "inainte").length,
    afterCount: media.filter((m) => m.slot === "dupa").length,
    siteStock,
    tools: toolRows,
    situations,
    pvRows,
    firmsToday,
    firmsMonth,
    teamHoursToday: Number(teamHours[0]?.total ?? 0),
  };
}

/* ══════════════════════════ comenzi ══════════════════════════ */

export const URGENCY_LABEL: Record<string, string> = {
  poate_astepta: "Poate aștepta",
  normal: "Normal",
  urgent: "Urgent",
};

/**
 * Unde a ajuns o comandă. Timeline-ul din v3 nu are nevoie de o tabelă de istoric:
 * statusul comenzii spune la a câta treaptă e, iar treptele sunt fixe.
 */
const PO_STAGE: Record<string, { step: number; label: string; group: "astept" | "drum" | "gata" }> = {
  draft: { step: 1, label: "La magazie", group: "astept" },
  lansata: { step: 2, label: "Comandată", group: "astept" },
  confirmata: { step: 3, label: "Confirmată", group: "drum" },
  receptionata_partial: { step: 4, label: "Sosită parțial", group: "drum" },
  receptionata: { step: 5, label: "Primită", group: "gata" },
  anulata: { step: 5, label: "Acoperită din stoc", group: "gata" },
};

export const ORDER_STEPS = ["Trimisă", "La magazie", "Comandată", "Pe drum", "Primită"];

export type FieldOrder = {
  id: string;
  code: string;
  title: string;
  meta: string;
  placeName: string | null;
  step: number;
  stepLabel: string;
  group: "astept" | "drum" | "gata";
  urgency: string;
  neededBy: string | null;
  createdAt: Date;
  kind: "materiale" | "transport";
};

/** Comenzile mele: materiale/unelte (comenzi) și transporturi, într-o singură listă. */
export async function myOrders(userId: string): Promise<FieldOrder[]> {
  const [orders, trips] = await Promise.all([
    db
      .selectDistinctOn([purchaseOrders.id], {
        po: purchaseOrders,
        objective: objectives,
        lines: raw<string>`(select count(*) from po_lines l where l.po_id = ${purchaseOrders.id})`,
      })
      .from(purchaseOrders)
      .leftJoin(poLines, eq(poLines.poId, purchaseOrders.id))
      .leftJoin(workUnits, eq(poLines.workUnitId, workUnits.id))
      .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
      .where(eq(purchaseOrders.createdBy, userId))
      .orderBy(purchaseOrders.id)
      .limit(60),
    db
      .select({ trip: transports, objective: objectives })
      .from(transports)
      .leftJoin(objectives, eq(transports.toObjectiveId, objectives.id))
      .where(eq(transports.requestedBy, userId))
      .orderBy(desc(transports.createdAt))
      .limit(30),
  ]);

  const list: FieldOrder[] = [];

  for (const { po, objective, lines } of orders) {
    const stage = PO_STAGE[po.status] ?? { step: 1, label: po.status, group: "astept" as const };
    list.push({
      id: po.id,
      code: po.code,
      title: `${Number(lines)} ${Number(lines) === 1 ? "poziție" : "poziții"}`,
      meta: po.fieldNote ?? "Comandă din teren",
      placeName: objective?.name ?? null,
      step: stage.step,
      stepLabel: stage.label,
      group: stage.group,
      urgency: po.urgency,
      neededBy: po.neededBy,
      createdAt: po.createdAt,
      kind: "materiale",
    });
  }

  for (const { trip, objective } of trips) {
    const gata = trip.status === "efectuata";
    const drum = trip.status === "planificata";
    list.push({
      id: trip.id,
      code: trip.code,
      title: trip.description ?? "Transport",
      meta: `${trip.fromText ?? "—"} → ${trip.toText ?? "—"}`,
      placeName: objective?.name ?? null,
      step: gata ? 5 : drum ? 3 : 1,
      stepLabel: gata ? "Efectuată" : drum ? "Planificată" : "Cerută",
      group: gata ? "gata" : drum ? "drum" : "astept",
      urgency: "normal",
      neededBy: trip.day,
      createdAt: trip.createdAt,
      kind: "transport",
    });
  }

  return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Urmărirea unei comenzi de materiale: pozițiile și unde a ajuns. */
export async function orderDetail(id: string) {
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  if (!po) return null;

  const lines = await db
    .select({ line: poLines, product: products })
    .from(poLines)
    .innerJoin(products, eq(poLines.productId, products.id))
    .where(eq(poLines.poId, id))
    .orderBy(asc(products.name));

  const stage = PO_STAGE[po.status] ?? { step: 1, label: po.status, group: "astept" as const };
  return { po, lines, step: stage.step, stepLabel: stage.label };
}

/** Catalogul din care se face coșul. Fără prețuri — regula 5 nu are excepții. */
export async function catalogProducts(query?: string, category?: string) {
  return db
    .select({ id: products.id, name: products.name, unit: products.unit, category: products.category })
    .from(products)
    .where(
      and(
        eq(products.active, true),
        query ? raw`${products.name} ilike ${`%${query}%`}` : raw`true`,
        category && category !== "toate" ? eq(products.category, category) : raw`true`,
      ),
    )
    .orderBy(asc(products.name))
    .limit(60);
}

export async function catalogCategories() {
  const rows = await db
    .selectDistinct({ category: products.category })
    .from(products)
    .where(and(eq(products.active, true), raw`${products.category} is not null`))
    .orderBy(asc(products.category));
  return rows.map((r) => r.category).filter((c): c is string => Boolean(c));
}

/** Uneltele libere din depozit — se comandă la fel ca materialele, dar cu PV la primire. */
export async function catalogTools(query?: string) {
  return db
    .select({ id: tools.id, name: tools.name, code: tools.code, category: tools.category })
    .from(tools)
    .where(
      and(
        eq(tools.status, "activ"),
        isNull(tools.holderUserId),
        query ? raw`${tools.name} ilike ${`%${query}%`}` : raw`true`,
      ),
    )
    .orderBy(asc(tools.name))
    .limit(40);
}

/* ══════════════════════════ acte ══════════════════════════ */

export async function pvTemplateList() {
  return db
    .select({ id: pvTemplates.id, name: pvTemplates.name, kind: pvTemplates.kind })
    .from(pvTemplates)
    .where(eq(pvTemplates.active, true))
    .orderBy(asc(pvTemplates.name));
}

/** PV-ul de unelte: protocolul plus unealta de pe el. */
export async function toolProtocol(id: string) {
  const [row] = await db
    .select({ protocol: handoverProtocols, tool: tools })
    .from(handoverProtocols)
    .leftJoin(tools, eq(handoverProtocols.toolId, tools.id))
    .where(eq(handoverProtocols.id, id))
    .limit(1);
  return row ?? null;
}

export async function openToolProtocols(userId: string) {
  return db
    .select({ protocol: handoverProtocols, tool: tools })
    .from(handoverProtocols)
    .innerJoin(tools, eq(handoverProtocols.toolId, tools.id))
    .where(and(eq(handoverProtocols.status, "deschis"), eq(handoverProtocols.handoverToUserId, userId)))
    .orderBy(desc(handoverProtocols.handoverDate))
    .limit(20);
}

/** Câte poziții de situație mai am de verificat pe lucrarea asta — semnalul din fila „Acte". */
export async function pendingSlLines(workUnitId: string) {
  const [row] = await db
    .select({ n: raw<string>`count(*)` })
    .from(slLines)
    .innerJoin(situatiiLucrari, eq(slLines.situatieId, situatiiLucrari.id))
    .innerJoin(packages, eq(situatiiLucrari.packageId, packages.id))
    .where(and(eq(packages.workUnitId, workUnitId), eq(slLines.verdict, "neverificat")));
  return Number(row?.n ?? 0);
}
