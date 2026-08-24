import { requestEquipmentFromField } from "@/app/actions/teren-comenzi";
import { SubmitBar } from "@/components/domain/FieldKit";
import { ChipPick } from "@/components/domain/FieldParts";
import { Alert, Block, Empty, FieldBar, Label } from "@/components/domain/FieldUI";
import { todayIso } from "@/lib/field";
import { myWorks } from "@/lib/field-data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Cererea de utilaj din teren.
 *
 * Nu e comandă și nu se comportă ca una: trece prin aprobarea PM-ului, pentru că un
 * utilaj costă pe zi și pentru că poate fi mutat de pe alt șantier în loc să fie
 * închiriat (§18.1.2). De asta pleacă drept cerere de rutat, nu drept linie de achiziție.
 *
 * Categoria, nu utilajul anume: șeful de șantier are nevoie de „nacelă 12 m", iar care
 * nacelă anume e o decizie de flotă, luată pe disponibilitate și pe scadențe.
 */

const CATEGORIES = ["Nacelă", "Miniexcavator", "Mai compactor", "Stivuitor telescopic", "Generator"];

export default async function UtilajNouPage({
  searchParams,
}: {
  searchParams: Promise<{ ul?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const works = await myWorks(session.id);
  if (works.length === 0) {
    return (
      <Empty icon="crane" title="Nicio lucrare deschisă">
        Utilajul se cere pentru o lucrare.
      </Empty>
    );
  }

  const today = todayIso();
  const inAWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <form action={requestEquipmentFromField}>
      <FieldBar title="Cerere utilaj" sub="Trece prin aprobarea PM-ului" back="/teren/comenzi/nou" />

      <Label>Ce categorie de utilaj</Label>
      <div className="f-pad" style={{ paddingTop: 0 }}>
        <ChipPick
          name="category"
          value={CATEGORIES[0]}
          options={CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
      </div>

      <Label>Detalii</Label>
      <Block>
        <div className="f-fld">
          <label htmlFor="details">Ce fel anume</label>
          <input id="details" name="details" placeholder="Ex: nacelă articulată min. 12 m" />
        </div>
        <div className="f-fld">
          <label htmlFor="workUnitId">Pentru ce lucrare</label>
          <select id="workUnitId" name="workUnitId" defaultValue={sp.ul ?? works[0].id}>
            {works.map((work) => (
              <option key={work.id} value={work.id}>
                {work.title} — {work.objectiveName}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="f-fld" style={{ flex: 1 }}>
            <label htmlFor="fromDate">De la</label>
            <input id="fromDate" name="fromDate" type="date" defaultValue={today} />
          </div>
          <div className="f-fld" style={{ flex: 1 }}>
            <label htmlFor="toDate">Până la</label>
            <input id="toDate" name="toDate" type="date" defaultValue={inAWeek} />
          </div>
        </div>
        <div className="f-fld">
          <label htmlFor="purpose">La ce îl folosești</label>
          <textarea
            id="purpose"
            name="purpose"
            placeholder="Ex: montaj profile la cornișă, etajele 8–10"
          />
        </div>
      </Block>

      <Alert tone="a" icon="info" title="Merge la aprobarea PM-ului">
        Primești răspunsul în „Comenzi". Dacă e urgent, sună-l după ce trimiți.
      </Alert>

      <SubmitBar label="Trimite cererea" hint="Flota poate să-l mute de pe alt șantier, nu doar să-l închirieze." />
    </form>
  );
}
