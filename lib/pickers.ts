/**
 * Listele de referință pe care le mănâncă `<select>`-urile blocului E.
 *
 * Un singur loc: altfel fiecare ecran își scrie propriul `select ... order by`, iar
 * eticheta aceluiași obiectiv arată diferit în trei formulare. Toate întorc `Opt[]`,
 * gata de pus în `options={…}`.
 */

import { asc, eq, sql as raw } from "drizzle-orm";

import { db } from "./db";
import {
  contractComponents,
  contracts,
  equipment,
  firms,
  objectives,
  partners,
  products,
  users,
  warehouses,
  workUnits,
} from "./db/schema";

export type Opt = { value: string; label: string };

export function firmOptions(): Promise<Opt[]> {
  return db
    .select({ value: firms.id, label: firms.name })
    .from(firms)
    .where(eq(firms.active, true))
    .orderBy(asc(firms.name));
}

export function objectiveOptions(): Promise<Opt[]> {
  return db
    .select({
      value: objectives.id,
      label: raw<string>`${objectives.code} || ' — ' || ${objectives.name}`,
    })
    .from(objectives)
    .orderBy(asc(objectives.code));
}

export function contractOptions(): Promise<Opt[]> {
  return db
    .select({
      value: contracts.id,
      label: raw<string>`${contracts.code} || ' — ' || ${contracts.name}`,
    })
    .from(contracts)
    .orderBy(asc(contracts.code));
}

/** Componentele tuturor contractelor, etichetate cu contractul lor — altfel „Delta" e ambiguu. */
export function componentOptions(): Promise<Opt[]> {
  return db
    .select({
      value: contractComponents.id,
      label: raw<string>`${contracts.code} || ' · ' || ${contractComponents.name}`,
    })
    .from(contractComponents)
    .innerJoin(contracts, eq(contractComponents.contractId, contracts.id))
    .orderBy(asc(contracts.code));
}

export function userOptions(): Promise<Opt[]> {
  return db
    .select({ value: users.id, label: users.name })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name));
}

/** Parteneri filtrați pe rol: `client`, `furnizor`, `subcontractant`, `angajat`. */
export function partnerOptions(role: string): Promise<Opt[]> {
  return db
    .select({ value: partners.id, label: partners.name })
    .from(partners)
    .where(raw`${partners.active} = true and ${role} = any(${partners.types})`)
    .orderBy(asc(partners.name));
}

/** Unitățile de lucru încă deschise — cele închise n-au ce căuta într-un formular de creare. */
export function openWorkUnitOptions(): Promise<Opt[]> {
  return db
    .select({
      value: workUnits.id,
      label: raw<string>`${workUnits.code} || ' — ' || ${workUnits.title}`,
    })
    .from(workUnits)
    .where(raw`${workUnits.status} in ('propusa', 'planificata', 'in_lucru')`)
    .orderBy(asc(workUnits.code));
}

export function warehouseOptions(): Promise<Opt[]> {
  return db
    .select({
      value: warehouses.id,
      label: raw<string>`${warehouses.code} || ' — ' || ${warehouses.name}`,
    })
    .from(warehouses)
    .where(eq(warehouses.active, true))
    .orderBy(asc(warehouses.code));
}

export function productOptions(): Promise<Opt[]> {
  return db
    .select({
      value: products.id,
      label: raw<string>`${products.code} || ' — ' || ${products.name} || ' (' || ${products.unit} || ')'`,
    })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(asc(products.code));
}

/** Activitățile deja folosite pe flotă — pe ele se sprijină filtrul din §18.1.2. */
export async function equipmentActivities(): Promise<string[]> {
  const rows = await db
    .select({ activity: raw<string>`unnest(${equipment.activities})` })
    .from(equipment);
  return [...new Set(rows.map((r) => r.activity))].sort();
}
