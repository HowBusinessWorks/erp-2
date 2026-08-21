import { and, asc, eq, ne } from "drizzle-orm";

import { LeaveWizard } from "@/components/domain/LeaveWizard";
import { db } from "@/lib/db";
import { leaveRequests, users } from "@/lib/db/schema";
import { todayIso } from "@/lib/field";
import { leaveBalance } from "@/lib/leave";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Cererea de concediu — trei pași, o singură trimitere. */
export default async function TerenConcediuNouPage() {
  const session = await requireSession();
  const today = todayIso();

  const [me, mine, colleagues] = await Promise.all([
    db.select().from(users).where(eq(users.id, session.id)).limit(1),
    db
      .select({
        kind: leaveRequests.kind,
        status: leaveRequests.status,
        workingDays: leaveRequests.workingDays,
        fromDate: leaveRequests.fromDate,
      })
      .from(leaveRequests)
      .where(eq(leaveRequests.userId, session.id)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.active, true), ne(users.id, session.id)))
      .orderBy(asc(users.name))
      .limit(60),
  ]);

  const balance = leaveBalance(mine, me[0]?.annualLeaveDays ?? 21, Number(today.slice(0, 4)));

  return <LeaveWizard balance={balance} colleagues={colleagues} minDate={today} />;
}
