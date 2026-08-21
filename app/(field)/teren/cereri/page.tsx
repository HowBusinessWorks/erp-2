import Link from "next/link";

import { Icon } from "@/components/domain/FieldIcons";
import { Block, ButtonLink, Buttons, Empty, Filters, Pill } from "@/components/domain/FieldUI";
import { myRequests } from "@/lib/field";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "toate", label: "Toate" },
  { value: "asteapta", label: "Așteaptă răspuns" },
  { value: "in_lucru", label: "Pe drum" },
  { value: "gata", label: "Rezolvate" },
];

/**
 * Cererile mele — tot ce am cerut, într-o singură listă.
 *
 * Un necesar de material trăiește ca `purchase_order`, o solicitare de utilaj ca
 * `request`. Omul din teren nu știe asta și nu are de ce: el a cerut ceva și vrea să
 * vadă unde a ajuns. Împărțirea pe tabele e problema noastră, nu a lui.
 */
export default async function TerenCereriPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const filter = FILTERS.some((f) => f.value === sp.f) ? sp.f! : "toate";

  const all = await myRequests(session.id);
  const rows = filter === "toate" ? all : all.filter((r) => r.state === filter);

  const waiting = all.filter((r) => r.state === "asteapta").length;
  const moving = all.filter((r) => r.state === "in_lucru").length;

  return (
    <>
      <div className="f-bar">
        <div className="f-line1">
          <Link href="/teren" className="f-ib" aria-label="Înapoi">
            <Icon name="left" />
          </Link>
          <h1 className="f-sm-title">
            Cererile mele
            <span className="f-sub">De pe toate locurile</span>
          </h1>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <div className="f-stat-dark">
            <div className="f-n" style={{ color: "var(--f-am)" }}>
              {waiting}
            </div>
            <div className="f-l">așteaptă răspuns</div>
          </div>
          <div className="f-stat-dark">
            <div className="f-n" style={{ color: "#4ADE80" }}>
              {moving}
            </div>
            <div className="f-l">acceptate / pe drum</div>
          </div>
        </div>
      </div>

      <Filters options={FILTERS} current={filter} hrefFor={(v) => `/teren/cereri?f=${v}`} />

      {rows.length === 0 ? (
        <Empty icon="list" title="Nimic aici">
          Cererile trimise de tine apar în lista asta, cu tot cu răspunsul biroului.
        </Empty>
      ) : (
        <Block>
          {rows.map((row) => (
            <Link key={row.id} href={`/teren/cereri/${row.id}`} className="f-brow">
              <span
                className={`f-sq f-${row.state === "asteapta" ? "a" : row.state === "respinsa" ? "r" : row.state === "gata" ? "g" : "b"}`}
              >
                <Icon
                  name={row.kind === "material" ? "box" : row.kind === "utilaj" ? "crane" : "pen"}
                />
              </span>
              <span className="f-tx">
                <b>{row.title}</b>
                <span>
                  {row.code} · {row.meta}
                </span>
              </span>
              <Pill
                tone={
                  row.state === "asteapta"
                    ? "a"
                    : row.state === "respinsa"
                      ? "r"
                      : row.state === "gata"
                        ? "g"
                        : "b"
                }
              >
                {row.stateLabel}
              </Pill>
            </Link>
          ))}
        </Block>
      )}

      <Buttons>
        <ButtonLink href="/teren/necesar" icon="plus" variant="pri">
          Cerere nouă
        </ButtonLink>
      </Buttons>
    </>
  );
}
