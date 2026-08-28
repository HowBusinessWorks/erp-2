"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  componentBudgets,
  contractChecklists,
  contractComponents,
  contractObjectives,
  contractYears,
  contracts,
  objectiveChecklists,
  objectives,
} from "@/lib/db/schema";
import { isPeriodClosed } from "@/lib/cost-ledger";
import {
  numberOf,
  twelveMonths,
  validateContract,
  validateContractObjective,
  validateContractYear,
  validateComponents,
  validateObjective,
  type ComponentDraft,
  type FormErrors,
} from "@/lib/contracts-types";
import { parseInput, toDb } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

/**
 * PLAN.md §9.2 și §9.3 — contractul cap-coadă și obiectivele.
 *
 * Regula 5: poarta e `lib/permissions.ts`, verificată aici, nu prin ascunderea butonului.
 * Regula 3: banii intră prin `lib/money`, ies ca `numeric` — niciodată `float`.
 * §9.11: pe un contract activ se editează doar ce nu falsifică istoricul. O lună închisă
 * nu se atinge, indiferent cine cere.
 */

async function guard() {
  const session = await requireSession();
  if (!can(session.role, "contracte.editeaza")) {
    throw new Error("FĂRĂ DREPT: contractele se editează de PM sau admin.");
  }
  return session;
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function nul(value: string): string | null {
  return value === "" ? null : value;
}

/** numeric(x,y) — procente, coordonate, suprafețe. Nu bani. */
function num(value: string): string {
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

function check(errors: FormErrors) {
  const keys = Object.keys(errors);
  if (keys.length > 0) {
    throw new Error(`VALIDARE: ${keys.map((k) => `${k} — ${errors[k]}`).join("; ")}`);
  }
}

/* ═══════════════════ Contract nou — asistentul din §9.2 ═══════════════════ */

/**
 * Un singur `INSERT` logic pentru toți cei 3 pași obligatorii: contract, componente,
 * plafoanele pe 12 luni. Într-o tranzacție, pentru că un contract fără componente și
 * fără plafoane rupe panoul PM — mai bine deloc decât pe jumătate.
 *
 * Pașii 4 (obiective) și 5 (ani) se fac din fișa contractului: sunt legături, nu părți
 * din identitatea lui.
 *
 * Câmpurile compuse vin serializate ca JSON într-un singur câmp de formular, ca să nu
 * se despartă indicii liniilor la trecerea prin `FormData`.
 */
export async function createContract(fd: FormData): Promise<void> {
  await guard();

  const raw = values(fd);
  check(validateContract(raw));

  const components: ComponentDraft[] = JSON.parse(str(fd, "components") || "[]");
  check(validateComponents(components));

  // plan[i][j] — componenta i, luna j, în bani (întregi). Vine gata calculat din pasul 3.
  const plan: number[][] = JSON.parse(str(fd, "plan") || "[]");
  const startDate = str(fd, "startDate");
  const months = twelveMonths(startDate);
  const monthlyValue = parseInput(str(fd, "monthlyValue"));

  const contractId = await db.transaction(async (tx) => {
    const [contract] = await tx
      .insert(contracts)
      .values({
        firmId: str(fd, "firmId"),
        clientId: str(fd, "clientId"),
        code: str(fd, "code").toUpperCase(),
        name: str(fd, "name"),
        kind: str(fd, "kind") as "mentenanta" | "individual_deviz" | "individual_inversa",
        startDate,
        endDate: str(fd, "endDate"),
        totalValue: money(str(fd, "totalValue")),
        monthlyValue: toDb(monthlyValue),
        paymentDays: Math.round(numberOf(str(fd, "paymentDays")) || 70),
        indexationPercent: num(str(fd, "indexationPercent") || "5"),
        maintenanceThreshold: money(str(fd, "maintenanceThreshold") || "2000"),
        expiryAlertMonths: Math.round(numberOf(str(fd, "expiryAlertMonths")) || 6),
        ownerId: nul(str(fd, "ownerId")),
      })
      .returning({ id: contracts.id });

    for (const [i, c] of components.entries()) {
      const [row] = await tx
        .insert(contractComponents)
        .values({
          contractId: contract.id,
          kind: c.kind as "mentenanta" | "lucrari" | "delta" | "individual",
          name: c.name,
          revenuePercent: String(c.revenuePercent),
          targetMarginPercent: String(c.targetMarginPercent),
        })
        .returning({ id: contractComponents.id });

      const line = plan[i] ?? [];
      if (months.length === 0) continue;
      await tx.insert(componentBudgets).values(
        months.map((m, j) => ({
          componentId: row.id,
          year: m.year,
          month: m.month,
          plan: toDb(Math.round(line[j] ?? 0)),
          // Delta nu se planifică: are plafon de VENIT, pus manual de PM (schema, §13).
          manualCap: c.kind === "delta" ? toDb(0) : null,
        })),
      );
    }

    // Anul 1 de contract — indexarea din §22.6 pornește de aici, nu din aer.
    await tx.insert(contractYears).values({
      contractId: contract.id,
      yearNo: 1,
      startDate,
      endDate: str(fd, "endDate"),
      monthlyValue: toDb(monthlyValue),
    });

    return contract.id;
  });

  revalidatePath("/contracte");
  revalidatePath("/panou");
  redirect(`/contracte/${contractId}`);
}

/* ═══════════════════ Editarea unui contract existent ═══════════════════ */

/**
 * §9.11: pe un contract activ se editează doar ce nu falsifică istoricul — datele de
 * contact, proprietarul, pragurile, perioada. Valoarea unei luni închise se schimbă din
 * `saveComponentBudget`, care refuză luna închisă. Componentele nu se rescriu de aici:
 * ponderea lor a produs deja plafoane și alocări.
 */
export async function updateContract(fd: FormData): Promise<void> {
  await guard();
  const id = str(fd, "id");
  if (!id) throw new Error("Contract inexistent.");
  check(validateContract(values(fd)));

  await db
    .update(contracts)
    .set({
      name: str(fd, "name"),
      code: str(fd, "code").toUpperCase(),
      clientId: str(fd, "clientId"),
      firmId: str(fd, "firmId"),
      kind: str(fd, "kind") as "mentenanta" | "individual_deviz" | "individual_inversa",
      startDate: str(fd, "startDate"),
      endDate: str(fd, "endDate"),
      totalValue: money(str(fd, "totalValue")),
      monthlyValue: money(str(fd, "monthlyValue")),
      paymentDays: Math.round(numberOf(str(fd, "paymentDays")) || 70),
      indexationPercent: num(str(fd, "indexationPercent") || "5"),
      maintenanceThreshold: money(str(fd, "maintenanceThreshold") || "2000"),
      expiryAlertMonths: Math.round(numberOf(str(fd, "expiryAlertMonths")) || 6),
      ownerId: nul(str(fd, "ownerId")),
    })
    .where(eq(contracts.id, id));

  revalidatePath(`/contracte/${id}`);
  revalidatePath("/contracte");
}

/** Plafonul unei luni. Luna închisă e refuzată — acolo cifra a intrat deja în raport. */
export async function saveComponentBudget(fd: FormData): Promise<void> {
  await guard();
  const componentId = str(fd, "componentId");
  const year = Number(str(fd, "year"));
  const month = Number(str(fd, "month"));
  if (!componentId || !year || !month) throw new Error("Plafon fără componentă sau lună.");

  const [component] = await db
    .select({ contractId: contractComponents.contractId, kind: contractComponents.kind })
    .from(contractComponents)
    .where(eq(contractComponents.id, componentId));
  if (!component) throw new Error("Componentă inexistentă.");

  const [contract] = await db
    .select({ firmId: contracts.firmId })
    .from(contracts)
    .where(eq(contracts.id, component.contractId));

  if (await isPeriodClosed(contract.firmId, year, month)) {
    throw new Error("LUNĂ ÎNCHISĂ: plafonul nu se mai schimbă. Corecția e o realocare.");
  }

  const planValue = money(str(fd, "plan"));
  const capRaw = str(fd, "manualCap");
  const manualCap = component.kind === "delta" ? money(capRaw || "0") : null;

  const [existing] = await db
    .select({ id: componentBudgets.id })
    .from(componentBudgets)
    .where(
      and(
        eq(componentBudgets.componentId, componentId),
        eq(componentBudgets.year, year),
        eq(componentBudgets.month, month),
      ),
    );

  const row = { plan: planValue, manualCap, notes: nul(str(fd, "notes")) };
  if (existing) await db.update(componentBudgets).set(row).where(eq(componentBudgets.id, existing.id));
  else await db.insert(componentBudgets).values({ componentId, year, month, ...row });

  revalidatePath(`/contracte/${component.contractId}`);
  revalidatePath("/panou");
}

/** Anul contractual următor (§22.6). Anul curent nu se rescrie — se adaugă unul nou. */
export async function addContractYear(fd: FormData): Promise<void> {
  await guard();
  const contractId = str(fd, "contractId");
  if (!contractId) throw new Error("Contract inexistent.");
  check(validateContractYear(values(fd)));

  const [last] = await db
    .select({ yearNo: contractYears.yearNo, monthlyValue: contractYears.monthlyValue })
    .from(contractYears)
    .where(eq(contractYears.contractId, contractId))
    .orderBy(desc(contractYears.yearNo))
    .limit(1);

  const base = parseInput(last?.monthlyValue ?? "0");
  const indexation = numberOf(str(fd, "indexationPercent"));
  const indexed = Math.round((base * (100 + (Number.isNaN(indexation) ? 0 : indexation))) / 100);

  await db.insert(contractYears).values({
    contractId,
    yearNo: (last?.yearNo ?? 0) + 1,
    startDate: str(fd, "startDate"),
    endDate: str(fd, "endDate"),
    monthlyValue: toDb(indexed),
  });

  revalidatePath(`/contracte/${contractId}/ani`);
  revalidatePath(`/contracte/${contractId}`);
}

/* ═══════════════════ Obiective — §9.3 ═══════════════════ */

/**
 * `objectives.kind` nu e o etichetă: rutarea din §7 filtrează catalogul de operațiuni pe
 * el (PROGRESS §4, D4). De-aia e câmp obligatoriu cu listă închisă, nu text liber.
 */
export async function saveObjective(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "contracte.editeaza")) {
    throw new Error("FĂRĂ DREPT: obiectivele se administrează din birou.");
  }
  check(validateObjective(values(fd)));

  const id = str(fd, "id");
  const row = {
    code: str(fd, "code").toUpperCase(),
    name: str(fd, "name"),
    kind: str(fd, "kind"),
    address: nul(str(fd, "address")),
    lat: nul(str(fd, "lat")) === null ? null : num(str(fd, "lat")),
    lng: nul(str(fd, "lng")) === null ? null : num(str(fd, "lng")),
    surface: nul(str(fd, "surface")) === null ? null : num(str(fd, "surface")),
    notes: nul(str(fd, "notes")),
  };

  let objectiveId = id;
  if (id) {
    await db.update(objectives).set(row).where(eq(objectives.id, id));
  } else {
    const [created] = await db.insert(objectives).values(row).returning({ id: objectives.id });
    objectiveId = created.id;
  }

  // Arondarea pe loc, când obiectivul se naște din pasul 4 al contractului.
  const contractId = str(fd, "contractId");
  if (contractId && !id) {
    await db.insert(contractObjectives).values({
      contractId,
      objectiveId: objectiveId!,
      fromDate: str(fd, "fromDate") || new Date().toISOString().slice(0, 10),
      inspectionFrequencyMonths: str(fd, "inspectionFrequencyMonths")
        ? Math.round(numberOf(str(fd, "inspectionFrequencyMonths")))
        : null,
      checklistTemplateId: nul(str(fd, "checklistTemplateId")),
    });
    revalidatePath(`/contracte/${contractId}`);
  }

  revalidatePath("/obiective");
  if (id) revalidatePath(`/obiective/${id}`);
}

/** Pasul 4: legarea unui obiectiv existent la contract, cu profilul lui de inspecție. */
export async function linkObjective(fd: FormData): Promise<void> {
  await guard();
  const contractId = str(fd, "contractId");
  if (!contractId) throw new Error("Contract inexistent.");
  check(validateContractObjective(values(fd)));

  await db.insert(contractObjectives).values({
    contractId,
    objectiveId: str(fd, "objectiveId"),
    fromDate: str(fd, "fromDate"),
    toDate: nul(str(fd, "toDate")),
    checklistTemplateId: nul(str(fd, "checklistTemplateId")),
    inspectionFrequencyMonths: str(fd, "inspectionFrequencyMonths")
      ? Math.round(numberOf(str(fd, "inspectionFrequencyMonths")))
      : null,
  });

  revalidatePath(`/contracte/${contractId}`);
  revalidatePath("/obiective");
}

/**
 * Scoaterea unui obiectiv de pe contract. §9.11: nu se șterge rândul dacă a produs deja
 * ceva — i se pune `toDate`, ca istoricul unităților de lucru să rămână explicabil.
 */
export async function unlinkObjective(fd: FormData): Promise<void> {
  await guard();
  const linkId = str(fd, "linkId");
  const contractId = str(fd, "contractId");
  if (!linkId) throw new Error("Legătură inexistentă.");

  await db
    .update(contractObjectives)
    .set({ toDate: str(fd, "toDate") || new Date().toISOString().slice(0, 10) })
    .where(eq(contractObjectives.id, linkId));

  revalidatePath(`/contracte/${contractId}`);
  revalidatePath("/obiective");
}

/* ═════════════════════ liste de inspecție ═════════════════════ */

/**
 * Setul contractului. Obiectivele care nu s-au desprins îl citesc direct — deci un rând
 * adăugat aici apare imediat pe toate, fără nicio migrare. Asta e diferența dintre
 * o legătură și o copie, și de ea depinde dacă cineva chiar întreține listele.
 */
export async function addContractChecklist(fd: FormData): Promise<void> {
  await guard();
  const contractId = str(fd, "contractId");
  const templateId = str(fd, "templateId");
  if (!contractId || !templateId) throw new Error("Lipsește lista.");
  const frequencyMonths = Math.max(1, Number(str(fd, "frequencyMonths") || "1"));

  await db
    .insert(contractChecklists)
    .values({ contractId, templateId, frequencyMonths })
    .onConflictDoUpdate({
      target: [contractChecklists.contractId, contractChecklists.templateId],
      set: { frequencyMonths },
    });

  revalidatePath(`/contracte/${contractId}`);
}

export async function removeChecklistLink(fd: FormData): Promise<void> {
  await guard();
  const rowId = str(fd, "rowId");
  const contractId = str(fd, "contractId");
  if (!rowId) throw new Error("Rând inexistent.");

  if (str(fd, "scope") === "obiectiv") {
    await db.delete(objectiveChecklists).where(eq(objectiveChecklists.id, rowId));
  } else {
    await db.delete(contractChecklists).where(eq(contractChecklists.id, rowId));
  }

  revalidatePath(`/contracte/${contractId}`);
}

/**
 * Comutatorul moștenit / propriu. La prima desprindere, setul contractului se copiază
 * o dată — omul se așteaptă să plece de la ce avea, nu de la o listă goală.
 */
export async function setObjectiveInspectionSource(fd: FormData): Promise<void> {
  await guard();
  const linkId = str(fd, "linkId");
  const contractId = str(fd, "contractId");
  if (!linkId) throw new Error("Legătură inexistentă.");
  const source = str(fd, "inspectionSource") === "propriu" ? "propriu" : "contract";

  const [link] = await db
    .select()
    .from(contractObjectives)
    .where(eq(contractObjectives.id, linkId))
    .limit(1);
  if (!link) throw new Error("Legătură inexistentă.");

  if (source === "propriu" && link.inspectionSource !== "propriu") {
    const existing = await db
      .select()
      .from(objectiveChecklists)
      .where(eq(objectiveChecklists.contractObjectiveId, linkId));
    if (existing.length === 0) {
      const inherited = await db
        .select()
        .from(contractChecklists)
        .where(eq(contractChecklists.contractId, link.contractId));
      if (inherited.length > 0) {
        await db.insert(objectiveChecklists).values(
          inherited.map((row) => ({
            contractObjectiveId: linkId,
            templateId: row.templateId,
            frequencyMonths: row.frequencyMonths,
          })),
        );
      }
    }
  }

  await db
    .update(contractObjectives)
    .set({ inspectionSource: source })
    .where(eq(contractObjectives.id, linkId));

  const templateId = str(fd, "templateId");
  if (templateId) {
    const frequencyMonths = Math.max(1, Number(str(fd, "frequencyMonths") || "1"));
    await db
      .insert(objectiveChecklists)
      .values({ contractObjectiveId: linkId, templateId, frequencyMonths })
      .onConflictDoUpdate({
        target: [objectiveChecklists.contractObjectiveId, objectiveChecklists.templateId],
        set: { frequencyMonths },
      });
  }

  revalidatePath(`/contracte/${contractId}`);
  revalidatePath("/obiective");
}
