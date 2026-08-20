/**
 * Decizia de rutare (§7) — cea mai importantă decizie economică din firmă,
 * luată de zeci de ori pe lună, de obicei din ochi.
 *
 * Aici se ia pe cifre: costul estimat vine din catalogul de operațiuni, pragul vine
 * de pe contract, iar cât mai e liber în Delta lunii vine din alocările existente.
 * Sistemul RECOMANDĂ; omul decide și rămâne cu numele pe decizie.
 */

import { and, eq, inArray, sql as raw } from "drizzle-orm";

import { db } from "./db";
import {
  componentBudgets,
  contractComponents,
  contracts,
  fundingAllocations,
} from "./db/schema";
import { fromDb, type Bani } from "./money";
import type { RoutingBranch, RoutingContext, RoutingDecision } from "./routing-types";

export type {
  RoutingBranch,
  RoutingContext,
  RoutingDecision,
} from "./routing-types";
export { ROUTING_EFFECT, ROUTING_LABELS } from "./routing-types";

/**
 * Capacitatea liberă a componentelor unui contract în luna dată.
 * O interogare per dimensiune, nu una per componentă.
 */
export async function routingContext(
  contractId: string,
  estimated: Bani,
  year: number,
  month: number,
): Promise<RoutingContext | null> {
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  if (!contract) return null;

  const components = await db
    .select()
    .from(contractComponents)
    .where(eq(contractComponents.contractId, contractId));
  const componentIds = components.map((c) => c.id);
  if (componentIds.length === 0) return null;

  const [budgets, allocations] = await Promise.all([
    db
      .select()
      .from(componentBudgets)
      .where(
        and(
          inArray(componentBudgets.componentId, componentIds),
          eq(componentBudgets.year, year),
          eq(componentBudgets.month, month),
        ),
      ),
    db
      .select({
        componentId: fundingAllocations.componentId,
        total: raw<string>`sum(${fundingAllocations.allocatedValue})`,
      })
      .from(fundingAllocations)
      .where(
        and(
          inArray(fundingAllocations.componentId, componentIds),
          eq(fundingAllocations.year, year),
          eq(fundingAllocations.month, month),
          eq(fundingAllocations.status, "activ"),
        ),
      )
      .groupBy(fundingAllocations.componentId),
  ]);

  const capOf = (componentId: string) => {
    const b = budgets.find((x) => x.componentId === componentId);
    return fromDb(b?.manualCap ?? b?.plan ?? "0");
  };
  const usedOf = (componentId: string) =>
    fromDb(allocations.find((a) => a.componentId === componentId)?.total ?? "0");

  const bucket = (kind: string) => {
    const comp = components.find((c) => c.kind === kind);
    if (!comp) return null;
    const cap = capOf(comp.id);
    const used = usedOf(comp.id);
    return { componentId: comp.id, cap, used, free: cap - used };
  };

  const maintenance = bucket("mentenanta");
  const worksBucket = bucket("lucrari");
  const deltaBucket = bucket("delta");
  const delta = deltaBucket
    ? {
        componentId: deltaBucket.componentId,
        cap: deltaBucket.cap,
        filled: deltaBucket.used,
        free: deltaBucket.free,
      }
    : null;

  const threshold = fromDb(contract.maintenanceThreshold);
  const branches = buildBranches({ estimated, threshold, maintenance, works: worksBucket, delta });

  return {
    contractId,
    contractCode: contract.code,
    estimated,
    threshold,
    delta,
    works: worksBucket,
    maintenance,
    branches,
    suggestion: branches.find((b) => b.recommended)?.decision ?? "contract_nou",
  };
}

type Bucket = { componentId: string; cap: Bani; used: Bani; free: Bani } | null;

/**
 * Regula, pură și testabilă din ochi:
 *
 *   sub prag                       → intervenție pe mentenanță
 *   peste prag și încape în Delta  → lucrare din Delta   (prima alegere: aduce venit nou)
 *   peste prag, Delta plină        → componenta Lucrări, dacă mai are plafon
 *   nicăieri loc                   → contract nou
 */
export function buildBranches(input: {
  estimated: Bani;
  threshold: Bani;
  maintenance: Bucket;
  works: Bucket;
  delta: { componentId: string; cap: Bani; filled: Bani; free: Bani } | null;
}): RoutingBranch[] {
  const { estimated, threshold, maintenance, works, delta } = input;

  const underThreshold = estimated < threshold;
  const fitsDelta = Boolean(delta && delta.free >= estimated && delta.cap > 0);
  const fitsWorks = Boolean(works && works.free >= estimated && works.cap > 0);

  const recommended: RoutingDecision = underThreshold
    ? "interventie_mentenanta"
    : fitsDelta
      ? "lucrare_delta"
      : fitsWorks
        ? "lucrare_componenta"
        : "contract_nou";

  return [
    {
      decision: "interventie_mentenanta",
      recommended: recommended === "interventie_mentenanta",
      possible: Boolean(maintenance),
      componentId: maintenance?.componentId ?? null,
      reason: underThreshold
        ? `Estimarea e sub pragul contractului. Sub prag, o lucrare separată costă mai mult în hârtie decât în manoperă.`
        : `Estimarea depășește pragul contractului — pusă pe mentenanță, ar mânca plafon fără să aducă venit.`,
    },
    {
      decision: "lucrare_delta",
      recommended: recommended === "lucrare_delta",
      possible: fitsDelta,
      componentId: delta?.componentId ?? null,
      reason: !delta
        ? "Contractul nu are componentă Delta."
        : delta.cap === 0
          ? "Delta lunii nu are plafon pus. PM-ul îl stabilește manual."
          : fitsDelta
            ? `Mai e loc în Delta lunii. Aduce venit peste abonament.`
            : `Nu încape: în Delta lunii a mai rămas mai puțin decât estimarea. Se poate împărți pe două luni.`,
    },
    {
      decision: "lucrare_componenta",
      recommended: recommended === "lucrare_componenta",
      possible: fitsWorks,
      componentId: works?.componentId ?? null,
      reason: !works
        ? "Contractul nu are componentă Lucrări."
        : fitsWorks
          ? `Componenta Lucrări mai are plafon în luna asta.`
          : `Plafonul componentei Lucrări e consumat pe luna asta.`,
    },
    {
      decision: "contract_nou",
      recommended: recommended === "contract_nou",
      possible: true,
      componentId: null,
      reason:
        recommended === "contract_nou"
          ? "Nicio componentă a contractului nu mai are loc în luna asta. Se ofertează separat."
          : "Oricând, dacă lucrarea depășește logica abonamentului.",
    },
  ];
}
