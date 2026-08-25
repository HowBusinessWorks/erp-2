import { and, asc, eq, inArray } from "drizzle-orm";

import { submitMaterialNeed } from "@/app/actions/field";
import { SubmitBar } from "@/components/domain/FieldKit";
import { Alert, Block, FieldBar, Label } from "@/components/domain/FieldUI";
import { Select } from "@/components/ui/select";
import { db } from "@/lib/db";
import { objectives, products, warehouses, workUnits } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * T4 — necesar material. TREI atingeri cap-coadă.
 *
 *   1. ＋  2. „Cer materiale"  3. Trimite
 *
 * Ca să iasă trei, tot ce se poate precompleta e precompletat: lucrarea (cea din care
 * ai venit), unitatea de măsură (din produs), gestiunea de livrare. Câmpul de cantitate
 * se deschide focalizat, cu tastatura numerică — scrii „5" și apeși Trimite.
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
  const warehouse = teamWarehouses.find((w) => w.keeperId === session.id) ?? teamWarehouses[0] ?? null;

  return (
    <form action={submitMaterialNeed}>
      <input type="hidden" name="warehouseId" value={warehouse?.id ?? ""} />

      <FieldBar
        title="Cer materiale"
        sub={warehouse ? `Se livrează la ${warehouse.name}` : "Fără gestiune de echipă"}
        back="/teren"
      />

      <h2 className="f-q">Ce îți lipsește?</h2>
      <p className="f-qs">Un produs și o cantitate. Restul e completat deja.</p>

      <Block>
        <div className="f-fld">
          <label htmlFor="productId">Produs</label>
          <Select tone="field" id="productId" name="productId" defaultValue={productRows[0]?.id}>
            {productRows.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.unit})
              </option>
            ))}
          </Select>
        </div>
        <div className="f-fld">
          <label htmlFor="quantity">Cantitate</label>
          <input
            id="quantity"
            name="quantity"
            inputMode="decimal"
            autoFocus
            placeholder="0"
            style={{ fontSize: 30, fontWeight: 800 }}
          />
        </div>
      </Block>

      <Label>Pentru care lucrare</Label>
      <Block>
        <div className="f-fld">
          <Select tone="field" name="workUnitId" defaultValue={preselected} aria-label="Lucrarea">
            {units.map(({ unit, objective }) => (
              <option key={unit.id} value={unit.id}>
                {objective?.name ?? unit.title} — {unit.code}
              </option>
            ))}
          </Select>
        </div>
      </Block>

      <Alert tone="b" icon="truck" title="Întâi magazia, abia apoi furnizorul">
        Necesarul stă 24 de ore la magazie, care poate să-l acopere din stocul existent.
        Vezi unde a ajuns în „Cererile mele".
      </Alert>

      <SubmitBar label="Trimite necesarul" />
    </form>
  );
}
