import { eq } from "drizzle-orm";

import { createInterventionSheet, maintenanceObjectives } from "@/app/actions/mentenanta";
import { Alert, Block, Empty, FieldBar, Label, Note } from "@/components/domain/FieldUI";
import { ChipPick } from "@/components/domain/FieldParts";
import { ActionButton } from "@/components/domain/FieldKit";
import { db } from "@/lib/db";
import { workUnits } from "@/lib/db/schema";
import { subcontractorPartners } from "@/lib/field-data";
import { todayIso } from "@/lib/field";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * T-F2 — fișa de intervenție nouă.
 *
 * Două plecări, nu una: „mă apuc acum" o deschide în lucru, „doar o planific" o lasă
 * neîncepută. Diferența contează pe teren — o fișă planificată pentru joi nu are ce
 * căuta în lista de azi, dar nici nu trebuie ținută minte pe hârtie până joi.
 *
 * Fișa NU se închide aici. Se completează pe parcurs și se închide explicit, din ea.
 */
export default async function InterventieNouaPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string; src?: string }>;
}) {
  await requireSession();
  const sp = await searchParams;

  const [objectives, subcontractors] = await Promise.all([
    maintenanceObjectives(),
    subcontractorPartners(),
  ]);

  if (objectives.length === 0) {
    return (
      <Empty icon="tool" title="Niciun obiectiv de mentenanță">
        Obiectivele se leagă de contract la birou.
      </Empty>
    );
  }

  const [source] = sp.src
    ? await db.select().from(workUnits).where(eq(workUnits.id, sp.src)).limit(1)
    : [];

  return (
    <form action={createInterventionSheet}>
      <input type="hidden" name="sourceUnitId" value={source?.id ?? ""} />

      <FieldBar title="Intervenție nouă" sub="Se deschide, nu se închide" back="/teren/mentenanta" />

      {source ? (
        <Alert tone="b" icon="clip" title={`Din inspecția ${source.code}`}>
          {source.title}
        </Alert>
      ) : null}

      <Label>De la ce a pornit</Label>
      <div className="f-pad" style={{ paddingTop: 0 }}>
        <ChipPick
          name="sourceTag"
          value={source ? "inspectie" : "tichet"}
          options={[
            { value: "tichet", label: "Tichet" },
            { value: "solicitare", label: "Solicitare" },
            { value: "inspectie", label: "În urma inspecției" },
          ]}
        />
      </div>

      <Label>Detalii</Label>
      <Block>
        <div className="f-fld">
          <label htmlFor="title">
            Titlu <span className="f-req">*</span>
          </label>
          <input
            id="title"
            name="title"
            required
            autoFocus
            defaultValue={source ? source.title : ""}
            placeholder="Ex: Înlocuire ventilator circuit 3"
          />
        </div>
        <div className="f-fld">
          <label htmlFor="objectiveId">Obiectiv</label>
          <select
            id="objectiveId"
            name="objectiveId"
            defaultValue={sp.loc ?? source?.objectiveId ?? objectives[0]?.id}
          >
            {objectives.map((objective) => (
              <option key={objective.id} value={objective.id}>
                {objective.name} — {objective.code}
              </option>
            ))}
          </select>
        </div>
        <div className="f-fld">
          <label htmlFor="day">Data</label>
          <input id="day" name="day" type="date" defaultValue={todayIso()} />
        </div>
        <div className="f-fld">
          <label htmlFor="description">Ce e de făcut</label>
          <textarea id="description" name="description" placeholder="Opțional" />
        </div>
        <div className="f-fld">
          <label htmlFor="subcontractorId">Subcontractant</label>
          <select id="subcontractorId" name="subcontractorId" defaultValue="">
            <option value="">— fără —</option>
            {subcontractors.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </select>
        </div>
      </Block>

      <Note>
        Fișa rămâne <b>deschisă</b> până apeși „Finalizează". Până atunci poți adăuga oricând
        însemnări, ore, materiale și poze.
      </Note>

      <div className="f-bts">
        <button type="submit" name="startNow" value="da" className="f-bt f-pri">
          Creează și mă apuc acum
        </button>
        <ActionButton label="Doar o planific pentru mai târziu" variant="out" small={false} />
      </div>
    </form>
  );
}
