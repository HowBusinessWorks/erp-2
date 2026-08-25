import { and, asc, eq, inArray, sql as raw } from "drizzle-orm";

import { submitConsumption } from "@/app/actions/field";
import { SubmitBar } from "@/components/domain/FieldKit";
import { Alert, Block, Empty, FieldBar, Label } from "@/components/domain/FieldUI";
import { Select } from "@/components/ui/select";
import { db } from "@/lib/db";
import {
  objectives,
  products,
  stock,
  warehouses,
  workUnitStages,
  workUnits,
} from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Bonul de consum din teren.
 *
 * Momentul în care materialul devine COST. Până aici a fost activ în gestiune —
 * dacă ar fi devenit cost la recepție, aceiași bani s-ar fi numărat de două ori.
 * Ecranul arată cantități; valoarea o calculează serverul, la prețul produsului.
 */
export default async function TerenConsumPage({
  searchParams,
}: {
  searchParams: Promise<{ ul?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const [units, teamWarehouses] = await Promise.all([
    db
      .select({ unit: workUnits, objective: objectives })
      .from(workUnits)
      .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
      .where(inArray(workUnits.status, ["planificata", "in_lucru"]))
      .orderBy(asc(workUnits.code))
      .limit(30),
    db
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.kind, "echipa"), eq(warehouses.active, true)))
      .limit(10),
  ]);

  const warehouse = teamWarehouses.find((w) => w.keeperId === session.id) ?? teamWarehouses[0] ?? null;
  const selected = sp.ul ?? units[0]?.unit.id ?? "";

  const [rows, stages] = await Promise.all([
    warehouse
      ? db
          .select({ line: stock, product: products })
          .from(stock)
          .innerJoin(products, eq(stock.productId, products.id))
          .where(and(eq(stock.warehouseId, warehouse.id), raw`${stock.quantity} > 0`))
          .orderBy(asc(products.name))
          .limit(60)
      : [],
    selected
      ? db
          .select()
          .from(workUnitStages)
          .where(eq(workUnitStages.workUnitId, selected))
          .orderBy(asc(workUnitStages.position))
      : [],
  ]);

  if (!warehouse || rows.length === 0) {
    return (
      <>
        <FieldBar title="Bon de consum" sub="Ce ai folosit din gestiune" back="/teren/inventar" />
        <Empty icon="box" title="Nu ai ce consuma">
          Gestiunea echipei e goală. Cere materiale, iar după recepție bonul se poate face.
        </Empty>
      </>
    );
  }

  return (
    <form action={submitConsumption}>
      <input type="hidden" name="warehouseId" value={warehouse.id} />

      <FieldBar title="Bon de consum" sub={warehouse.name} back="/teren/inventar" />

      <Label>Pentru ce</Label>
      <Block>
        <div className="f-fld">
          <label htmlFor="workUnitId">Lucrarea</label>
          <Select tone="field" id="workUnitId" name="workUnitId" defaultValue={selected}>
            {units.map(({ unit, objective }) => (
              <option key={unit.id} value={unit.id}>
                {objective?.name ?? unit.title} — {unit.code}
              </option>
            ))}
          </Select>
        </div>
        {stages.length > 0 ? (
          <div className="f-fld">
            <label htmlFor="stageId">Etapa</label>
            <Select tone="field" id="stageId" name="stageId" defaultValue="">
              <option value="">— fără etapă —</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.position}. {stage.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="f-fld">
          <label htmlFor="note">Mențiune</label>
          <input id="note" name="note" placeholder="Opțional" />
        </div>
      </Block>

      <Label>Cât ai consumat din fiecare</Label>
      <Block>
        {rows.map(({ line, product }) => {
          const available = Number(line.quantity) - Number(line.reserved ?? 0);
          return (
            <div key={line.id} className="f-li">
              <input type="hidden" name="productId" value={product.id} />
              <div className="f-tx">
                <b>{product.name}</b>
                <span>
                  disponibil {available} {product.unit}
                </span>
              </div>
              <input
                className="f-num"
                name={`qty_${product.id}`}
                inputMode="decimal"
                placeholder="0"
                aria-label={`Consum din ${product.name}`}
              />
            </div>
          );
        })}
      </Block>

      <Alert tone="b" icon="info" title="Se scade automat din gestiune">
        Iar dacă un material coboară sub prag, apare semnalul de stoc minim la magazie.
      </Alert>

      <SubmitBar label="Trimite bonul" />
    </form>
  );
}
