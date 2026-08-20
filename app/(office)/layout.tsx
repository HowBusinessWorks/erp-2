import { redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";

import { Rail } from "@/components/shell/Rail";
import { TopBar } from "@/components/shell/TopBar";
import { db } from "@/lib/db";
import { firms, notifications } from "@/lib/db/schema";
import { navigationFor } from "@/lib/navigation";
import { getSession } from "@/lib/session";

const MONTHS = [
  "ianuarie",
  "februarie",
  "martie",
  "aprilie",
  "mai",
  "iunie",
  "iulie",
  "august",
  "septembrie",
  "octombrie",
  "noiembrie",
  "decembrie",
];

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Terenul e o interfață separată, nu birou cu mai puține butoane (§18.1.1).
  if (session.role === "sef_santier") redirect("/teren");

  const [firm] = session.firmId
    ? await db.select().from(firms).where(eq(firms.id, session.firmId)).limit(1)
    : await db.select().from(firms).limit(1);

  const unread = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        isNull(notifications.readAt),
        or(eq(notifications.userId, session.id), eq(notifications.role, session.role)),
      ),
    );

  const now = new Date();
  const period = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div className="flex h-dvh overflow-hidden">
      <Rail groups={navigationFor(session.role)} firmName={firm?.name ?? "—"} />
      <div className="flex min-w-0 grow flex-col">
        <TopBar
          userName={session.name}
          role={session.role}
          actualRole={session.actualRole}
          impersonating={session.impersonating}
          unread={unread.length}
          period={period}
        />
        <main className="grow overflow-y-auto">
          <div className="mx-auto max-w-[1600px] px-6 py-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
