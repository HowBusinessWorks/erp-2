import {
  Block,
  ButtonLink,
  Buttons,
  Empty,
  FieldBar,
  Filters,
  Label,
  Pill,
  Row,
  shortDate,
} from "@/components/domain/FieldUI";
import { URGENCY_LABEL, myOrders } from "@/lib/field-data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Comenzile mele — materiale, unelte, utilaje și transporturi, în aceeași listă.
 *
 * În spate aterizează în trei tabele diferite, dar omul care a cerut o nacelă și cinci
 * saci de adeziv a făcut, din punctul lui de vedere, două cereri. Dacă ar trebui să le
 * caute în două ecrane, nu s-ar mai uita la niciunul.
 */

const TABS = [
  { value: "toate", label: "Toate" },
  { value: "astept", label: "Așteaptă" },
  { value: "drum", label: "Pe drum" },
  { value: "gata", label: "Închise" },
];

export default async function ComenziPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; loc?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === sp.f) ? sp.f! : "toate";
  const place = sp.loc ?? "toate";

  const all = await myOrders(session.id);
  const places = [...new Set(all.map((o) => o.placeName).filter((n): n is string => Boolean(n)))];

  const rows = all
    .filter((order) => place === "toate" || order.placeName === place)
    .filter((order) => tab === "toate" || order.group === tab);

  const inFlight = all.filter((o) => o.group !== "gata").length;

  return (
    <>
      <FieldBar title="Comenzi" sub="Tot ce am cerut de pe șantier" back="/teren">
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Pill tone={inFlight > 0 ? "am-solid" : "on-dark"}>{inFlight} în curs</Pill>
          <Pill tone="on-dark">{all.length} în total</Pill>
        </div>
      </FieldBar>

      <Filters
        options={TABS}
        current={tab}
        hrefFor={(value) => `/teren/comenzi?f=${value}&loc=${place}`}
      />

      {places.length > 1 ? (
        <Filters
          options={[
            { value: "toate", label: "Toate locurile" },
            ...places.map((name) => ({ value: name, label: name })),
          ]}
          current={place}
          hrefFor={(value) => `/teren/comenzi?f=${tab}&loc=${value}`}
        />
      ) : null}

      {rows.length === 0 ? (
        <Empty icon="cart" title="Nicio comandă aici">
          Schimbă filtrul sau cere ceva nou.
        </Empty>
      ) : (
        <>
          <Label>Ce am cerut</Label>
          <Block>
            {rows.map((order) => {
              const tone = order.group === "gata" ? "g" : order.group === "drum" ? "b" : "a";
              return (
                <Row
                  key={`${order.kind}-${order.id}`}
                  href={order.kind === "materiale" ? `/teren/comenzi/${order.id}` : "/teren/comenzi"}
                  icon={order.kind === "transport" ? "truck" : "box"}
                  tone={tone}
                  title={`${order.code} — ${order.title}`}
                  meta={[
                    order.placeName,
                    order.meta,
                    order.neededBy ? `trebuie ${shortDate(order.neededBy)}` : null,
                    order.urgency === "urgent" ? URGENCY_LABEL.urgent : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  right={<Pill tone={tone}>{order.stepLabel}</Pill>}
                />
              );
            })}
          </Block>
        </>
      )}

      <Buttons>
        <ButtonLink href="/teren/comenzi/nou" icon="plus" variant="pri">
          Cere ceva nou
        </ButtonLink>
      </Buttons>
    </>
  );
}
