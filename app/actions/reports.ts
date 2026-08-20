"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { monthlyReports } from "@/lib/db/schema";
import { buildReportContent } from "@/lib/monthly-report";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

/**
 * Raportul lunar (§20.1) e VERSIONAT și ÎNGHEȚAT la emitere.
 *
 * Motivul e practic: clientul a primit versiunea 1 pe hârtie. Dacă se descoperă o
 * greșeală după aceea, nu se rescrie versiunea 1 — apare versiunea 2, iar diferența
 * se explică. Altfel nimeni nu mai poate spune ce a primit clientul, când.
 */
export async function regenerateReport(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "raport.aproba")) return;

  const contractId = String(formData.get("contractId") ?? "");
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!contractId || !year || !month) return;

  const [latest] = await db
    .select()
    .from(monthlyReports)
    .where(
      and(
        eq(monthlyReports.contractId, contractId),
        eq(monthlyReports.year, year),
        eq(monthlyReports.month, month),
      ),
    )
    .orderBy(desc(monthlyReports.version))
    .limit(1);

  const content = await buildReportContent(contractId, year, month);

  // Un draft se rescrie. Un raport emis nu se atinge — se naște versiunea următoare.
  if (latest && latest.status === "draft") {
    await db
      .update(monthlyReports)
      .set({ content })
      .where(eq(monthlyReports.id, latest.id));
  } else {
    await db.insert(monthlyReports).values({
      contractId,
      year,
      month,
      version: (latest?.version ?? 0) + 1,
      status: "draft",
      content,
    });
  }

  revalidatePath("/rapoarte");
}

export async function freezeReport(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "raport.aproba")) return;

  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) return;

  const [report] = await db
    .select()
    .from(monthlyReports)
    .where(eq(monthlyReports.id, reportId))
    .limit(1);
  if (!report || report.status !== "draft") return;

  // Se reconstruiește o ultimă dată, ca înghețarea să prindă starea de la emitere.
  const content = await buildReportContent(report.contractId, report.year, report.month);

  await db
    .update(monthlyReports)
    .set({
      content,
      status: "emis",
      frozenAt: new Date(),
      approvedBy: session.id,
      sentAt: new Date(),
      token: crypto.randomUUID(),
    })
    .where(eq(monthlyReports.id, reportId));

  revalidatePath("/rapoarte");
}
