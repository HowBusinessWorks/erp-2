"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql as raw } from "drizzle-orm";

import { db } from "@/lib/db";
import { recordCost } from "@/lib/cost-ledger";
import {
  equipment,
  equipmentPlannings,
  fuelLogs,
  handoverProtocols,
  repairs,
  requests,
  tools,
  transports,
} from "@/lib/db/schema";
import { operatingCost, shiftDate } from "@/lib/equipment";
import { multiplyQty, parseInput, toDb } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

/**
 * Blocul C — acțiunile pe resurse.
 *
 * Regula 1 din CLAUDE.md se aplică fără excepție: motorina, reparațiile și orele de
 * utilaj produc bani, deci trec prin `recordCost`. Nimic de aici nu scrie direct în
 * `cost_entries`.
 */

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function num(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

async function firmOf(equipmentId: string): Promise<string | null> {
  const [row] = await db
    .select({ firmId: equipment.firmId })
    .from(equipment)
    .where(eq(equipment.id, equipmentId))
    .limit(1);
  return row?.firmId ?? null;
}

/* ─────────────────── ecranul 28 — alocarea utilajului ─────────────────── */

/**
 * Biroul alocă utilajul CONCRET pe o solicitare venită din teren (§18.1.2).
 *
 * Omul din teren cere „un excavator pentru trei zile la Berceni"; el nu știe și nu
 * trebuie să știe care dintre cele patru excavatoare e liber. Alocarea produce
 * planificarea, iar solicitantul rămâne responsabil de utilaj cât e la el.
 */
export async function allocateEquipment(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "flota.gestioneaza")) return;

  const requestId = String(formData.get("requestId") ?? "");
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const fromDate = String(formData.get("fromDate") ?? "");
  const toDate = String(formData.get("toDate") ?? "");
  const withOperator = formData.get("withOperator") === "on";
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!requestId || !equipmentId || !fromDate || !toDate) return;
  if (toDate < fromDate) return;

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!request) return;

  await db.insert(equipmentPlannings).values({
    equipmentId,
    objectiveId: request.objectiveId,
    workUnitId: request.workUnitId,
    requestId,
    // solicitantul devine responsabil — nu cel care alocă
    responsibleId: request.requestedBy,
    fromDate,
    toDate,
    withOperator,
    status: "planificata",
    note,
  });

  await db
    .update(requests)
    .set({ status: "aprobata", decidedBy: session.id, decidedAt: new Date() })
    .where(eq(requests.id, requestId));

  await db.update(equipment).set({ status: "indisponibil" }).where(eq(equipment.id, equipmentId));

  revalidatePath("/utilaje");
  revalidatePath("/utilaje/solicitari");
  revalidatePath(`/utilaje/${equipmentId}`);
}

/* ─────────────────── ecranul 26 — decalarea în masă ─────────────────── */

/**
 * Decalarea în masă: ploaia mută tot șantierul cu două zile, nu o singură planificare.
 *
 * Se mută doar ce nu s-a întâmplat încă. O planificare încheiată e istorie, iar
 * istoria nu se decalează.
 */
export async function shiftPlannings(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "flota.gestioneaza")) return;

  const ids = formData.getAll("planningId").map(String).filter(Boolean);
  const days = Math.trunc(num(formData.get("days")));
  if (!ids.length || days === 0) return;

  const rows = await db
    .select()
    .from(equipmentPlannings)
    .where(
      and(
        inArray(equipmentPlannings.id, ids),
        inArray(equipmentPlannings.status, ["planificata", "in_derulare"]),
      ),
    );

  for (const row of rows) {
    await db
      .update(equipmentPlannings)
      .set({ fromDate: shiftDate(row.fromDate, days), toDate: shiftDate(row.toDate, days) })
      .where(eq(equipmentPlannings.id, row.id));
  }

  revalidatePath("/utilaje");
}

/* ─────────────────── ecranul 29 — PV predare-primire ─────────────────── */

/**
 * Etapa 1 — predarea. După semnare se blochează: un PV de predare care se mai poate
 * edita nu dovedește nimic.
 */
export async function signHandover(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "flota.gestioneaza")) return;

  const id = String(formData.get("protocolId") ?? "");
  const signature = String(formData.get("signature") ?? "");
  const byName = String(formData.get("handoverByName") ?? "").trim();
  if (!id || !signature || !byName) return;

  const [protocol] = await db
    .select()
    .from(handoverProtocols)
    .where(eq(handoverProtocols.id, id))
    .limit(1);
  if (!protocol || protocol.handoverLocked) return;

  await db
    .update(handoverProtocols)
    .set({
      handoverByName: byName,
      handoverHourMeter: String(num(formData.get("hourMeter"))),
      handoverFuel: String(num(formData.get("fuel"))),
      handoverCondition: String(formData.get("condition") ?? "").trim() || null,
      handoverNotes: String(formData.get("notes") ?? "").trim() || null,
      handoverSignature: signature,
      handoverLocked: true,
    })
    .where(eq(handoverProtocols.id, id));

  if (protocol.planningId) {
    await db
      .update(equipmentPlannings)
      .set({ status: "in_derulare" })
      .where(eq(equipmentPlannings.id, protocol.planningId));
  }

  revalidatePath(`/pv/${id}`);
  revalidatePath("/utilaje");
}

/**
 * Etapa 2 — primirea înapoi. Poate preda altcineva decât cel care a luat utilajul,
 * de asta numele se scrie din nou, nu se copiază.
 *
 * Aici se închide și bucla economică: orele lucrate între cele două citiri de contor
 * intră în registrul de cost la rata internă. Dacă utilajul e imobilizat, nu produce
 * cost de exploatare (§18.1.3).
 */
export async function closeHandover(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "flota.gestioneaza")) return;

  const id = String(formData.get("protocolId") ?? "");
  const signature = String(formData.get("signature") ?? "");
  const byName = String(formData.get("returnByName") ?? "").trim();
  if (!id || !signature || !byName) return;

  const [protocol] = await db
    .select()
    .from(handoverProtocols)
    .where(eq(handoverProtocols.id, id))
    .limit(1);
  if (!protocol || protocol.status === "inchis" || !protocol.handoverLocked) return;

  const returnHourMeter = num(formData.get("hourMeter"));
  const issues = String(formData.get("issues") ?? "").trim() || null;

  await db
    .update(handoverProtocols)
    .set({
      returnDate: today(),
      returnByName: byName,
      returnHourMeter: String(returnHourMeter),
      returnFuel: String(num(formData.get("fuel"))),
      returnCondition: String(formData.get("condition") ?? "").trim() || null,
      returnIssues: issues,
      returnSignature: signature,
      status: "inchis",
    })
    .where(eq(handoverProtocols.id, id));

  if (protocol.equipmentId) {
    const [eq_] = await db
      .select()
      .from(equipment)
      .where(eq(equipment.id, protocol.equipmentId))
      .limit(1);

    if (eq_) {
      const worked = returnHourMeter - Number(protocol.handoverHourMeter ?? 0);

      // contorul merge înainte chiar dacă utilajul e imobilizat — orele s-au întâmplat
      if (worked > 0) {
        await db
          .update(equipment)
          .set({ hourMeter: String(returnHourMeter) })
          .where(eq(equipment.id, eq_.id));
      }

      // dar costul de exploatare NU se calculează pe perioada de imobilizare
      const rate = Number(eq_.internalHourlyRate ?? 0) * 100;
      if (worked > 0 && rate > 0 && eq_.immobilizedFrom === null && eq_.firmId) {
        await recordCost({
          firmId: eq_.firmId,
          documentDate: today(),
          workUnitId: protocol.workUnitId,
          costType: "utilaj",
          stage: "consumat",
          value: operatingCost(Math.round(rate), worked),
          quantity: worked,
          unit: "ore",
          documentType: "pv_predare_primire",
          documentId: protocol.id,
          note: `${eq_.code} · ${eq_.name} — ${worked} ore la retur`,
          createdBy: session.id,
        });
      }

      await db
        .update(equipment)
        .set({ status: issues ? "service" : "disponibil" })
        .where(eq(equipment.id, eq_.id));
    }
  }

  if (protocol.planningId) {
    await db
      .update(equipmentPlannings)
      .set({ status: "incheiata" })
      .where(eq(equipmentPlannings.id, protocol.planningId));
  }

  revalidatePath(`/pv/${id}`);
  revalidatePath("/utilaje");
  revalidatePath("/cost");
}

/* ─────────────────── ecranul 27 — motorină și reparații ─────────────────── */

/** Alimentarea: litri × preț, cu citirea contorului. Produce cost, deci trece prin registru. */
export async function addFuelLog(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "flota.gestioneaza")) return;

  const equipmentId = String(formData.get("equipmentId") ?? "");
  const liters = num(formData.get("liters"));
  const pricePerLiter = parseInput(String(formData.get("pricePerLiter") ?? ""));
  const day = String(formData.get("day") ?? "") || today();
  const hourMeter = num(formData.get("hourMeter"));
  if (!equipmentId || liters <= 0) return;

  const value = multiplyQty(pricePerLiter, liters);

  await db.insert(fuelLogs).values({
    equipmentId,
    day,
    liters: String(liters),
    pricePerLiter: toDb(pricePerLiter),
    value: toDb(value),
    hourMeter: hourMeter > 0 ? String(hourMeter) : null,
    createdBy: session.id,
  });

  if (hourMeter > 0) {
    await db.update(equipment).set({ hourMeter: String(hourMeter) }).where(eq(equipment.id, equipmentId));
  }

  const firmId = await firmOf(equipmentId);
  if (firmId && value > 0) {
    await recordCost({
      firmId,
      documentDate: day,
      costType: "motorina",
      stage: "consumat",
      value,
      quantity: liters,
      unit: "litri",
      documentType: "bon_motorina",
      documentId: equipmentId,
      createdBy: session.id,
    });
  }

  revalidatePath(`/utilaje/${equipmentId}`);
  revalidatePath("/cost");
}

/**
 * Reparația. Costul se raportează la ORE, nu la zile (§18.1.6), iar facturile sunt
 * mai multe, de la furnizori diferiți (§18.1.7) — de asta stau ca listă, nu ca un câmp.
 *
 * Dacă reparația imobilizează utilajul, de aici încolo nu mai produce cost de exploatare.
 */
export async function addRepair(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "flota.gestioneaza")) return;

  const equipmentId = String(formData.get("equipmentId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const kind = String(formData.get("kind") ?? "interventie");
  if (!equipmentId || !description) return;

  const startedAt = String(formData.get("startedAt") ?? "") || today();
  const hours = num(formData.get("hours"));
  const laborCost = parseInput(String(formData.get("laborCost") ?? ""));
  const materialCost = parseInput(String(formData.get("materialCost") ?? ""));
  const totalCost = laborCost + materialCost;
  const immobilized = formData.get("immobilized") === "on";

  await db.insert(repairs).values({
    equipmentId,
    kind: kind as "interventie" | "revizie" | "gresare" | "capitala",
    requestId: String(formData.get("requestId") ?? "") || null,
    description,
    startedAt,
    hours: String(hours),
    laborCost: toDb(laborCost),
    materialCost: toDb(materialCost),
    totalCost: toDb(totalCost),
    immobilized,
  });

  await db
    .update(equipment)
    .set({
      status: immobilized ? "service" : undefined,
      immobilizedFrom: immobilized ? startedAt : undefined,
    })
    .where(eq(equipment.id, equipmentId));

  const firmId = await firmOf(equipmentId);
  if (firmId && totalCost > 0) {
    await recordCost({
      firmId,
      documentDate: startedAt,
      costType: "reparatii",
      stage: "consumat",
      value: totalCost,
      quantity: hours > 0 ? hours : null,
      unit: hours > 0 ? "ore" : null,
      documentType: "fisa_reparatie",
      documentId: equipmentId,
      note: description,
      createdBy: session.id,
    });
  }

  revalidatePath(`/utilaje/${equipmentId}`);
  revalidatePath("/cost");
}

/** Utilajul iese din imobilizare: de acum înainte produce iar cost de exploatare. */
export async function releaseImmobilization(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "flota.gestioneaza")) return;

  const equipmentId = String(formData.get("equipmentId") ?? "");
  if (!equipmentId) return;

  await db
    .update(equipment)
    .set({ immobilizedFrom: null, status: "disponibil" })
    .where(eq(equipment.id, equipmentId));

  await db
    .update(repairs)
    .set({ finishedAt: today(), immobilized: false })
    .where(and(eq(repairs.equipmentId, equipmentId), eq(repairs.immobilized, true)));

  revalidatePath(`/utilaje/${equipmentId}`);
  revalidatePath("/utilaje");
}

/* ─────────────────── ecranul 30 — unelte ─────────────────── */

/** Predarea uneltei: cine o are acum. Returul o aduce înapoi în magazie. */
export async function moveTool(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "flota.gestioneaza")) return;

  const toolId = String(formData.get("toolId") ?? "");
  const holderUserId = String(formData.get("holderUserId") ?? "") || null;
  if (!toolId) return;

  await db
    .update(tools)
    .set({ holderUserId, status: holderUserId ? "activ" : undefined })
    .where(eq(tools.id, toolId));

  revalidatePath("/unelte");
}

/* ─────────────────── ecranul 31 — transporturi ─────────────────── */

/** Coada de transport: cererea devine planificată, apoi efectuată. */
export async function setTransportStatus(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "flota.gestioneaza")) return;

  const transportId = String(formData.get("transportId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!transportId || !["ceruta", "planificata", "efectuata", "anulata"].includes(status)) return;

  await db
    .update(transports)
    .set({ status: status as "ceruta" | "planificata" | "efectuata" | "anulata" })
    .where(eq(transports.id, transportId));

  revalidatePath("/transporturi");
}

/* ─────────────────── T7 — solicitarea din teren ─────────────────── */

/**
 * Șeful de șantier cere un utilaj în două atingeri: activitatea și zilele.
 * NU alege utilajul concret — el cere o capacitate, biroul alege bucata (§18.1.2).
 */
export async function requestEquipment(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "flota.solicita")) return;

  const activity = String(formData.get("activity") ?? "").trim();
  const objectiveId = String(formData.get("objectiveId") ?? "") || null;
  const days = Math.max(1, Math.trunc(num(formData.get("days"))));
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!activity) return;

  const [{ n }] = await db
    .select({ n: raw<string>`count(*)` })
    .from(requests)
    .where(eq(requests.kind, "solicitare_utilaj"));

  await db.insert(requests).values({
    code: `SU-${String(Number(n) + 1).padStart(4, "0")}`,
    kind: "solicitare_utilaj",
    source: "manual",
    title: `${activity} — ${days} ${days === 1 ? "zi" : "zile"}`,
    description: note,
    firmId: session.firmId,
    objectiveId,
    status: "neprocesata",
    requestedBy: session.id,
  });

  revalidatePath("/teren/utilaje");
  revalidatePath("/utilaje/solicitari");
}

/**
 * Observație pe utilaj, din teren. Rămâne legată de utilaj în ambele sensuri: se
 * vede în dosarul lui și poate deveni reparație fără să se retasteze nimic (§18.1.3).
 */
export async function reportEquipmentIssue(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "flota.solicita")) return;

  const equipmentId = String(formData.get("equipmentId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!equipmentId || !title) return;

  const [{ n }] = await db
    .select({ n: raw<string>`count(*)` })
    .from(requests)
    .where(eq(requests.kind, "observatie_utilaj"));

  await db.insert(requests).values({
    code: `OU-${String(Number(n) + 1).padStart(4, "0")}`,
    kind: "observatie_utilaj",
    source: "utilaj",
    title,
    firmId: session.firmId,
    equipmentId,
    status: "neprocesata",
    requestedBy: session.id,
  });

  revalidatePath("/teren/utilaje");
  revalidatePath(`/utilaje/${equipmentId}`);
}
