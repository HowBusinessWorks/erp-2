/**
 * Motorul de plafoane (§4.2, §4.3).
 *
 * Sistemul ține pe fiecare componentă: plan · angajat · consumat · rest · proiecție.
 *
 * ATENȚIE la asimetrie — e cea mai ușor de modelat greșit bucată din tot documentul:
 *   Mentenanță și Lucrări → plafon de COST, se urmărește să NU-l depășești.
 *   Delta                 → plafon de VENIT, se urmărește să-l UMPLI.
 * Interfața trebuie să reflecte asta: un gauge care se umple, nu unul care se golește.
 *
 * PERFORMANȚĂ: funcția `budgetsForMonth` face 5 interogări în total, indiferent de
 * câte contracte sunt. Varianta naivă (o interogare per componentă) însemna ~60 de
 * dus-întorsuri prin pooler, adică 15 secunde pe panou. Nu reintroduce N+1 aici.
 */

import { and, eq, inArray, sql as raw } from "drizzle-orm";

import { db } from "./db";
import {
  componentBudgets,
  contractComponents,
  contractYears,
  contracts,
  costEntries,
  fundingAllocations,
} from "./db/schema";
import { fromDb, percentOf, ratio, type Bani } from "./money";

export type ComponentKind = "mentenanta" | "lucrari" | "delta" | "individual";

export type BudgetView = {
  componentId: string;
  contractId: string;
  kind: ComponentKind;
  name: string;
  /** cum se citește gauge-ul: „umple" doar la Delta */
  direction: "consuma" | "umple";
  /** venitul alocat componentei din abonamentul lunii */
  revenue: Bani;
  /** plafonul lunii — de cost la mentenanță/lucrări, de venit la Delta */
  cap: Bani;
  committed: Bani;
  consumed: Bani;
  remaining: Bani;
  /** 0–100+; la Delta e gradul de umplere, la rest gradul de consum */
  percent: number;
  over: boolean;
  /** doar la Delta: valoarea neumplută = venit pierdut fără cost */
  unfilled: Bani | null;
};

export type ContractBudget = {
  contractId: string;
  subscription: Bani;
  views: BudgetView[];
  /** venit total al lunii (fără Delta, care are propria mecanică) */
  revenue: Bani;
  cost: Bani;
  margin: number;
};

const CONSUMED_STAGES = ["receptionat", "consumat", "facturat"] as const;

/**
 * Bugetele lunii pentru un set de contracte, în 5 interogări.
 * Dacă `contractIds` lipsește, ia toate contractele.
 */
export async function budgetsForMonth(
  year: number,
  month: number,
  contractIds?: string[],
): Promise<Map<string, ContractBudget>> {
  const contractRows = contractIds?.length
    ? await db.select().from(contracts).where(inArray(contracts.id, contractIds))
    : await db.select().from(contracts);

  const ids = contractRows.map((c) => c.id);
  if (ids.length === 0) return new Map();

  const [components, years, budgets, costAgg, allocAgg] = await Promise.all([
    db.select().from(contractComponents).where(inArray(contractComponents.contractId, ids)),
    db.select().from(contractYears).where(inArray(contractYears.contractId, ids)),
    db
      .select()
      .from(componentBudgets)
      .where(and(eq(componentBudgets.year, year), eq(componentBudgets.month, month))),
    // o singură agregare pentru tot registrul lunii, grupată pe componentă și stadiu
    db
      .select({
        componentId: costEntries.chargedComponentId,
        stage: costEntries.stage,
        total: raw<string>`sum(${costEntries.value})`,
      })
      .from(costEntries)
      .where(
        and(
          raw`extract(year from ${costEntries.effectDate}) = ${year}`,
          raw`extract(month from ${costEntries.effectDate}) = ${month}`,
        ),
      )
      .groupBy(costEntries.chargedComponentId, costEntries.stage),
    db
      .select({
        componentId: fundingAllocations.componentId,
        total: raw<string>`sum(${fundingAllocations.allocatedValue})`,
      })
      .from(fundingAllocations)
      .where(
        and(
          eq(fundingAllocations.year, year),
          eq(fundingAllocations.month, month),
          eq(fundingAllocations.status, "activ"),
        ),
      )
      .groupBy(fundingAllocations.componentId),
  ]);

  const consumedBy = new Map<string, Bani>();
  const committedBy = new Map<string, Bani>();
  for (const row of costAgg) {
    if (!row.componentId) continue;
    const target = row.stage === "angajat" ? committedBy : consumedBy;
    if (row.stage !== "angajat" && !CONSUMED_STAGES.includes(row.stage as never)) continue;
    target.set(row.componentId, (target.get(row.componentId) ?? 0) + fromDb(row.total));
  }

  const filledBy = new Map<string, Bani>();
  for (const row of allocAgg) filledBy.set(row.componentId, fromDb(row.total));

  const budgetBy = new Map(budgets.map((b) => [b.componentId, b]));
  const day = `${year}-${String(month).padStart(2, "0")}-15`;

  const out = new Map<string, ContractBudget>();

  for (const contract of contractRows) {
    const activeYear = years.find(
      (y) => y.contractId === contract.id && y.startDate <= day && day <= y.endDate,
    );
    const subscription = fromDb(activeYear?.monthlyValue ?? contract.monthlyValue);

    const views: BudgetView[] = [];
    for (const component of components.filter((c) => c.contractId === contract.id)) {
      const revenue = percentOf(subscription, Number(component.revenuePercent));
      const budget = budgetBy.get(component.id);
      const kind = component.kind as ComponentKind;
      const isDelta = kind === "delta";

      const cap = isDelta
        ? fromDb(budget?.manualCap ?? budget?.plan ?? "0")
        : budget && budget.plan !== "0"
          ? fromDb(budget.plan)
          : revenue - percentOf(revenue, Number(component.targetMarginPercent));

      const committed = committedBy.get(component.id) ?? 0;
      const consumed = consumedBy.get(component.id) ?? 0;
      // La Delta „umplerea" se măsoară în VENIT alocat, nu în cost consumat.
      const used = isDelta ? (filledBy.get(component.id) ?? 0) : consumed + committed;
      const remaining = cap - used;

      views.push({
        componentId: component.id,
        contractId: contract.id,
        kind,
        name: component.name,
        direction: isDelta ? "umple" : "consuma",
        revenue,
        cap,
        committed,
        consumed,
        remaining,
        percent: ratio(used, cap),
        over: isDelta ? used >= cap : used > cap,
        unfilled: isDelta ? Math.max(0, remaining) : null,
      });
    }

    const revenue = views.filter((v) => v.kind !== "delta").reduce((a, v) => a + v.revenue, 0);
    const cost = views.reduce((a, v) => a + v.consumed, 0);

    out.set(contract.id, {
      contractId: contract.id,
      subscription,
      views,
      revenue,
      cost,
      margin: marginOf(revenue, cost),
    });
  }

  return out;
}

/** Un singur contract — folosește tot varianta în lot, ca să nu existe două căi. */
export async function contractBudget(
  contractId: string,
  year: number,
  month: number,
): Promise<ContractBudget | null> {
  const map = await budgetsForMonth(year, month, [contractId]);
  return map.get(contractId) ?? null;
}

/** Abonamentul lunar valabil în anul de contract care conține luna dată (§4.1). */
export async function monthlySubscription(
  contractId: string,
  year: number,
  month: number,
): Promise<Bani> {
  const budget = await contractBudget(contractId, year, month);
  return budget?.subscription ?? 0;
}

export function marginOf(revenue: Bani, cost: Bani): number {
  if (revenue === 0) return 0;
  return ((revenue - cost) / revenue) * 100;
}

/**
 * Pragul de alertă. La componentele de cost e depășirea; la Delta e inversul —
 * te alertează dacă NU s-a umplut destul până la mijlocul lunii (§24.1).
 */
export function alertLevel(view: BudgetView, dayOfMonth: number): "ok" | "atentie" | "critic" {
  if (view.direction === "umple") {
    if (view.percent >= 90) return "ok";
    if (dayOfMonth >= 20) return "critic";
    if (dayOfMonth >= 10 && view.percent < 60) return "atentie";
    return "ok";
  }
  if (view.percent > 100) return "critic";
  if (view.percent >= 80) return "atentie";
  return "ok";
}
