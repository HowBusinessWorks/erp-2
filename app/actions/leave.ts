"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { leaveRequests, users } from "@/lib/db/schema";
import { consumesQuota, leaveBalance, workingDaysBetween, type LeaveKind } from "@/lib/leave";
import { requireSession } from "@/lib/session";

/**
 * Concediile.
 *
 * Nu produc niciun leu, deci NU trec prin `lib/cost-ledger.ts` — regula 1 vorbește
 * despre costuri, iar o zi liberă nu e o cheltuială înregistrată aici. Manopera intră
 * în cost prin pontaj, iar în zilele de concediu nu există pontaj.
 */

/** Cererea din teren. Zilele lucrătoare se îngheață acum, la depunere. */
export async function requestLeave(formData: FormData): Promise<void> {
  const session = await requireSession();

  const kind = String(formData.get("kind") ?? "odihna") as LeaveKind;
  const fromDate = String(formData.get("fromDate") ?? "");
  const toDate = String(formData.get("toDate") ?? "");
  if (!fromDate || !toDate || toDate < fromDate) return;

  const workingDays = workingDaysBetween(fromDate, toDate);
  if (workingDays <= 0) return;

  // Soldul se verifică la depunere, nu la aprobare: discuția e cu omul care tocmai
  // a ales datele, nu cu PM-ul peste trei zile.
  if (consumesQuota(kind)) {
    const [me] = await db.select().from(users).where(eq(users.id, session.id)).limit(1);
    const mine = await db
      .select({
        kind: leaveRequests.kind,
        status: leaveRequests.status,
        workingDays: leaveRequests.workingDays,
        fromDate: leaveRequests.fromDate,
      })
      .from(leaveRequests)
      .where(eq(leaveRequests.userId, session.id));
    const balance = leaveBalance(mine, me?.annualLeaveDays ?? 21, Number(fromDate.slice(0, 4)));
    if (workingDays > balance.remaining) return;
  }

  await db.insert(leaveRequests).values({
    userId: session.id,
    kind,
    fromDate,
    toDate,
    returnDate: String(formData.get("returnDate") ?? "") || null,
    workingDays,
    reason: String(formData.get("reason") ?? "").trim() || null,
    replacementId: String(formData.get("replacementId") ?? "") || null,
    status: "ceruta",
  });

  revalidatePath("/teren/concediu");
  revalidatePath("/concedii");
  redirect("/teren/concediu?trimis=1");
}

/** Retragerea propriei cereri, cât timp nu s-a decis nimic pe ea. */
export async function cancelLeave(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db
    .update(leaveRequests)
    .set({ status: "anulata" })
    .where(
      and(
        eq(leaveRequests.id, id),
        eq(leaveRequests.userId, session.id),
        eq(leaveRequests.status, "ceruta"),
      ),
    );

  revalidatePath("/teren/concediu");
  revalidatePath("/concedii");
}

/** Decizia de la birou. Cine aprobă și când rămâne scris — ca la rutare (§7). */
export async function decideLeave(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "pm") return;

  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "aprobata" && decision !== "respinsa")) return;

  await db
    .update(leaveRequests)
    .set({
      status: decision,
      decidedBy: session.id,
      decidedAt: new Date(),
      decisionNote: String(formData.get("decisionNote") ?? "").trim() || null,
    })
    .where(and(eq(leaveRequests.id, id), ne(leaveRequests.status, "anulata")))
    .execute();

  revalidatePath("/concedii");
  revalidatePath("/teren/concediu");
}
