import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql as raw } from "drizzle-orm";

import { submitIntervention, submitInspection } from "@/app/actions/field";
import { ChecklistPoint, FieldHeader, SubmitBar } from "@/components/domain/FieldKit";
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

  return unit.kind === "inspectie" ? (
    <InspectionForm unit={unit} objectiveName={objective?.name ?? "—"} objectiveKind={objective?.kind ?? null} />
  ) : (
    <InterventionForm
      unit={unit}
      objectiveName={objective?.name ?? "—"}
      userId={session.id}
    />
  );
}

/* ─────────────────────────── T2 ─────────────────────────── */

async function InspectionForm({
  unit,
  objectiveName,
  objectiveKind,
}: {
  unit: typeof workUnits.$inferSelect;
  objectiveName: string;
  objectiveKind: string | null;
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
    <form action={submitInspection} className="px-4 py-4">
      <input type="hidden" name="workUnitId" value={unit.id} />
      <FieldHeader
        eyebrow={KIND_LABEL.inspectie}
        title={objectiveName}
        meta={`${unit.code} · ${items.length} puncte`}
      />

      {items.length === 0 ? (
        <p className="py-8 text-tiny text-ink-2">
          Obiectivul nu are șablon de inspecție. Biroul îl atașează pe legătura
          contract–obiectiv.
        </p>
      ) : (
        <ul className="mt-1">
          {items.map((item) => (
            <ChecklistPoint key={item.id} id={item.id} text={item.text} section={item.section} />
          ))}
        </ul>
      )}

      <SubmitBar
        label="Trimite fișa"
        hint="Fiecare punct NOK cu ieșirea „intervenție” sau „propunere” deschide singur o cerere la birou."
      />
    </form>
  );
}

/* ─────────────────────────── T3 ─────────────────────────── */

async function InterventionForm({
  unit,
  objectiveName,
  userId,
}: {
  unit: typeof workUnits.$inferSelect;
  objectiveName: string;
  userId: string;
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
    <form action={submitIntervention} className="px-4 py-4">
      <input type="hidden" name="workUnitId" value={unit.id} />
      <input type="hidden" name="warehouseId" value={teamWarehouse?.id ?? ""} />

      <FieldHeader
        eyebrow={KIND_LABEL[unit.kind as keyof typeof KIND_LABEL]}
        title={objectiveName}
        meta={`${unit.code}${allocation ? "" : " · fără finanțare atribuită"}`}
      />

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="eyebrow mb-1 block">Ce ai făcut</span>
          <textarea
            name="description"
            rows={3}
            autoFocus
            placeholder="Descrie pe scurt"
            className="w-full rounded-[3px] border border-rule-strong bg-sheet px-2.5 py-2 text-[0.9375rem] leading-relaxed text-ink"
          />
        </label>

        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="eyebrow mb-1 block">Ore</span>
            <input
              name="hours"
              inputMode="decimal"
              defaultValue="2"
              className="h-11 w-full rounded-[3px] border border-rule-strong bg-sheet px-2.5 text-right text-[0.9375rem] tabular text-ink"
            />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">Oameni</span>
            <input
              name="people"
              inputMode="numeric"
              defaultValue="1"
              className="h-11 w-full rounded-[3px] border border-rule-strong bg-sheet px-2.5 text-right text-[0.9375rem] tabular text-ink"
            />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">Calificare</span>
            <select
              name="qualification"
              defaultValue="muncitor"
              className="h-11 w-full rounded-[3px] border border-rule-strong bg-sheet px-2 text-[0.875rem] text-ink"
            >
              <option value="muncitor">Muncitor</option>
              <option value="electrician">Electrician</option>
              <option value="instalator">Instalator</option>
            </select>
          </label>
        </div>

        <div>
          <div className="eyebrow mb-1">
            Materiale din gestiunea {teamWarehouse ? teamWarehouse.name : "echipei"}
          </div>
          {stockRows.length === 0 ? (
            <p className="text-tiny text-ink-2">
              Gestiunea echipei e goală. Cere material cu ＋ → Necesar material.
            </p>
          ) : (
            <ul className="divide-y divide-rule border-y border-rule">
              {stockRows.map(({ stock: line, product }) => (
                <li key={line.id} className="flex items-center justify-between gap-3 py-2.5">
                  <input type="hidden" name="productId" value={product.id} />
                  <span className="min-w-0">
                    <span className="block text-[0.875rem] leading-snug text-ink">{product.name}</span>
                    {/* Cantități, nu bani. */}
                    <span className="block text-micro text-ink-3">
                      în gestiune {Number(line.quantity)} {product.unit}
                    </span>
                  </span>
                  <input
                    name={`qty_${product.id}`}
                    inputMode="decimal"
                    placeholder="0"
                    className="h-11 w-20 shrink-0 rounded-[3px] border border-rule-strong bg-sheet px-2 text-right text-[0.9375rem] tabular text-ink"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-tiny text-ink-2">
          Nu e destul ca să închizi?{" "}
          <Link href={`/teren/necesar?ul=${unit.id}`} className="underline">
            Cere material
          </Link>{" "}
          sau{" "}
          <Link href={`/teren/jurnal?ul=${unit.id}`} className="underline">
            scrie în jurnal
          </Link>
          .
        </p>
      </div>

      <SubmitBar
        label="Trimite și închide"
        hint="Orele intră în pontaj, materialele ies din gestiune. Amândouă produc linii în registrul de cost."
      />
    </form>
  );
}
