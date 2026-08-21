import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { decideLeave } from "@/app/actions/leave";
import { Badge, Button, EmptyState, PageHeader, SectionRule } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import { leaveRequests, users } from "@/lib/db/schema";
import {
  LEAVE_KIND_LABEL,
  LEAVE_STATE_LABEL,
  formatRange,
  type LeaveKind,
  type LeaveState,
} from "@/lib/leave";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Concediile — partea de birou.
 *
 * Cererile vin din aplicația de teren; aici se decid. Ecranul e o listă, nu un
 * calendar: PM-ul se uită la ea de câteva ori pe lună și vrea să știe cine lipsește,
 * când, și cine îl ține locul — nu să navigheze prin săptămâni.
 */
export default async function ConcediiPage() {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "pm") notFound();

  const replacement = alias(users, "replacement");
  const decider = alias(users, "decider");

  const rows = await db
    .select({ leave: leaveRequests, person: users, replacement, decider })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .leftJoin(replacement, eq(leaveRequests.replacementId, replacement.id))
    .leftJoin(decider, eq(leaveRequests.decidedBy, decider.id))
    .orderBy(desc(leaveRequests.status), desc(leaveRequests.fromDate))
    .limit(200);

  const pending = rows.filter((r) => r.leave.status === "ceruta");
  const rest = rows.filter((r) => r.leave.status !== "ceruta");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Resurse"
        title="Concedii"
        meta={`${pending.length} de decis · ${rows.length} în total`}
      />

      <section className="space-y-3">
        <SectionRule>De decis</SectionRule>
        {pending.length === 0 ? (
          <EmptyState
            title="Nimic de decis"
            hint="Cererile trimise din aplicația de teren apar aici, cu soldul deja verificat."
          />
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Persoana</TH>
                  <TH>Perioada</TH>
                  <TH>Fel</TH>
                  <TH numeric>Zile</TH>
                  <TH>Înlocuitor</TH>
                  <TH>Decizie</TH>
                </TR>
              </THead>
              <TBody>
                {pending.map(({ leave, person, replacement: sub }) => (
                  <TR key={leave.id}>
                    <TD>{person.name}</TD>
                    <TD>{formatRange(leave.fromDate, leave.toDate)}</TD>
                    <TD>{LEAVE_KIND_LABEL[leave.kind as LeaveKind]}</TD>
                    <TD numeric>{leave.workingDays}</TD>
                    <TD>{sub?.name ?? "—"}</TD>
                    <TD>
                      <div className="flex gap-2">
                        <form action={decideLeave}>
                          <input type="hidden" name="id" value={leave.id} />
                          <input type="hidden" name="decision" value="aprobata" />
                          <Button type="submit" variant="primary">
                            Aprobă
                          </Button>
                        </form>
                        <form action={decideLeave}>
                          <input type="hidden" name="id" value={leave.id} />
                          <input type="hidden" name="decision" value="respinsa" />
                          <Button type="submit">Respinge</Button>
                        </form>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Sheet>
        )}
      </section>

      <section className="space-y-3">
        <SectionRule>Istoric</SectionRule>
        {rest.length === 0 ? (
          <EmptyState title="Fără istoric" hint="Deciziile luate apar aici." />
        ) : (
          <Sheet>
            <Table>
              <THead>
                <TR>
                  <TH>Persoana</TH>
                  <TH>Perioada</TH>
                  <TH>Fel</TH>
                  <TH numeric>Zile</TH>
                  <TH>Stare</TH>
                  <TH>Decis de</TH>
                </TR>
              </THead>
              <TBody>
                {rest.map(({ leave, person, decider: by }) => (
                  <TR key={leave.id}>
                    <TD>{person.name}</TD>
                    <TD>{formatRange(leave.fromDate, leave.toDate)}</TD>
                    <TD>{LEAVE_KIND_LABEL[leave.kind as LeaveKind]}</TD>
                    <TD numeric>{leave.workingDays}</TD>
                    <TD>
                      <Badge
                        tone={
                          leave.status === "aprobata"
                            ? "fill"
                            : leave.status === "respinsa"
                              ? "over"
                              : "neutral"
                        }
                      >
                        {LEAVE_STATE_LABEL[leave.status as LeaveState]}
                      </Badge>
                    </TD>
                    <TD>{by?.name ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Sheet>
        )}
      </section>
    </div>
  );
}
