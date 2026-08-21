import { and, asc, desc, eq, gte, inArray, lte, ne, or, sql as raw } from "drizzle-orm";

import { db } from "./db";
import {
  contractObjectives,
  contracts,
  equipmentPlannings,
  handoverProtocols,
  objectives,
  poLines,
  purchaseOrders,
  requests,
  siteJournalEntries,
  situatiiLucrari,
  slLines,
  timesheets,
  workUnitStages,
  workUnits,
} from "./db/schema";

/**
 * Datele aplicației de teren.
 *
 * Ecranul „Azi" și meniul unui loc au nevoie de aceleași cifre; dacă fiecare pagină
 * și-ar scrie interogările, s-ar desincroniza în prima săptămână — „2 de făcut" pe
 * lista de locuri și trei puncte nebifate în interior. Sursa e una singură, aici.
 *
 * Zero lei se citește din tabelele astea. Nici o funcție de aici nu întoarce valori.
 */

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const OPEN_STATUSES = ["propusa", "planificata", "in_lucru"] as const;

export type Place = {
  objectiveId: string;
  name: string;
  code: string;
  address: string | null;
  /** șantier de construcții (are lucrare cu etape) sau obiectiv de mentenanță */
  type: "santier" | "mentenanta";
  contractLabel: string | null;
  /** doar la șantier: lucrarea deschisă și unde a ajuns */
  workUnitId: string | null;
  workUnitTitle: string | null;
  stageLabel: string | null;
  percent: number;
  /** câte lucruri sunt deschise aici */
  open: number;
};

/**
 * Locurile mele. Un „loc" e un OBIECTIV, nu o unitate de lucru: omul spune „sunt la
 * Bloc A2", nu „sunt pe UL-2411". Lucrările, inspecțiile și intervențiile de acolo se
 * adună sub el.
 */
export async function myPlaces(userId: string): Promise<Place[]> {
  const rows = await db
    .select({ unit: workUnits, objective: objectives })
    .from(workUnits)
    .innerJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(
      and(
        inArray(workUnits.status, [...OPEN_STATUSES]),
        or(eq(workUnits.responsibleId, userId), eq(workUnits.executant, "propriu")),
      ),
    )
    .orderBy(desc(workUnits.startDate))
    .limit(120);

  if (rows.length === 0) return [];

  const objectiveIds = [...new Set(rows.map((r) => r.objective.id))];

  const [links, stages] = await Promise.all([
    db
      .select({
        objectiveId: contractObjectives.objectiveId,
        code: contracts.code,
        kind: contracts.kind,
      })
      .from(contractObjectives)
      .innerJoin(contracts, eq(contractObjectives.contractId, contracts.id))
      .where(inArray(contractObjectives.objectiveId, objectiveIds)),
    db
      .select()
      .from(workUnitStages)
      .where(
        inArray(
          workUnitStages.workUnitId,
          rows.filter((r) => r.unit.kind === "lucrare").map((r) => r.unit.id),
        ),
      )
      .orderBy(asc(workUnitStages.position)),
  ]);

  const contractByObjective = new Map<string, string>();
  for (const link of links) {
    if (!contractByObjective.has(link.objectiveId)) contractByObjective.set(link.objectiveId, link.code);
  }

  const places = new Map<string, Place>();
  for (const { unit, objective } of rows) {
    const existing = places.get(objective.id);
    const isWork = unit.kind === "lucrare";

    if (!existing) {
      places.set(objective.id, {
        objectiveId: objective.id,
        name: objective.name,
        code: objective.code,
        address: objective.address,
        type: isWork ? "santier" : "mentenanta",
        contractLabel: contractByObjective.get(objective.id) ?? null,
        workUnitId: isWork ? unit.id : null,
        workUnitTitle: isWork ? unit.title : null,
        stageLabel: null,
        percent: 0,
        open: 1,
      });
      continue;
    }

    existing.open += 1;
    if (isWork && !existing.workUnitId) {
      existing.type = "santier";
      existing.workUnitId = unit.id;
      existing.workUnitTitle = unit.title;
    }
  }

  // Etapa curentă = prima care nu s-a terminat încă. Procentul e ponderea etapelor
  // încheiate — timp, nu bani: pe teren banii nu se văd niciodată.
  const today = todayIso();
  const byUnit = new Map<string, typeof stages>();
  for (const stage of stages) {
    const list = byUnit.get(stage.workUnitId) ?? [];
    list.push(stage);
    byUnit.set(stage.workUnitId, list);
  }
  for (const place of places.values()) {
    if (!place.workUnitId) continue;
    const list = byUnit.get(place.workUnitId) ?? [];
    if (list.length === 0) continue;
    const doneCount = list.filter((s) => s.endDate && s.endDate < today).length;
    const current = list[Math.min(doneCount, list.length - 1)];
    place.stageLabel = `Etapa ${current.position} din ${list.length} — ${current.name}`;
    place.percent = Math.round((doneCount / list.length) * 100);
  }

  return [...places.values()].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, "ro") : a.type === "santier" ? -1 : 1));
}

export async function placeById(objectiveId: string, userId: string) {
  const places = await myPlaces(userId);
  return places.find((p) => p.objectiveId === objectiveId) ?? null;
}

/** Unitățile de lucru deschise ale unui loc. */
export async function placeUnits(objectiveId: string, userId: string) {
  return db
    .select()
    .from(workUnits)
    .where(
      and(
        eq(workUnits.objectiveId, objectiveId),
        inArray(workUnits.status, [...OPEN_STATUSES]),
        or(eq(workUnits.responsibleId, userId), eq(workUnits.executant, "propriu")),
      ),
    )
    .orderBy(asc(workUnits.kind), desc(workUnits.startDate))
    .limit(40);
}

/* ─────────────────────────── ziua ta ─────────────────────────── */

export type DayTask = {
  key: string;
  title: string;
  meta: string;
  href: string;
  done: boolean;
  /** eticheta „ACUM" pe prima nefăcută */
  cta: string;
};

export type DayState = {
  tasks: DayTask[];
  doneCount: number;
  hoursToday: number;
  journalToday: boolean;
  slPending: number;
  openProtocols: number;
};

/**
 * Ce am de făcut azi. Ordinea nu e alfabetică și nu e a bazei de date: e ordinea
 * în care lucrurile devin dureroase dacă nu le faci. Pontajul nefăcut până seara
 * strică costul de manoperă al zilei; o situație neverificată strică o factură.
 */
export async function dayState(userId: string): Promise<DayState> {
  const today = todayIso();

  const [hours, journal, units, slRows, protocols] = await Promise.all([
    db
      .select({ total: raw<string>`coalesce(sum(${timesheets.hours}), 0)` })
      .from(timesheets)
      .where(and(eq(timesheets.userId, userId), eq(timesheets.day, today))),
    db
      .select({ n: raw<string>`count(*)` })
      .from(siteJournalEntries)
      .where(and(eq(siteJournalEntries.createdBy, userId), eq(siteJournalEntries.day, today))),
    db
      .select({ unit: workUnits, objective: objectives })
      .from(workUnits)
      .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
      .where(
        and(
          inArray(workUnits.status, ["planificata", "in_lucru"]),
          ne(workUnits.kind, "lucrare"),
          or(eq(workUnits.responsibleId, userId), eq(workUnits.executant, "propriu")),
        ),
      )
      .orderBy(asc(workUnits.startDate))
      .limit(6),
    db
      .select({ n: raw<string>`count(*)` })
      .from(slLines)
      .innerJoin(situatiiLucrari, eq(slLines.situatieId, situatiiLucrari.id))
      .where(and(eq(situatiiLucrari.status, "declarata"), eq(slLines.verdict, "neverificat"))),
    db
      .select({ n: raw<string>`count(*)` })
      .from(handoverProtocols)
      .innerJoin(equipmentPlannings, eq(handoverProtocols.planningId, equipmentPlannings.id))
      .where(
        and(
          eq(handoverProtocols.status, "deschis"),
          eq(equipmentPlannings.responsibleId, userId),
        ),
      ),
  ]);

  const hoursToday = Number(hours[0]?.total ?? 0);
  const journalToday = Number(journal[0]?.n ?? 0) > 0;
  const slPending = Number(slRows[0]?.n ?? 0);
  const openProtocols = Number(protocols[0]?.n ?? 0);

  const tasks: DayTask[] = [];

  for (const { unit, objective } of units) {
    tasks.push({
      key: unit.id,
      title: unit.title,
      meta: `${objective?.name ?? "—"} · ${unit.code}`,
      href: `/teren/${unit.id}`,
      done: false,
      cta: unit.kind === "inspectie" ? "Completează fișa" : "Deschide fișa",
    });
  }

  if (slPending > 0) {
    tasks.push({
      key: "sl",
      title: `${slPending} ${slPending === 1 ? "poziție de verificat" : "poziții de verificat"}`,
      meta: "Situații declarate de subcontractanți",
      href: "/teren/situatii",
      done: false,
      cta: "Verifică situațiile",
    });
  }

  if (openProtocols > 0) {
    tasks.push({
      key: "pv-utilaj",
      title: `${openProtocols} ${openProtocols === 1 ? "proces verbal deschis" : "procese verbale deschise"}`,
      meta: "Utilaje primite fără PV de predare",
      href: "/teren/utilaje",
      done: false,
      cta: "Închide procesul verbal",
    });
  }

  tasks.push({
    key: "jurnal",
    title: "Scrie în jurnalul de șantier",
    meta: journalToday ? "Scris azi" : "Ce s-a lucrat azi",
    href: "/teren/jurnal",
    done: journalToday,
    cta: "Scrie jurnalul",
  });

  tasks.push({
    key: "pontaj",
    title: "Pontajul de azi",
    meta: hoursToday > 0 ? `${hoursToday} ore pontate` : "Nimic pontat încă",
    href: "/teren/pontaj",
    done: hoursToday > 0,
    cta: "Pontează ziua",
  });

  return {
    tasks,
    doneCount: tasks.filter((t) => t.done).length,
    hoursToday,
    journalToday,
    slPending,
    openProtocols,
  };
}

/* ─────────────────────────── cererile mele ─────────────────────────── */

export type MyRequest = {
  id: string;
  code: string;
  title: string;
  meta: string;
  state: "asteapta" | "in_lucru" | "gata" | "respinsa";
  stateLabel: string;
  kind: "material" | "utilaj" | "constatare" | "unealta";
  createdAt: Date;
};

const PO_STATE: Record<string, { state: MyRequest["state"]; label: string }> = {
  draft: { state: "asteapta", label: "La magazie" },
  lansata: { state: "in_lucru", label: "Comandată" },
  confirmata: { state: "in_lucru", label: "Pe drum" },
  receptionata_partial: { state: "in_lucru", label: "Sosită parțial" },
  receptionata: { state: "gata", label: "Primită" },
  anulata: { state: "gata", label: "Acoperită din stoc" },
};

const REQ_STATE: Record<string, { state: MyRequest["state"]; label: string }> = {
  neprocesata: { state: "asteapta", label: "Așteaptă răspuns" },
  in_evaluare: { state: "asteapta", label: "În evaluare" },
  rutata: { state: "in_lucru", label: "Aprobată" },
  respinsa: { state: "respinsa", label: "Respinsă" },
  expirata: { state: "respinsa", label: "Expirată" },
};

/**
 * Tot ce am cerut, într-o singură listă — indiferent că a plecat ca necesar de
 * material (comandă) sau ca solicitare (cerere). Omul nu știe și nu-l interesează
 * în ce tabelă a aterizat: el a cerut ceva și vrea să vadă unde a ajuns.
 */
export async function myRequests(userId: string): Promise<MyRequest[]> {
  const [orders, reqs] = await Promise.all([
    db
      .selectDistinctOn([purchaseOrders.id], { po: purchaseOrders, objective: objectives })
      .from(purchaseOrders)
      .leftJoin(poLines, eq(poLines.poId, purchaseOrders.id))
      .leftJoin(workUnits, eq(poLines.workUnitId, workUnits.id))
      .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
      .where(eq(purchaseOrders.createdBy, userId))
      .orderBy(purchaseOrders.id)
      .limit(30),
    db
      .select({ request: requests, objective: objectives })
      .from(requests)
      .leftJoin(objectives, eq(requests.objectiveId, objectives.id))
      .where(eq(requests.requestedBy, userId))
      .orderBy(desc(requests.createdAt))
      .limit(30),
  ]);

  const list: MyRequest[] = [];

  for (const { po, objective } of orders) {
    const mapped = PO_STATE[po.status] ?? { state: "asteapta" as const, label: po.status };
    list.push({
      id: `po-${po.id}`,
      code: po.code,
      title: "Necesar de materiale",
      meta: objective?.name ?? "—",
      state: mapped.state,
      stateLabel: mapped.label,
      kind: "material",
      createdAt: po.createdAt,
    });
  }

  for (const { request, objective } of reqs) {
    const mapped = REQ_STATE[request.status] ?? { state: "asteapta" as const, label: request.status };
    list.push({
      id: `req-${request.id}`,
      code: request.code,
      title: request.title,
      meta: objective?.name ?? "—",
      state: mapped.state,
      stateLabel: mapped.label,
      kind:
        request.kind === "solicitare_utilaj"
          ? "utilaj"
          : request.kind === "observatie_utilaj"
            ? "utilaj"
            : "constatare",
      createdAt: request.createdAt,
    });
  }

  return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Ce se mișcă azi: comenzi lansate și cereri deschise, pentru fâșia de pe „Azi". */
export async function inFlight(userId: string) {
  return db
    .selectDistinctOn([purchaseOrders.id], { po: purchaseOrders, objective: objectives })
    .from(purchaseOrders)
    .leftJoin(poLines, eq(poLines.poId, purchaseOrders.id))
    .leftJoin(workUnits, eq(poLines.workUnitId, workUnits.id))
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(
      and(
        eq(purchaseOrders.createdBy, userId),
        inArray(purchaseOrders.status, ["draft", "lansata", "confirmata", "receptionata_partial"]),
      ),
    )
    .orderBy(purchaseOrders.id)
    .limit(4);
}

/** Utilajele mele de azi — pentru bara „ce se întâmplă azi" și meniul locului. */
export async function equipmentToday(userId: string) {
  const today = todayIso();
  return db
    .select({ planning: equipmentPlannings, objective: objectives })
    .from(equipmentPlannings)
    .leftJoin(objectives, eq(equipmentPlannings.objectiveId, objectives.id))
    .where(
      and(
        eq(equipmentPlannings.responsibleId, userId),
        lte(equipmentPlannings.fromDate, today),
        gte(equipmentPlannings.toDate, today),
        inArray(equipmentPlannings.status, ["planificata", "in_derulare"]),
      ),
    )
    .limit(10);
}
