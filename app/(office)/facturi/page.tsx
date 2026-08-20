import Link from "next/link";
import { desc, eq } from "drizzle-orm";

import { invoiceableReports, issueInvoice, markInvoice } from "@/app/actions/invoices";
import { Badge, Button, EmptyState, PageHeader, SectionRule } from "@/components/ui/primitives";
import { Money } from "@/components/ui/gauge";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import { contracts, invoices, partners } from "@/lib/db/schema";
import { today } from "@/lib/equipment";
import {
  AGING_LABEL,
  EFACTURA_LABEL,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  type AgingBucket,
  agingBucket,
  daysOverdue,
} from "@/lib/invoicing";
import { fromDb } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const MONTHS = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

export default async function FacturiPage({
  searchParams,
}: {
  searchParams: Promise<{ stare?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const manages = can(session.role, "facturi.gestioneaza");
  const day = today();

  const [rows, pending] = await Promise.all([
    db
      .select({ inv: invoices, client: partners, contract: contracts })
      .from(invoices)
      .leftJoin(partners, eq(invoices.clientId, partners.id))
      .leftJoin(contracts, eq(invoices.contractId, contracts.id))
      .orderBy(desc(invoices.issueDate), desc(invoices.number))
      .limit(120),
    invoiceableReports(session.firmId ?? null),
  ]);

  const filtered = sp.stare ? rows.filter((r) => r.inv.status === sp.stare) : rows;

  const outstanding = rows.filter((r) => r.inv.status !== "incasata");
  const totalOutstanding = outstanding.reduce((a, r) => a + fromDb(r.inv.totalValue), 0);
  const totalIssued = rows.reduce((a, r) => a + fromDb(r.inv.totalValue), 0);
  const collected = rows
    .filter((r) => r.inv.status === "incasata")
    .reduce((a, r) => a + fromDb(r.inv.totalValue), 0);

  const buckets = new Map<AgingBucket, number>();
  for (const r of outstanding) {
    const b = agingBucket(r.inv.dueDate, day);
    buckets.set(b, (buckets.get(b) ?? 0) + fromDb(r.inv.totalValue));
  }
  const overdue = totalOutstanding - (buckets.get("in_termen") ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Evidență"
        title="Facturi"
        meta="Factura se naște din raportul lunar înghețat, nu invers — §20.1 spune că banii se primesc în baza unui raport. Trimiterea în e-Factura e schelet declarat, nu cod care se preface."
      />

      {overdue > 0 ? (
        <p className="border-l-2 border-over bg-over-soft px-4 py-2.5 text-tiny text-over">
          <span className="font-medium">
            {<Money value={overdue} tone="over" />} peste scadență.
          </span>{" "}
          Restul creanței e încă în termenul de plată din contract.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Emis" value={totalIssued} />
        <Stat label="Încasat" value={collected} tone="fill" />
        <Stat label="De încasat" value={totalOutstanding} />
        <Stat label="Peste scadență" value={overdue} tone={overdue > 0 ? "over" : undefined} />
      </div>

      {/* ───────────── coada de facturat ───────────── */}
      <div className="space-y-2">
        <SectionRule right={<span className="text-micro text-ink-3">rapoarte înghețate, fără factură</span>}>
          De facturat
        </SectionRule>

        {pending.length === 0 ? (
          <p className="px-1 py-2 text-tiny text-ink-2">
            Nimic în coadă. Fiecare raport trimis către client are deja factură.
          </p>
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Contract</TH>
                  <TH>Luna</TH>
                  <TH>Trimis</TH>
                  <TH numeric>{manages ? "Acțiune" : ""}</TH>
                </TR>
              </THead>
              <TBody>
                {pending.map((p) => (
                  <TR key={p.report.id}>
                    <TD>
                      <Link href={`/contracte/${p.contract.id}`} className="link">
                        {p.contract.code}
                      </Link>
                      <span className="ml-2 text-ink-2">{p.contract.name}</span>
                    </TD>
                    <TD>
                      {MONTHS[p.report.month - 1]} {p.report.year}
                    </TD>
                    <TD className="text-ink-2">
                      {p.report.sentAt ? formatDate(p.report.sentAt) : "—"}
                    </TD>
                    <TD numeric>
                      {manages ? (
                        <form action={issueInvoice}>
                          <input type="hidden" name="reportId" value={p.report.id} />
                          <Button type="submit" size="sm" variant="primary">
                            Emite factura
                          </Button>
                        </form>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Sheet>
        )}
      </div>

      {/* ───────────── registrul ───────────── */}
      <div className="space-y-2">
        <SectionRule
          right={
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip href="/facturi" active={!sp.stare} label="Tot" />
              {Object.entries(INVOICE_STATUS_LABEL).map(([key, label]) => (
                <Chip
                  key={key}
                  href={sp.stare === key ? "/facturi" : `/facturi?stare=${key}`}
                  active={sp.stare === key}
                  label={label}
                />
              ))}
            </div>
          }
        >
          Registrul de facturi
        </SectionRule>

        {filtered.length === 0 ? (
          <EmptyState
            title="Nicio factură"
            hint="Facturile apar aici după ce raportul lunii e înghețat și emis."
          />
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Număr</TH>
                  <TH>Client</TH>
                  <TH>Contract</TH>
                  <TH>Emisă</TH>
                  <TH>Scadentă</TH>
                  <TH numeric>Net</TH>
                  <TH numeric>TVA</TH>
                  <TH numeric>Total</TH>
                  <TH>Stare</TH>
                  <TH>e-Factura</TH>
                  <TH numeric>{manages ? "" : null}</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map(({ inv, client, contract }) => {
                  const late = inv.status !== "incasata" ? daysOverdue(inv.dueDate, day) : 0;
                  return (
                    <TR key={inv.id}>
                      <TD className="tabular font-medium">
                        {inv.series} {inv.number}
                        {inv.isIntercompany ? (
                          <Badge tone="neutral" className="ml-2">
                            intercompany
                          </Badge>
                        ) : null}
                      </TD>
                      <TD>{client?.name ?? "—"}</TD>
                      <TD className="text-ink-2">{contract?.code ?? "—"}</TD>
                      <TD className="tabular text-ink-2">{inv.issueDate}</TD>
                      <TD className="tabular">
                        {inv.dueDate}
                        {late > 0 ? (
                          <span className="ml-2 text-micro text-over">+{late} z</span>
                        ) : null}
                      </TD>
                      <TD numeric>
                        <Money value={fromDb(inv.netValue)} unit={null} />
                      </TD>
                      <TD numeric>
                        <Money value={fromDb(inv.vatValue)} unit={null} tone="muted" />
                      </TD>
                      <TD numeric>
                        <Money value={fromDb(inv.totalValue)} unit={null} />
                      </TD>
                      <TD>
                        <Badge tone={INVOICE_STATUS_TONE[inv.status] ?? "neutral"}>
                          {INVOICE_STATUS_LABEL[inv.status] ?? inv.status}
                        </Badge>
                      </TD>
                      <TD>
                        {inv.efacturaStatus ? (
                          <span className="text-micro text-ink-2">
                            {EFACTURA_LABEL[inv.efacturaStatus] ?? inv.efacturaStatus}
                          </span>
                        ) : (
                          <Link href="/integrari" className="text-micro text-ink-3 underline decoration-dotted">
                            schelet
                          </Link>
                        )}
                      </TD>
                      <TD numeric>
                        {manages && inv.status !== "incasata" ? (
                          <form action={markInvoice} className="flex justify-end gap-1">
                            <input type="hidden" name="id" value={inv.id} />
                            <input
                              type="hidden"
                              name="status"
                              value={inv.status === "emisa" ? "trimisa" : "incasata"}
                            />
                            <Button type="submit" size="sm" variant="quiet">
                              {inv.status === "emisa" ? "Marchează trimisă" : "Marchează încasată"}
                            </Button>
                          </form>
                        ) : null}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
              <tfoot>
                <TFootRow>
                  <TD colSpan={7} className="text-ink-2">
                    {filtered.length} {filtered.length === 1 ? "factură" : "facturi"}
                  </TD>
                  <TD numeric>
                    <Money value={filtered.reduce((a, r) => a + fromDb(r.inv.totalValue), 0)} unit={null} />
                  </TD>
                  <TD colSpan={3} />
                </TFootRow>
              </tfoot>
            </Table>
          </Sheet>
        )}
      </div>

      {/* ───────────── vechimea creanței ───────────── */}
      {outstanding.length > 0 ? (
        <div className="space-y-2">
          <SectionRule>Vechimea creanței</SectionRule>
          <div className="grid gap-3 sm:grid-cols-4">
            {(Object.keys(AGING_LABEL) as AgingBucket[]).map((b) => (
              <Stat
                key={b}
                label={AGING_LABEL[b]}
                value={buckets.get(b) ?? 0}
                tone={b === "peste_60" && (buckets.get(b) ?? 0) > 0 ? "over" : undefined}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "over" | "fill";
}) {
  return (
    <div className="sheet px-3.5 py-2.5">
      <div className="eyebrow">{label}</div>
      <div className="mt-1 text-[1.0625rem] font-medium">
        <Money value={value} tone={tone} />
      </div>
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-[2px] border border-blueprint/30 bg-blueprint-soft px-2 py-0.5 text-micro font-medium text-blueprint-ink"
          : "rounded-[2px] border border-rule px-2 py-0.5 text-micro text-ink-2 transition-colors hover:bg-sunk"
      }
    >
      {label}
    </Link>
  );
}

function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}
