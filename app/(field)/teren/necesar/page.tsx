import { and, asc, eq, inArray } from "drizzle-orm";

import { submitMaterialNeed } from "@/app/actions/field";
import { FieldHeader, SubmitBar } from "@/components/domain/FieldKit";
import { db } from "@/lib/db";
import { objectives, products, warehouses, workUnits } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * T4 — necesar material. TREI atingeri cap-coadă.
 *
 *   1. ＋
 *   2. „Necesar material"
 *   3. Trimite
 *
 * Ca să iasă trei, tot ce se poate precompleta e precompletat: unitatea de lucru
 * (prima deschisă, sau cea din care ai venit), unitatea de măsură (din produs),
 * gestiunea de livrare. Câmpul de cantitate se deschide focalizat, cu tastatura
 * numerică — scrii „5" și apeși Trimite.
 */
export default async function NecesarPage({
  searchParams,
}: {
  searchParams: Promise<{ ul?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const [units, productRows, teamWarehouses] = await Promise.all([
    db
      .select({ unit: workUnits, objective: objectives })
      .from(workUnits)
      .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
      .where(inArray(workUnits.status, ["planificata", "in_lucru"]))
      .orderBy(asc(workUnits.code))
      .limit(30),
    db
      .select()
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.name))
      .limit(200),
    db
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.kind, "echipa"), eq(warehouses.active, true)))
      .limit(10),
  ]);

  const preselected = sp.ul ?? units[0]?.unit.id ?? "";
  const warehouse =
    teamWarehouses.find((w) => w.keeperId === session.id) ?? teamWarehouses[0] ?? null;

  return (
    <form action={submitMaterialNeed} className="px-4 py-4">
      <input type="hidden" name="warehouseId" value={warehouse?.id ?? ""} />

      <FieldHeader
        eyebrow="Necesar material"
        title="Ce îți lipsește"
        meta={warehouse ? `Se livrează la ${warehouse.name}` : "Fără gestiune de echipă"}
      />

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="eyebrow mb-1 block">Produs</span>
          <select
            name="productId"
            defaultValue={productRows[0]?.id}
            className="h-12 w-full rounded-[3px] border border-rule-strong bg-sheet px-2 text-[0.9375rem] text-ink"
          >
            {productRows.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.unit})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="eyebrow mb-1 block">Cantitate</span>
          <input
            name="quantity"
            inputMode="decimal"
            autoFocus
            placeholder="0"
            className="h-14 w-full rounded-[3px] border border-rule-strong bg-sheet px-3 text-right text-xl tabular text-ink"
          />
        </label>

        <label className="block">
          <span className="eyebrow mb-1 block">Pentru</span>
          <select
            name="workUnitId"
            defaultValue={preselected}
            className="h-12 w-full rounded-[3px] border border-rule-strong bg-sheet px-2 text-[0.875rem] text-ink"
          >
            {units.map(({ unit, objective }) => (
              <option key={unit.id} value={unit.id}>
                {unit.code} — {objective?.name ?? unit.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SubmitBar
        label="Trimite necesarul"
        hint="Merge întâi la magazie, care are 24 de ore să-l acopere din stoc. Abia după aceea se comandă."
      />
    </form>
  );
}
