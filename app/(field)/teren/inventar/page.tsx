import { and, asc, eq, sql as raw } from "drizzle-orm";

import { Block, ButtonLink, Buttons, Empty, FieldBar, Note, Pill } from "@/components/domain/FieldUI";
import { db } from "@/lib/db";
import { products, stock, warehouses } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Inventarul echipei.
 *
 * Coloana din dreapta e **disponibilul**, nu cantitatea: rezervatul e promis altcuiva
 * și a-l afișa ca disponibil e felul cel mai simplu de a promite de două ori aceeași
 * marfă (§17). Zero lei — nici CMP, nici valoare de stoc.
 */
export default async function TerenInventarPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const teamWarehouses = await db
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.kind, "echipa"), eq(warehouses.active, true)))
    .limit(10);

  const warehouse = teamWarehouses.find((w) => w.keeperId === session.id) ?? teamWarehouses[0] ?? null;

  const rows = warehouse
    ? await db
        .select({ line: stock, product: products })
        .from(stock)
        .innerJoin(products, eq(stock.productId, products.id))
        .where(and(eq(stock.warehouseId, warehouse.id), raw`${stock.quantity} > 0`))
        .orderBy(asc(products.name))
        .limit(120)
    : [];

  const back = sp.loc ? `/teren/locuri/${sp.loc}` : "/teren";

  return (
    <>
      <FieldBar
        title="Inventar"
        sub={warehouse ? warehouse.name : "Fără gestiune de echipă"}
        back={back}
      >
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Pill tone="on-dark">
            {rows.length} {rows.length === 1 ? "produs" : "produse"}
          </Pill>
        </div>
      </FieldBar>

      <div style={{ height: 16 }} />

      {rows.length === 0 ? (
        <Empty icon="box" title="Gestiunea e goală">
          Cere materiale din meniul locului. Ajung aici după ce le recepționează magazia.
        </Empty>
      ) : (
        <Block>
          {rows.map(({ line, product }) => {
            const quantity = Number(line.quantity);
            const reserved = Number(line.reserved ?? 0);
            const available = quantity - reserved;
            const min = Number(product.minStock);
            const low = min > 0 && available <= min;
            return (
              <div
                key={line.id}
                className="f-li"
                style={low ? { background: "var(--f-rd-l)" } : undefined}
              >
                <div className="f-tx">
                  <b>{product.name}</b>
                  <span style={low ? { color: "var(--f-rd)", fontWeight: 800 } : undefined}>
                    {low
                      ? "Stoc mic — cere înainte să rămâi fără"
                      : reserved > 0
                        ? `${reserved} ${product.unit} rezervat`
                        : product.code}
                  </span>
                </div>
                <span className="f-qv" style={low ? { color: "var(--f-rd)" } : undefined}>
                  {available} <span className="f-mut f-sm">{product.unit}</span>
                </span>
              </div>
            );
          })}
        </Block>
      )}

      <Note>
        Cifra e <b>disponibilul</b>: cantitatea din gestiune minus ce e deja rezervat pentru
        altceva.
      </Note>

      <Buttons>
        <ButtonLink href="/teren/consum" icon="clip" variant="pri">
          Fă bon de consum
        </ButtonLink>
        <ButtonLink href="/teren/necesar" icon="plus">
          Cere materiale
        </ButtonLink>
      </Buttons>
    </>
  );
}
