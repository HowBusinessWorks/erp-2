import Link from "next/link";

import { FieldQuickAdd } from "@/components/domain/FieldKit";
import { Icon } from "@/components/domain/FieldIcons";
import {
  Buttons,
  ButtonLink,
  Block,
  Label,
  Pill,
  Row,
  longDate,
} from "@/components/domain/FieldUI";
import { dayState, equipmentToday, inFlight, myPlaces } from "@/lib/field";
import { liveSignals } from "@/lib/notifications";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * T1 — Ziua ta.
 *
 * Un singur ecran care răspunde la „ce am de făcut azi", în ordinea în care lucrurile
 * devin dureroase dacă nu le faci. Cardul de sus e următoarea acțiune, gata apăsată:
 * omul care deschide aplicația dimineața nu trebuie să aleagă nimic, doar să apese.
 *
 * Zero lei, aici și pe toate ecranele de sub el.
 */
export default async function TerenPage() {
  const session = await requireSession();

  const [day, places, orders, equipment, signals] = await Promise.all([
    dayState(session.id),
    myPlaces(session.id),
    inFlight(session.id),
    equipmentToday(session.id),
    liveSignals(session.role, session.firmId ?? null).catch(() => []),
  ]);

  const total = day.tasks.length;
  const done = day.doneCount;
  const next = day.tasks.find((t) => !t.done);
  const currentPlace = places[0] ?? null;

  return (
    <>
      <div className="f-bar">
        <div className="f-line1">
          <h1>
            Ziua ta
            <span className="f-sub">
              {longDate(new Date())} · {session.name}
            </span>
          </h1>
          <FieldQuickAdd workUnitId={currentPlace?.workUnitId ?? undefined} />
          <Link href="/teren/notificari" className="f-ib" aria-label="Notificări">
            <Icon name="bell" />
            {signals.length > 0 ? <i className="f-dot" /> : null}
          </Link>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginTop: 14,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: "#9AA5B6" }}>
            {done} din {total} făcute
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--f-am)" }}>
            {total - done === 0 ? "gata pe azi" : `${total - done} rămase`}
          </span>
        </div>
        <div className="f-segs">
          {day.tasks.map((task, i) => (
            <i key={task.key} className={i < done ? "f-on" : undefined} />
          ))}
        </div>
        <div style={{ height: 16 }} />
      </div>

      {/* Următoarea acțiune, cu butonul ei. A doua atingere a zilei. */}
      <div className="f-hero">
        {next ? (
          <>
            <small>Următoarea treabă</small>
            <b>{next.title}</b>
            <p>{next.meta}</p>
            <Link href={next.href} className="f-bt f-pri">
              <Icon name="arrow" />
              {next.cta}
            </Link>
          </>
        ) : (
          <>
            <small>Ziua e închisă</small>
            <b>Ai terminat tot ce era de făcut azi</b>
            <p>Pontajul e trimis, jurnalul e scris, fișele sunt închise.</p>
            <Link href="/teren/locuri" className="f-bt f-gho">
              <Icon name="pin" />
              Vezi locurile tale
            </Link>
          </>
        )}
      </div>

      <Label>Ce ai de făcut azi</Label>
      <Block>
        {day.tasks.map((task) => {
          const isNext = next?.key === task.key;
          return (
            <Link
              key={task.key}
              href={task.href}
              className={task.done ? "f-chk f-ok" : "f-chk"}
            >
              <span className="f-cir">
                <Icon name="check" />
              </span>
              <span className="f-tx">
                <b>{task.title}</b>
                <span>{task.meta}</span>
              </span>
              {isNext ? <span className="f-now">ACUM</span> : null}
            </Link>
          );
        })}
      </Block>

      {orders.length > 0 || equipment.length > 0 ? (
        <>
          <Label>Ce se întâmplă azi</Label>
          <Block>
            {orders.map(({ po, objective }) => (
              <Row
                key={po.id}
                href={`/teren/cereri/po-${po.id}`}
                icon="truck"
                tone={po.status === "draft" ? "a" : "g"}
                title={po.status === "draft" ? "Necesar trimis la magazie" : "Materiale comandate"}
                meta={`${po.code} · ${objective?.name ?? "—"}`}
                right={
                  <Pill tone={po.status === "draft" ? "a" : "g"}>
                    {po.status === "draft" ? "La magazie" : "Pe drum"}
                  </Pill>
                }
              />
            ))}
            {equipment.map(({ planning, objective }) => (
              <Row
                key={planning.id}
                href="/teren/utilaje"
                icon="crane"
                tone="b"
                title="Ai un utilaj pe șantier"
                meta={`${objective?.name ?? "—"} · până pe ${planning.toDate}`}
                right={<Pill tone="b">Al tău</Pill>}
              />
            ))}
          </Block>
        </>
      ) : null}

      <Label>Scurtături</Label>
      <Block>
        <Row
          href="/teren/mentenanta"
          icon="tool"
          tone="a"
          title="Mentenanță"
          meta="Inspecțiile și intervențiile mele"
        />
        <Row
          href="/teren/comenzi"
          icon="cart"
          title="Comenzi"
          meta="Materiale, unelte, utilaje, transport"
        />
        <Row
          href="/teren/pontaj/echipa"
          icon="users"
          title="Pontează echipa"
          meta="Mai mulți oameni deodată, aceleași ore"
        />
      </Block>

      <Buttons>
        <ButtonLink href="/teren/cereri" icon="list">
          Vezi toate cererile mele
        </ButtonLink>
      </Buttons>
    </>
  );
}
