"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { contracts, invoiceLines, invoices, monthlyReports } from "@/lib/db/schema";
import { subscriptionFor, vatOf } from "@/lib/invoicing";
import { toDb } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

/**
 * Factura se naște din raportul lunar, nu din aer (§20.1: „banii se primesc în baza
 * unui raport"). De asta acțiunea cere un raport ÎNGHEȚAT: dacă documentul pe care
 * clientul îl primește se mai poate schimba, factura emisă pe el nu mai are acoperire.
 *
 * Factura NU trece prin `lib/cost-ledger.ts`. Registrul ține cheltuiala; factura
 * către client e venit. Regula 1 spune că fiecare leu de COST trece pe acolo —
 * un venit scris în `cost_entries` ar strica exact analiza pe care o apără regula.
 */
export async function issueInvoice(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "facturi.gestioneaza")) return;

  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) return;

  const [report] = await db
    .select()
    .from(monthlyReports)
    .where(eq(monthlyReports.id, reportId))
    .limit(1);
  if (!report || !report.frozenAt) return;

  // un raport deja facturat nu se facturează a doua oară
  const [existing] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.monthlyReportId, reportId))
    .limit(1);
  if (existing) return;

  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, report.contractId))
    .limit(1);
  if (!contract) return;

  const net = await subscriptionFor(contract.id, report.year, report.month);
  if (net <= 0) return;
  const vat = vatOf(net);

  // seria e per firmă, numărul e următorul din serie — nu un uuid pe hârtie
  const [last] = await db
    .select({ number: invoices.number })
    .from(invoices)
    .where(and(eq(invoices.firmId, contract.firmId), eq(invoices.series, "DMF")))
    .orderBy(desc(invoices.number))
    .limit(1);

  const issueDate = new Date(report.year, report.month, 5);
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + contract.paymentDays);

  const [invoice] = await db
    .insert(invoices)
    .values({
      firmId: contract.firmId,
      contractId: contract.id,
      clientId: contract.clientId,
      series: "DMF",
      number: (last?.number ?? 1240) + 1,
      issueDate: iso(issueDate),
      dueDate: iso(dueDate),
      status: "emisa",
      netValue: toDb(net),
      vatValue: toDb(vat),
      totalValue: toDb(net + vat),
      monthlyReportId: report.id,
      // schelet: în producție, statusul vine din răspunsul SPV. Vezi /integrari.
      efacturaStatus: null,
    })
    .returning({ id: invoices.id });

  await db.insert(invoiceLines).values({
    invoiceId: invoice.id,
    description: `Servicii de mentenanță ${contract.code} — ${report.month}/${report.year}`,
    quantity: "1",
    unitPrice: toDb(net),
    value: toDb(net),
  });

  revalidatePath("/facturi");
}

/** Trimisă / încasată — cele două schimbări de stare pe care le face un om, cu mâna. */
export async function markInvoice(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "facturi.gestioneaza")) return;

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || (status !== "trimisa" && status !== "incasata")) return;

  await db
    .update(invoices)
    .set({
      status,
      // „trimisă" înseamnă, în realitate, trimisă prin e-Factura. Cât timp conectorul
      // e schelet, marcăm intenția, nu confirmarea SPV — și se vede că e altceva.
      efacturaStatus: status === "trimisa" ? "in_asteptare" : undefined,
    })
    .where(eq(invoices.id, id));

  revalidatePath("/facturi");
}

/** Rapoartele înghețate care încă n-au factură — coada de lucru a ecranului. */
export async function invoiceableReports(firmId: string | null) {
  const rows = await db
    .select({ report: monthlyReports, contract: contracts, invoiceId: invoices.id })
    .from(monthlyReports)
    .innerJoin(contracts, eq(monthlyReports.contractId, contracts.id))
    .leftJoin(invoices, eq(invoices.monthlyReportId, monthlyReports.id))
    .where(
      and(
        isNotNull(monthlyReports.frozenAt),
        firmId ? eq(contracts.firmId, firmId) : undefined,
      ),
    )
    .orderBy(desc(monthlyReports.year), desc(monthlyReports.month));

  return rows.filter((r) => r.invoiceId === null);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
