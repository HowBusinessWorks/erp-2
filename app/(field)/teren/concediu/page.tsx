import Link from "next/link";
import { desc, eq } from "drizzle-orm";

import { cancelLeave } from "@/app/actions/leave";
import { ActionButton } from "@/components/domain/FieldKit";
import { Icon } from "@/components/domain/FieldIcons";
import { Alert, Block, ButtonLink, Buttons, Empty, Label, Pill } from "@/components/domain/FieldUI";
import { db } from "@/lib/db";
import { leaveRequests, users } from "@/lib/db/schema";
import { todayIso } from "@/lib/field";
import {
  LEAVE_KIND_LABEL,
  LEAVE_STATE_LABEL,
  formatRange,
  leaveBalance,
  type LeaveKind,
  type LeaveState,
} from "@/lib/leave";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Concediul meu.
 *
 * Cifra mare de sus e singura care contează: câte zile mai am. Sub ea, cererile mele,
 * cu starea fiecăreia. Cererile netrimise încă la decizie se pot retrage — după ce PM-ul
 * a decis, nu: o cerere aprobată e o promisiune făcută și altcuiva, care și-a planificat
 * șantierul în jurul ei.
 */
export default async function TerenConcediuPage({
  searchParams,
}: {
  searchParams: Promise<{ trimis?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const year = Number(todayIso().slice(0, 4));

  const [me, rows] = await Promise.all([
    db.select().from(users).where(eq(users.id, session.id)).limit(1),
    db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.userId, session.id))
      .orderBy(desc(leaveRequests.fromDate))
      .limit(20),
  ]);

  const entitled = me[0]?.annualLeaveDays ?? 21;
  const balance = leaveBalance(rows, entitled, year);

  return (
    <>
      <div className="f-bar">
        <div className="f-line1">
          <Link href="/teren/eu" className="f-ib" aria-label="Înapoi">
            <Icon name="left" />
          </Link>
          <h1 className="f-sm-title">Concediu</h1>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: "#9AA5B6", fontWeight: 700, letterSpacing: ".06em" }}>
            ZILE RĂMASE ÎN {year}
          </div>
          <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.05, color: "var(--f-am)" }}>
            {balance.remaining}
          </div>
          <div style={{ display: "flex", gap: 20, fontSize: 13.5, color: "#9AA5B6", marginTop: 6, flexWrap: "wrap" }}>
            <span>
              Total an: <b style={{ color: "#fff" }}>{balance.entitled}</b>
            </span>
            <span>
              Luate: <b style={{ color: "#fff" }}>{balance.taken}</b>
            </span>
            <span>
              În aprobare: <b style={{ color: "#fff" }}>{balance.pending}</b>
            </span>
          </div>
        </div>
      </div>

      <div style={{ height: 16 }} />

      {sp.trimis ? (
        <Alert tone="g" icon="check" title="Cererea a plecat">
          Ajunge la managerul de proiect. Vezi răspunsul aici, în listă.
        </Alert>
      ) : null}

      <Buttons>
        <ButtonLink href="/teren/concediu/nou" icon="plus" variant="pri">
          Cerere de concediu
        </ButtonLink>
      </Buttons>

      <Label>Cererile mele</Label>
      {rows.length === 0 ? (
        <Empty icon="plane" title="Nicio cerere încă">
          Cererea se face din trei pași: ce fel de concediu, de când până când, trimite.
        </Empty>
      ) : (
        <Block>
          {rows.map((row) => {
            const status = row.status as LeaveState;
            const tone =
              status === "aprobata" ? "g" : status === "respinsa" ? "r" : status === "anulata" ? "n" : "a";
            return (
              <div key={row.id} className="f-brow" style={{ cursor: "default", flexWrap: "wrap" }}>
                <span className={`f-sq f-${tone}`}>
                  <Icon
                    name={
                      status === "aprobata"
                        ? "check"
                        : status === "respinsa"
                          ? "x"
                          : status === "anulata"
                            ? "x"
                            : "clock"
                    }
                  />
                </span>
                <span className="f-tx">
                  <b>{formatRange(row.fromDate, row.toDate)}</b>
                  <span>
                    {LEAVE_KIND_LABEL[row.kind as LeaveKind]} · {row.workingDays}{" "}
                    {row.workingDays === 1 ? "zi lucrătoare" : "zile lucrătoare"}
                    {row.decisionNote ? ` · ${row.decisionNote}` : ""}
                  </span>
                </span>
                <Pill tone={tone}>{LEAVE_STATE_LABEL[status]}</Pill>

                {status === "ceruta" ? (
                  <form action={cancelLeave} style={{ flex: "1 0 100%", marginTop: 12 }}>
                    <input type="hidden" name="id" value={row.id} />
                    <ActionButton label="Retrage cererea" variant="gho" icon="x" />
                  </form>
                ) : null}
              </div>
            );
          })}
        </Block>
      )}
    </>
  );
}
