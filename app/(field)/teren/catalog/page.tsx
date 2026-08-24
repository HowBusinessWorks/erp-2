import { submitCart } from "@/app/actions/teren-comenzi";
import { SubmitBar } from "@/components/domain/FieldKit";
import { ChipPick } from "@/components/domain/FieldParts";
import { Block, Empty, FieldBar, Label, Note } from "@/components/domain/FieldUI";
import { OrderCart } from "@/components/domain/OrderCart";
import { todayIso } from "@/lib/field";
import { catalogProducts, catalogTools, myWorks } from "@/lib/field-data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Catalogul și coșul.
 *
 * Cataloagele de materiale se răsfoiesc, nu se caută pe de rost: omul din teren știe
 * „adeziv", nu codul articolului. De asta e listă cu categorii și căutare, iar coșul
 * e o singură comandă — nu patru cereri separate pentru patru saci diferiți.
 *
 * Nicio cifră în lei pe ecran. Prețul îl pune achiziția, la alegerea furnizorului.
 */
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ ul?: string; tip?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const isTools = sp.tip === "unelte";

  const [works, items] = await Promise.all([
    myWorks(session.id),
    isTools ? catalogTools() : catalogProducts(),
  ]);

  const workUnitId = sp.ul && works.some((w) => w.id === sp.ul) ? sp.ul : works[0]?.id;

  if (!workUnitId) {
    return (
      <Empty icon="build" title="Nicio lucrare deschisă">
        Comanda se pune pe o lucrare — altfel nu s-ar ști pe ce buget cade.
      </Empty>
    );
  }

  const work = works.find((w) => w.id === workUnitId)!;

  const cartItems = items.map((item) => ({
    id: item.id,
    name: item.name,
    unit: "unit" in item ? item.unit : "buc",
    meta: item.category,
  }));

  return (
    <>
      <FieldBar
        title={isTools ? "Unelte" : "Materiale"}
        sub={work.title}
        back="/teren/comenzi/nou"
      />

      <form action={submitCart}>
      <input type="hidden" name="workUnitId" value={workUnitId} />

      <Label>Ce comanzi</Label>
      <OrderCart
        items={cartItems}
        addLabel={isTools ? "Adaugă unealtă" : "Adaugă produs"}
        searchPlaceholder={isTools ? "Caută unealtă" : "Caută produs"}
      />

      <Label>Unde și când</Label>
      <Block>
        <div className="f-fld">
          <label htmlFor="neededBy">Când îmi trebuie</label>
          <input id="neededBy" name="neededBy" type="date" defaultValue={todayIso()} />
        </div>
        <div className="f-fld">
          <label htmlFor="dropPoint">Unde se descarcă</label>
          <input
            id="dropPoint"
            name="dropPoint"
            defaultValue={work.address ?? ""}
            placeholder="Ex: poarta 2"
          />
        </div>
        <div className="f-fld">
          <label htmlFor="fieldNote">Mențiuni pentru magazie</label>
          <textarea
            id="fieldNote"
            name="fieldNote"
            placeholder="Ex: să vină cu macara pe camion, nu avem stivuitor"
          />
        </div>
      </Block>

      <Label>Cât de urgent e</Label>
      <div className="f-pad" style={{ paddingTop: 0 }}>
        <ChipPick
          name="urgency"
          value="normal"
          options={[
            { value: "poate_astepta", label: "Poate aștepta" },
            { value: "normal", label: "Normal" },
            { value: "urgent", label: "Urgent" },
          ]}
        />
      </div>

      <Note>
        Comanda stă <b>24 de ore</b> la magazie, care poate să o acopere din stoc înainte să
        se comande ceva. Vezi în „Comenzi" unde a ajuns.
      </Note>

      <SubmitBar label="Trimite comanda" hint="Se trimite tot coșul deodată, ca o singură comandă." />
      </form>
    </>
  );
}
