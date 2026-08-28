"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  checklistItems,
  checklistTemplates,
  inspectionChecks,
  firms,
  fuelPrices,
  laborRates,
  operationCatalog,
  operationCatalogMaterials,
  partners,
  products,
  pvTemplates,
  users,
} from "@/lib/db/schema";
import { parseInput, toDb } from "@/lib/money";
import {
  monthToDay,
  parseChecklistItems,
  parseOperationMaterials,
  validateChecklistTemplate,
  validateInspectionCheck,
  validateFirm,
  validateFuelPrice,
  validateLaborRate,
  validateOperation,
  validatePartner,
  validateProduct,
  validatePvTemplate,
  validateUser,
  type FormErrors,
} from "@/lib/nomenclatoare-types";
import { can, type Role } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

/**
 * PLAN.md §9.1 — nomenclatoarele. Toate acțiunile întorc `Promise<void>`: se folosesc
 * direct ca `form action`.
 *
 * Regula 5 din CLAUDE.md: poarta e `lib/permissions.ts`, verificată AICI, nu doar prin
 * ascunderea butonului. Regula 3: banii trec prin `lib/money`, niciodată `float`.
 * PLAN.md §9.11: nomenclator folosit deja ⇒ `active = false`, nu `DELETE`.
 */

async function guard() {
  const session = await requireSession();
  if (!can(session.role, "nomenclatoare.editeaza")) {
    throw new Error("FĂRĂ DREPT: nomenclatoarele se editează din birou.");
  }
  return session;
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function nul(value: string): string | null {
  return value === "" ? null : value;
}

/** numeric(x,y) din formular — cantități, ore, procente. Nu bani. */
function qty(value: string): string {
  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : "0";
}

function money(value: string): string {
  return toDb(parseInput(value));
}

function values(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of new Set(fd.keys())) {
    out[key] = fd
      .getAll(key)
      .map((v) => (typeof v === "string" ? v : ""))
      .join(",");
  }
  return out;
}

/** Ultima plasă: formularul validează deja, dar acțiunea nu are voie să creadă pe cuvânt. */
function check(errors: FormErrors) {
  const keys = Object.keys(errors);
  if (keys.length > 0) {
    throw new Error(`VALIDARE: ${keys.map((k) => `${k} — ${errors[k]}`).join("; ")}`);
  }
}

function done() {
  revalidatePath("/nomenclatoare");
}

/* ───────────────────────────── Firme ───────────────────────────── */

export async function saveFirm(fd: FormData): Promise<void> {
  await guard();
  check(validateFirm(values(fd)));
  const id = str(fd, "id");
  const row = {
    name: str(fd, "name"),
    cui: str(fd, "cui").toUpperCase(),
    regCom: nul(str(fd, "regCom")),
    address: nul(str(fd, "address")),
    documentPrefix: str(fd, "documentPrefix").toUpperCase(),
    color: nul(str(fd, "color")),
  };
  if (id) await db.update(firms).set(row).where(eq(firms.id, id));
  else await db.insert(firms).values(row);
  done();
}

/* ─────────────────────────── Parteneri ─────────────────────────── */

type PartnerType = "client" | "furnizor" | "subcontractant" | "angajat";

export async function savePartner(fd: FormData): Promise<void> {
  await guard();
  check(validatePartner(values(fd)));
  const id = str(fd, "id");
  const retention = str(fd, "retentionPercent");
  const row = {
    name: str(fd, "name"),
    // Drizzle + enum: ternarul/`map` pe coloană de enum dă `string`, deci cast explicit.
    types: fd.getAll("types").map((t) => String(t)) as PartnerType[],
    cui: nul(str(fd, "cui").toUpperCase()),
    address: nul(str(fd, "address")),
    contactName: nul(str(fd, "contactName")),
    contactPhone: nul(str(fd, "contactPhone")),
    contactEmail: nul(str(fd, "contactEmail")),
    specialty: nul(str(fd, "specialty")),
    retentionPercent: retention === "" ? null : qty(retention),
  };
  if (id) await db.update(partners).set(row).where(eq(partners.id, id));
  else await db.insert(partners).values(row);
  done();
}

/* ──────────────────────────── Produse ──────────────────────────── */

export async function saveProduct(fd: FormData): Promise<void> {
  await guard();
  check(validateProduct(values(fd)));
  const id = str(fd, "id");
  const row = {
    code: str(fd, "code"),
    name: str(fd, "name"),
    category: nul(str(fd, "category")),
    unit: str(fd, "unit"),
    defaultSupplierId: nul(str(fd, "defaultSupplierId")),
    lastPrice: money(str(fd, "lastPrice")),
    leadTimeDays: Math.max(0, Math.round(Number(qty(str(fd, "leadTimeDays"))))),
    minStock: qty(str(fd, "minStock")),
    maxStock: qty(str(fd, "maxStock")),
    tracksLots: fd.get("tracksLots") !== null,
  };
  if (id) await db.update(products).set(row).where(eq(products.id, id));
  else await db.insert(products).values(row);
  done();
}

/* ───────────────────── Calificări și rate orare ───────────────────── */

export async function saveLaborRate(fd: FormData): Promise<void> {
  await guard();
  check(validateLaborRate(values(fd)));
  const id = str(fd, "id");
  const row = {
    qualification: str(fd, "qualification"),
    hourlyCost: money(str(fd, "hourlyCost")),
    validFrom: str(fd, "validFrom"),
    validTo: nul(str(fd, "validTo")),
  };
  if (id) await db.update(laborRates).set(row).where(eq(laborRates.id, id));
  else await db.insert(laborRates).values(row);
  done();
}

/* ─────────────────── Catalogul de operațiuni (§7) ─────────────────── */

export async function saveOperation(fd: FormData): Promise<void> {
  await guard();
  check(validateOperation(values(fd)));
  const id = str(fd, "id");
  const row = {
    code: str(fd, "code"),
    name: str(fd, "name"),
    category: nul(str(fd, "category")),
    unit: str(fd, "unit"),
    standardHours: qty(str(fd, "standardHours")),
    qualification: nul(str(fd, "qualification")),
    estimatedCost: money(str(fd, "estimatedCost")),
  };

  const operationId = id
    ? (await db.update(operationCatalog).set(row).where(eq(operationCatalog.id, id)).returning({
        id: operationCatalog.id,
      }))[0]?.id
    : (await db.insert(operationCatalog).values(row).returning({ id: operationCatalog.id }))[0]?.id;
  if (!operationId) return;

  // Normele de material: rescrise integral, ca să nu rămână rânduri orfane.
  const { materials } = parseOperationMaterials(str(fd, "materials"));
  await db
    .delete(operationCatalogMaterials)
    .where(eq(operationCatalogMaterials.operationId, operationId));
  if (materials.length > 0) {
    const codes = materials.map((m) => m.code);
    const found = await db
      .select({ id: products.id, code: products.code })
      .from(products)
      .where(inArray(products.code, codes));
    const byCode = new Map(found.map((p) => [p.code, p.id]));
    const rows = materials
      .filter((m) => byCode.has(m.code))
      .map((m) => ({
        operationId,
        productId: byCode.get(m.code)!,
        quantity: String(m.quantity),
      }));
    if (rows.length > 0) await db.insert(operationCatalogMaterials).values(rows);
  }
  done();
}

/* ───────────────────── Șabloane de checklist ───────────────────── */

/**
 * Punctul din catalog. Codul e cheia: în lista de inspecție scrii codul, iar punctul
 * se leagă automat. Așa același punct intră în 20 de liste fără să fie rescris de 20 de ori,
 * iar întrebarea „la câte obiective a picat verificarea acumulatorilor" are un răspuns.
 */
export async function saveInspectionCheck(fd: FormData): Promise<void> {
  await guard();
  check(validateInspectionCheck(values(fd)));
  const id = str(fd, "id");
  const row = {
    code: str(fd, "code").toUpperCase(),
    name: str(fd, "name"),
    ticketTypeId: nul(str(fd, "ticketTypeId")),
    objectiveKind: nul(str(fd, "objectiveKind")),
    guidance: nul(str(fd, "guidance")),
    requiresPhoto: str(fd, "requiresPhoto") === "1",
    requiresValue: str(fd, "requiresValue") === "1",
    valueUnit: nul(str(fd, "valueUnit")),
  };
  if (id) {
    await db.update(inspectionChecks).set(row).where(eq(inspectionChecks.id, id));
  } else {
    await db.insert(inspectionChecks).values(row);
  }
  done();
}

export async function saveChecklistTemplate(fd: FormData): Promise<void> {
  await guard();
  check(validateChecklistTemplate(values(fd)));
  const id = str(fd, "id");
  const row = {
    name: str(fd, "name"),
    objectiveKind: nul(str(fd, "objectiveKind")),
    ticketTypeId: nul(str(fd, "ticketTypeId")),
    discipline: nul(str(fd, "discipline")),
  };

  const templateId = id
    ? (await db.update(checklistTemplates).set(row).where(eq(checklistTemplates.id, id)).returning({
        id: checklistTemplates.id,
      }))[0]?.id
    : (await db.insert(checklistTemplates).values(row).returning({ id: checklistTemplates.id }))[0]
        ?.id;
  if (!templateId) return;

  /**
   * O linie care e un cod din catalog devine punct legat; restul rămâne text liber.
   * Regula asta ține editarea la o singură căsuță de text și totuși dă legătura
   * de care are nevoie raportarea pe puncte.
   */
  const items = parseChecklistItems(str(fd, "items"));
  const catalog = await db.select().from(inspectionChecks);
  const byCode = new Map(catalog.map((c) => [c.code.toLowerCase(), c]));

  await db.delete(checklistItems).where(eq(checklistItems.templateId, templateId));
  if (items.length > 0) {
    await db.insert(checklistItems).values(
      items.map((item, index) => {
        const hit = byCode.get(item.text.toLowerCase());
        return {
          templateId,
          position: index + 1,
          checkId: hit?.id ?? null,
          text: hit?.name ?? item.text,
          section: item.section,
        };
      }),
    );
  }
  done();
}

/* ───────────────────────── Utilizatori ───────────────────────── */

export async function saveUser(fd: FormData): Promise<void> {
  await guard();
  check(validateUser(values(fd)));
  const id = str(fd, "id");
  const password = str(fd, "password");
  const base = {
    name: str(fd, "name"),
    email: str(fd, "email").toLowerCase(),
    role: str(fd, "role") as Role,
    firmId: nul(str(fd, "firmId")),
    qualification: nul(str(fd, "qualification")),
  };
  if (id) {
    // Parolă goală la editare = parola rămâne cea veche.
    await db
      .update(users)
      .set(password ? { ...base, password } : base)
      .where(eq(users.id, id));
  } else {
    await db.insert(users).values({ ...base, password });
  }
  done();
}

/* ───────────────────────── Preț motorină ───────────────────────── */

export async function saveFuelPrice(fd: FormData): Promise<void> {
  await guard();
  check(validateFuelPrice(values(fd)));
  const day = monthToDay(str(fd, "month"));
  const row = {
    day,
    pricePerLiter: money(str(fd, "pricePerLiter")),
    manualOverride: fd.get("manualOverride") !== null,
  };
  await db
    .insert(fuelPrices)
    .values(row)
    .onConflictDoUpdate({
      target: fuelPrices.day,
      set: { pricePerLiter: row.pricePerLiter, manualOverride: row.manualOverride },
    });
  done();
}

/* ───────────────────────── Șabloane de PV ───────────────────────── */

export async function savePvTemplate(fd: FormData): Promise<void> {
  await guard();
  check(validatePvTemplate(values(fd)));
  const id = str(fd, "id");
  const row = {
    name: str(fd, "name"),
    kind: str(fd, "kind"),
    storageKey: nul(str(fd, "storageKey")),
  };
  if (id) await db.update(pvTemplates).set(row).where(eq(pvTemplates.id, id));
  else await db.insert(pvTemplates).values(row);
  done();
}

/* ──────────────── Dezactivare / reactivare (§9.11) ──────────────── */

const ACTIVABLE = {
  firme: firms,
  parteneri: partners,
  produse: products,
  calificari: laborRates,
  operatiuni: operationCatalog,
  checklist: checklistTemplates,
  puncte: inspectionChecks,
  utilizatori: users,
  pv: pvTemplates,
} as const;

export type ActivableEntity = keyof typeof ACTIVABLE;

/**
 * Nu există `DELETE` pe nomenclatoare. Un produs folosit într-un NIR de anul trecut
 * nu poate să dispară din raport — se scoate din liste, atât.
 */
export async function setNomenclatorActive(fd: FormData): Promise<void> {
  await guard();
  const entity = str(fd, "entity") as ActivableEntity;
  const table = ACTIVABLE[entity];
  if (!table) throw new Error("Nomenclator necunoscut.");
  const id = str(fd, "id");
  if (!id) throw new Error("Lipsește rândul.");
  await db
    .update(table)
    .set({ active: str(fd, "active") === "1" })
    .where(eq(table.id, id));
  done();
}
