"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNull, or, sql as raw } from "drizzle-orm";

import { db } from "@/lib/db";
import { recordCost } from "@/lib/cost-ledger";
import {
  laborRates,
  subcontractorAttendance,
  timesheets,
  users,
  workUnits,
} from "@/lib/db/schema";
import { multiplyQty, type Bani } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { activeAllocation } from "@/lib/work-units";

/**
 * Timpul, în două forme care nu se pot amesteca.
 *
 * ECHIPA MEA — oameni cu nume, cu pontaj pe unitate de lucru și cu manoperă în registrul
 * de cost. Șeful pontează opt oameni deodată, cu aceleași ore, pentru că așa se lucrează
 * pe șantier: se vine la 7:30 și se pleacă la 17:00, toți.
 *
 * SUBCONTRACTANȚII — firme, nu oameni. Nu au pontaj și nu produc cost aici: manopera lor
 * intră prin situația de lucrări. Ce ținem e numărul de ore-om declarat pe zi, singura
 * cifră cu care se poate contrazice, la sfârșit de lună, situația pe care o trimit.
 */

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function hourlyRate(qualification: string, day: string): Promise<Bani> {
  const [rate] = await db
    .select()
    .from(laborRates)
    .where(
      and(
        eq(laborRates.qualification, qualification),
        raw`${laborRates.validFrom} <= ${day}`,
        or(isNull(laborRates.validTo), raw`${laborRates.validTo} >= ${day}`),
      ),
    )
    .orderBy(desc(laborRates.validFrom))
    .limit(1);
  return rate ? Number(rate.hourlyCost) * 100 : 0;
}

/** Din intrare și plecare ies orele. 07:30 → 17:00 = 9,5. */
function hoursBetween(from: string, to: string): number {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  if ([fh, fm, th, tm].some((n) => Number.isNaN(n))) return 0;
  return Math.max(0, (th * 60 + tm - (fh * 60 + fm)) / 60);
}

/**
 * Pontajul echipei: mai mulți oameni, aceeași zi, aceeași lucrare.
 *
 * Fiecare om primește rândul lui în `timesheets` și linia lui de manoperă, la calificarea
 * lui. Un rând colectiv „8 oameni × 9,5 ore" ar face costul de manoperă o medie: electricianul
 * și necalificatul nu costă la fel.
 */
export async function submitTeamAttendance(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const workUnitId = String(formData.get("workUnitId") ?? "");
  if (!workUnitId) return;

  const [unit] = await db.select().from(workUnits).where(eq(workUnits.id, workUnitId)).limit(1);
  if (!unit) return;

  const day = String(formData.get("day") ?? today());
  const from = String(formData.get("fromTime") ?? "07:30");
  const to = String(formData.get("toTime") ?? "17:00");
  const hours = hoursBetween(from, to);
  if (hours <= 0) return;

  const userIds = formData.getAll("userId").map(String).filter(Boolean);
  if (userIds.length === 0) return;

  const allocation = await activeAllocation(workUnitId);
  const people = await db.select().from(users).where(inArray(users.id, userIds));

  for (const person of people) {
    const qualification = person.qualification ?? "muncitor";

    await db.insert(timesheets).values({
      userId: person.id,
      workUnitId,
      day,
      hours: hours.toFixed(2),
      qualification,
      note: `${from}–${to}`,
      createdBy: session.id,
    });

    const rate = await hourlyRate(qualification, day);
    if (rate <= 0) continue;

    await recordCost({
      firmId: unit.firmId,
      documentDate: day,
      objectiveId: unit.objectiveId,
      workUnitId,
      usedContractId: allocation?.contractId ?? null,
      usedComponentId: allocation?.componentId ?? null,
      costType: "manopera",
      stage: "consumat",
      value: multiplyQty(rate, hours),
      quantity: hours,
      unit: "ore",
      qualification,
      documentType: "pontaj",
      createdBy: session.id,
    });
  }

  revalidatePath("/teren");
  revalidatePath("/teren/pontaj");
  redirect("/teren/pontaj");
}

/**
 * Pontajul firmelor prezente azi.
 *
 * Se rescrie ziua întreagă, nu se adaugă: dacă șeful revine la ora 16 și corectează
 * „Termo Fasade a venit cu 9 oameni, nu 11", cifra trebuie să se schimbe, nu să se
 * dubleze. De asta ștergem ziua înainte să scriem.
 */
export async function submitSubcontractorAttendance(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const workUnitId = String(formData.get("workUnitId") ?? "");
  if (!workUnitId) return;

  const day = String(formData.get("day") ?? today());
  const partnerIds = formData.getAll("partnerId").map(String).filter(Boolean);

  await db
    .delete(subcontractorAttendance)
    .where(
      and(eq(subcontractorAttendance.workUnitId, workUnitId), eq(subcontractorAttendance.day, day)),
    );

  for (const partnerId of partnerIds) {
    if (String(formData.get(`present_${partnerId}`) ?? "") !== "da") continue;

    const peopleCount = Number(formData.get(`people_${partnerId}`) ?? 0);
    if (peopleCount <= 0) continue;

    const from = String(formData.get(`from_${partnerId}`) ?? "07:30");
    const to = String(formData.get(`to_${partnerId}`) ?? "17:00");

    await db.insert(subcontractorAttendance).values({
      workUnitId,
      partnerId,
      day,
      peopleCount,
      hoursPerPerson: hoursBetween(from, to).toFixed(2),
      fromTime: from,
      toTime: to,
      note: String(formData.get(`note_${partnerId}`) ?? "").trim() || null,
      createdBy: session.id,
    });
  }

  revalidatePath("/teren/pontaj/firme");
  revalidatePath(`/teren/lucrare/${workUnitId}`);
  redirect(`/teren/lucrare/${workUnitId}?f=echipa`);
}
