"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { periods } from "@/lib/db/schema";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export async function closePeriod(firmId: string, year: number, month: number): Promise<void> {
  const session = await requireSession();
  // Poarta de permisiuni. Formularele nu pot întoarce valori, deci refuzul e tăcut
  // aici — butonul nici nu se randează pentru rolurile fără drept.
  if (!can(session.role, "perioada.inchide")) return;

  const [existing] = await db
    .select()
    .from(periods)
    .where(and(eq(periods.firmId, firmId), eq(periods.year, year), eq(periods.month, month)))
    .limit(1);

  if (existing) {
    await db
      .update(periods)
      .set({ closedAt: new Date(), closedBy: session.id })
      .where(eq(periods.id, existing.id));
  } else {
    await db
      .insert(periods)
      .values({ firmId, year, month, closedAt: new Date(), closedBy: session.id });
  }

  revalidatePath("/perioade");
}

/**
 * Redeschiderea unei luni. În producție asta ar cere aprobare și ar lăsa urmă în
 * audit trail — aici e un buton, ca demonstrația să fie repetabilă. Vezi PLAN.md §7.
 */
export async function reopenPeriod(firmId: string, year: number, month: number): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "perioada.inchide")) return;

  await db
    .update(periods)
    .set({ closedAt: null, closedBy: null })
    .where(and(eq(periods.firmId, firmId), eq(periods.year, year), eq(periods.month, month)));

  revalidatePath("/perioade");
}
