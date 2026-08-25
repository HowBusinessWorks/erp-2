import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { Rail } from "@/components/shell/Rail";
import { TopBar } from "@/components/shell/TopBar";
import { db } from "@/lib/db";
import { firms } from "@/lib/db/schema";
import { navigationFor } from "@/lib/navigation";
import { ROLE_LABELS } from "@/lib/permissions";
import { liveSignals } from "@/lib/notifications";
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

  // Semnalele se recalculează la fiecare încărcare — nu există job care să le scrie,
  // deci nu există nici momentul în care rămân în urmă (vezi `lib/notifications.ts`).
  const signals = await liveSignals(session.role, firm?.id ?? null);

  const groups = navigationFor(session.role);

  const now = new Date();
  const period = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div className="flex h-dvh overflow-hidden">
      <Rail
        groups={groups}
        firmName={firm?.name ?? "—"}
        userName={session.name}
        roleLabel={ROLE_LABELS[session.role]}
        signals={signals}
      />
      <div className="flex min-w-0 grow flex-col">
        <TopBar
          userName={session.name}
          role={session.role}
          actualRole={session.actualRole}
          impersonating={session.impersonating}
          signals={signals}
          period={period}
          groups={groups}
        />
        <main className="grow overflow-y-auto print:overflow-visible">
          <div data-print="page" className="mx-auto max-w-[1560px] px-[26px] pb-20 pt-[22px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
