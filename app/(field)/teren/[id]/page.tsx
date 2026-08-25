import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq, sql as raw } from "drizzle-orm";

import { submitIntervention, submitInspection } from "@/app/actions/field";
import { ChecklistPoint, SubmitBar } from "@/components/domain/FieldKit";
import {
  Alert,
  Block,
  ButtonLink,
  Buttons,
  Empty,
  FieldBar,
  Label,
  Note,
  Pill,
} from "@/components/domain/FieldUI";
import { Select } from "@/components/ui/select";
import { db } from "@/lib/db";
import {
  checklistItems,
  checklistTemplates,
  contractObjectives,
  fundingAllocations,
  objectives,
  products,
  stock,
  warehouses,
  workUnits,
} from "@/lib/db/schema";
import { requireSession } from "@/lib/session";
import { KIND_LABEL } from "@/lib/work-units";

export const dynamic = "force-dynamic";

/**
 * T2 și T3 — fișa de inspecție și fișa de intervenție.
 *
 * Același ecran, două forme, după tipul unității de lucru. Amândouă au un singur
 * buton: Trimite. Nimic pe ecran nu e în lei.
 */
export default async function FieldUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const [row] = await db
    .select({ unit: workUnits, objective: objectives })
    .from(workUnits)
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(eq(workUnits.id, id))
    .limit(1);
  if (!row) notFound();
  const { unit, objective } = row;

  /*
   * Intervenția are ecran propriu, cu fir de lucru: se completează pe parcurs și se închide
   * explicit. Fișa de aici închide dintr-o singură trimitere, ceea ce e potrivit pentru
   * inspecția cu checklist planificată de la birou, dar nu și pentru o intervenție care
   * ține trei zile.
   */
  if (unit.kind === "interventie") redirect(`/teren/interventii/${unit.id}`);

  const back = unit.objectiveId ? `/teren/locuri/${unit.objectiveId}` : "/teren";

  return unit.kind === "inspectie" ? (
    <InspectionForm
      unit={unit}
      objectiveName={objective?.name ?? "—"}
      objectiveKind={objective?.kind ?? null}
      back={back}
    />
  ) : (
    <InterventionForm
      unit={unit}
      objectiveName={objective?.name ?? "—"}
      userId={session.id}
      back={back}
    />
  );
}

/* ─────────────────────────── T2 — inspecție ─────────────────────────── */

async function InspectionForm({
  unit,
  objectiveName,
  objectiveKind,
  back,
}: {
  unit: typeof workUnits.$inferSelect;
  objectiveName: string;
  objectiveKind: string | null;
  back: string;
}) {
  /**
   * Profilul de inspecție stă pe LEGĂTURA contract–obiectiv, nu pe obiectiv și nu pe
   * contract. Asta rezolvă cazul „pe același contract, la unele obiective faci alte
   * inspecții decât la altele" (§5). Dacă legătura nu are șablon, se cade pe tipul
   * de obiectiv.
   */
  const [link] = await db
    .select()
    .from(contractObjectives)
    .where(eq(contractObjectives.objectiveId, unit.objectiveId))
    .orderBy(desc(contractObjectives.fromDate))
    .limit(1);

  let templateId = link?.checklistTemplateId ?? null;
  if (!templateId) {
    const [fallback] = await db
      .select()
      .from(checklistTemplates)
      .where(
        objectiveKind
          ? and(eq(checklistTemplates.active, true), eq(checklistTemplates.objectiveKind, objectiveKind))
          : eq(checklistTemplates.active, true),
      )
      .limit(1);
    templateId = fallback?.id ?? null;
  }

  const items = templateId
    ? await db
        .select()
        .from(checklistItems)
        .where(eq(checklistItems.templateId, templateId))
        .orderBy(asc(checklistItems.position))
    : [];

  return (
    <form action={submitInspection}>
      <input type="hidden" name="workUnitId" value={unit.id} />

      <FieldBar title={unit.title} sub={`${objectiveName} · ${unit.code}`} back={back}>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Pill tone="am-solid">{KIND_LABEL.inspectie}</Pill>
          <Pill tone="on-dark">
            {items.length} {items.length === 1 ? "punct" : "puncte"}
          </Pill>
        </div>
      </FieldBar>

      {items.length === 0 ? (
        <Empty icon="clip" title="Obiectivul nu are șablon de inspecție">
          Biroul îl atașează pe legătura contract–obiectiv. Până atunci nu ai ce bifa aici.
        </Empty>
      ) : (
        <>
          <Label>Bifează fiecare punct</Label>
          <Block>
            {items.map((item) => (
              <ChecklistPoint key={item.id} id={item.id} text={item.text} section={item.section} />
            ))}
          </Block>

          <Note>
            Fiecare punct NOK trebuie să spună ce se întâmplă mai departe. „Intervenție" și
            „propunere" deschid singure o cerere la birou.
          </Note>

          <SubmitBar label="Trimite fișa" />
        </>
      )}
    </form>
  );
}

/* ─────────────────────────── T3 — intervenție ─────────────────────────── */

async function InterventionForm({
  unit,
  objectiveName,
  userId,
  back,
}: {
  unit: typeof workUnits.$inferSelect;
  objectiveName: string;
  userId: string;
  back: string;
}) {
  // Materialele se iau din gestiunea ECHIPEI, nu din depozitul central: pe teren
  // omul are în dubă doar ce e în gestiunea lui.
  const [teamWarehouse] = await db
    .select()
    .from(warehouses)
    .where(
      and(
        eq(warehouses.kind, "echipa"),
        eq(warehouses.active, true),
        raw`(${warehouses.keeperId} = ${userId} or ${warehouses.keeperId} is null)`,
      ),
    )
    .orderBy(raw`${warehouses.keeperId} nulls last`)
    .limit(1);

  const stockRows = teamWarehouse
    ? await db
        .select({ stock, product: products })
        .from(stock)
        .innerJoin(products, eq(stock.productId, products.id))
        .where(and(eq(stock.warehouseId, teamWarehouse.id), raw`${stock.quantity} > 0`))
        .orderBy(asc(products.name))
        .limit(30)
    : [];

  const [allocation] = await db
    .select()
    .from(fundingAllocations)
    .where(and(eq(fundingAllocations.workUnitId, unit.id), eq(fundingAllocations.status, "activ")))
    .limit(1);

  return (
    <form action={submitIntervention}>
      <input type="hidden" name="workUnitId" value={unit.id} />
      <input type="hidden" name="warehouseId" value={teamWarehouse?.id ?? ""} />

      <FieldBar title={unit.title} sub={`${objectiveName} · ${unit.code}`} back={back}>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Pill tone="am-solid">{KIND_LABEL[unit.kind as keyof typeof KIND_LABEL]}</Pill>
          {allocation ? null : <Pill tone="on-dark">fără finanțare atribuită</Pill>}
        </div>
      </FieldBar>

      <h2 className="f-q">Ce ai făcut?</h2>
      <p className="f-qs">Descrie pe scurt. Restul sunt cifre.</p>

      <Block>
        <div className="f-fld">
          <textarea name="description" autoFocus placeholder="Ex: am demontat carcasa și am curățat rotorul" />
        </div>
      </Block>

      <Label>Cât a durat</Label>
      <Block>
        <div className="f-li">
          <div className="f-tx">
            <b>Ore lucrate</b>
            <span>pe om</span>
          </div>
          <input className="f-num" name="hours" inputMode="decimal" defaultValue="2" aria-label="Ore" />
        </div>
        <div className="f-li">
          <div className="f-tx">
            <b>Câți oameni</b>
            <span>inclusiv tu</span>
          </div>
          <input className="f-num" name="people" inputMode="numeric" defaultValue="1" aria-label="Oameni" />
        </div>
        <div className="f-fld">
          <label htmlFor="qualification">Calificare</label>
          <Select tone="field" id="qualification" name="qualification" defaultValue="muncitor">
            <option value="muncitor">Muncitor</option>
            <option value="electrician">Electrician</option>
            <option value="instalator">Instalator</option>
          </Select>
        </div>
      </Block>

      <Label>Materiale din gestiunea {teamWarehouse ? teamWarehouse.name : "echipei"}</Label>
      {stockRows.length === 0 ? (
        <Alert tone="a" icon="box" title="Gestiunea echipei e goală">
          Cere material din meniul locului, apoi revino și închide fișa.
        </Alert>
      ) : (
        <Block>
          {stockRows.map(({ stock: line, product }) => (
            <div key={line.id} className="f-li">
              <input type="hidden" name="productId" value={product.id} />
              <div className="f-tx">
                <b>{product.name}</b>
                {/* cantități, nu bani */}
                <span>
                  în gestiune {Number(line.quantity)} {product.unit}
                </span>
              </div>
              <input
                className="f-num"
                name={`qty_${product.id}`}
                inputMode="decimal"
                placeholder="0"
                aria-label={`Cantitate din ${product.name}`}
              />
            </div>
          ))}
        </Block>
      )}

      <Buttons>
        <ButtonLink href={`/teren/necesar?ul=${unit.id}`} icon="plus" small>
          Nu e destul — cere material
        </ButtonLink>
      </Buttons>

      <SubmitBar
        label="Trimite și închide fișa"
        hint="Orele intră în pontaj, materialele ies din gestiune. Fișa se închide."
      />
    </form>
  );
}
