import { submitCart } from "@/app/actions/teren-comenzi";
import { SubmitBar } from "@/components/domain/FieldKit";
import { ChipPick, PickableLine } from "@/components/domain/FieldParts";
import {
  Block,
  Empty,
  FieldBar,
  Filters,
  Label,
  Note,
} from "@/components/domain/FieldUI";
import { todayIso } from "@/lib/field";
import { catalogCategories, catalogProducts, catalogTools, myWorks } from "@/lib/field-data";
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
  searchParams: Promise<{ ul?: string; tip?: string; cat?: string; q?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const isTools = sp.tip === "unelte";
  const category = sp.cat ?? "toate";

  const [works, categories, items] = await Promise.all([
    myWorks(session.id),
    isTools ? Promise.resolve<string[]>([]) : catalogCategories(),
    isTools ? catalogTools(sp.q) : catalogProducts(sp.q, category),
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
  const base = `/teren/catalog?ul=${workUnitId}${isTools ? "&tip=unelte" : ""}`;

  return (
    <>
      <FieldBar
        title={isTools ? "Unelte" : "Materiale"}
        sub={work.title}
        back="/teren/comenzi/nou"
      />

      {/*
        Căutarea e un formular GET separat, deasupra coșului. Un `<form>` nu poate sta în
        alt `<form>`, iar căutarea nu are ce trimite odată cu comanda.
      */}
      <form method="get" action="/teren/catalog" className="f-pad">
        <input type="hidden" name="ul" value={workUnitId} />
        {isTools ? <input type="hidden" name="tip" value="unelte" /> : null}
        {!isTools ? <input type="hidden" name="cat" value={category} /> : null}
        <div className="f-fld" style={{ margin: 0 }}>
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder={isTools ? "Caută unealtă" : "Caută produs"}
            aria-label="Caută"
          />
        </div>
      </form>

      {!isTools && categories.length > 0 ? (
        <Filters
          options={[
            { value: "toate", label: "Toate" },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
          current={category}
          hrefFor={(value) => `${base}&cat=${value}`}
        />
      ) : null}

      <form action={submitCart}>
      <input type="hidden" name="workUnitId" value={workUnitId} />

      <Label>Bifează ce îți trebuie</Label>
      {items.length === 0 ? (
        <Empty icon="box" title="Nimic găsit">
          Schimbă filtrul sau caută altfel.
        </Empty>
      ) : (
        <Block>
          {items.map((item) => (
            <PickableLine
              key={item.id}
              id={item.id}
              name={item.name}
              meta={"unit" in item ? `se cere în ${item.unit}` : (item.category ?? "unealtă")}
              unit={"unit" in item ? item.unit : "buc"}
            />
          ))}
        </Block>
      )}

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
