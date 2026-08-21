import { and, desc, eq, gte, sql as raw } from "drizzle-orm";

import { backToOffice, logout } from "@/app/actions/session";
import { Icon } from "@/components/domain/FieldIcons";
import { Block, Label, Pill, Row, initials } from "@/components/domain/FieldUI";
import { db } from "@/lib/db";
import { leaveRequests, timesheets, users } from "@/lib/db/schema";
import { myRequests, todayIso } from "@/lib/field";
import { leaveBalance } from "@/lib/leave";
import { ROLE_LABELS } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Eu.
 *
 * Al treilea tab e singurul de pe teren care nu e despre lucrare, ci despre om:
 * orele lui, zilele lui de concediu, cererile lui. Fără el, concediul ar fi ajuns
 * într-un submeniu al pontajului, iar oamenii ar fi continuat să-l ceară pe WhatsApp.
 */
export default async function TerenEuPage() {
  const session = await requireSession();
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [me, hours, leaves, requests] = await Promise.all([
    db.select().from(users).where(eq(users.id, session.id)).limit(1),
    db
      .select({ total: raw<string>`coalesce(sum(${timesheets.hours}), 0)` })
      .from(timesheets)
      .where(and(eq(timesheets.userId, session.id), gte(timesheets.day, monthStart))),
    db
      .select({
        kind: leaveRequests.kind,
        status: leaveRequests.status,
        workingDays: leaveRequests.workingDays,
        fromDate: leaveRequests.fromDate,
      })
      .from(leaveRequests)
      .where(eq(leaveRequests.userId, session.id))
      .orderBy(desc(leaveRequests.fromDate)),
    myRequests(session.id),
  ]);

  const entitled = me[0]?.annualLeaveDays ?? 21;
  const balance = leaveBalance(leaves, entitled, Number(today.slice(0, 4)));
  const monthHours = Number(hours[0]?.total ?? 0);
  const openRequests = requests.filter((r) => r.state === "asteapta" || r.state === "in_lucru").length;

  const monthName = new Intl.DateTimeFormat("ro-RO", { month: "long" }).format(new Date());

  return (
    <>
      <div className="f-bar">
        <div className="f-line1">
          <span
            className="f-av"
            style={{ width: 46, height: 46, background: "var(--f-am)", color: "#10151F", fontSize: 16 }}
          >
            {initials(session.name)}
          </span>
          <h1 style={{ marginLeft: 4 }}>
            {session.name}
            <span className="f-sub">{ROLE_LABELS[session.role]}</span>
          </h1>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <div className="f-stat-dark">
            <div className="f-n">{balance.remaining}</div>
            <div className="f-l">zile de concediu rămase</div>
          </div>
          <div className="f-stat-dark">
            <div className="f-n">{monthHours}</div>
            <div className="f-l">ore lucrate în {monthName}</div>
          </div>
        </div>
      </div>

      <div style={{ height: 16 }} />

      <Label>Ale mele</Label>
      <Block>
        <Row
          href="/teren/pontaj"
          icon="clock"
          tone="b"
          title="Pontajul meu"
          meta="Orele mele, împărțite pe lucrări"
        />
        <Row
          href="/teren/concediu"
          icon="plane"
          tone="g"
          title="Concediu"
          meta={`${balance.remaining} zile rămase din ${entitled}`}
          right={
            balance.pending > 0 ? <Pill tone="a">{balance.pending} în aprobare</Pill> : undefined
          }
        />
        <Row
          href="/teren/cereri"
          icon="list"
          title="Cererile mele"
          meta="Materiale, utilaje, constatări"
          right={openRequests > 0 ? <Pill tone="a">{openRequests} în curs</Pill> : undefined}
        />
        <Row
          href="/teren/situatii"
          icon="clip"
          title="Situații de verificat"
          meta="Cantitățile declarate de subcontractanți"
        />
      </Block>

      <Label>Cont</Label>
      <Block>
        {/* Adminul care s-a uitat „ca șef de șantier" trebuie să se poată întoarce.
            Fără asta rămâne blocat pe teren până expiră cookie-ul de perspectivă. */}
        {session.impersonating ? (
          <form action={backToOffice}>
            <button type="submit" className="f-brow" style={{ width: "100%" }}>
              <span className="f-sq f-b">
                <Icon name="swap" />
              </span>
              <span className="f-tx">
                <b>Înapoi la birou</b>
                <span>Ieși din perspectiva de șef de șantier</span>
              </span>
              <span className="f-go">
                <Icon name="right" />
              </span>
            </button>
          </form>
        ) : null}

        <form action={logout}>
          <button type="submit" className="f-brow" style={{ width: "100%" }}>
            <span className="f-sq f-r">
              <Icon name="logout" />
            </span>
            <span className="f-tx">
              <b>Ieșire din cont</b>
            </span>
          </button>
        </form>
      </Block>
    </>
  );
}
