import { and, asc, eq, sql as raw } from "drizzle-orm";

import { maintenanceObjectives } from "@/app/actions/mentenanta";
import { InspectionWizard } from "@/components/domain/InspectionWizard";
import { Empty } from "@/components/domain/FieldUI";
import { db } from "@/lib/db";
import { products, stock, ticketTypes, warehouses } from "@/lib/db/schema";
import { effectiveLists } from "@/lib/inspections";
import { subcontractorPartners } from "@/lib/field-data";
import { todayIso } from "@/lib/field";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * T-F1 — fișa de inspecție nouă, deschisă direct din teren.
 *
 * Până acum inspecțiile veneau doar de la birou, ca unități de lucru planificate. Omul
 * care ajunge la obiectiv și vede că mai e ceva de verificat nu avea cum să deschidă una
 * singur — și nici nu are de ce să sune la birou ca să i se planifice ce face oricum azi.
 */
export default async function InspectieNouaPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const today = todayIso();

  const [objectives, subcontractors, listMap, types, teamWarehouse] = await Promise.all([
    maintenanceObjectives(),
    subcontractorPartners(),
    // Listele efective pentru toate obiectivele deodată: schimbarea obiectivului în
    // wizard nu are voie să coste un tur la server, omul e pe date mobile.
    effectiveLists(today),
    db
      .select({ id: ticketTypes.id, name: ticketTypes.name })
      .from(ticketTypes)
      .where(eq(ticketTypes.active, true))
      .orderBy(asc(ticketTypes.position)),
    db
      .select()
      .from(warehouses)
      .where(
        and(
          eq(warehouses.kind, "echipa"),
          eq(warehouses.active, true),
          raw`(${warehouses.keeperId} = ${session.id} or ${warehouses.keeperId} is null)`,
        ),
      )
      .orderBy(raw`${warehouses.keeperId} nulls last`)
      .limit(1),
  ]);

  // Materialele se iau din gestiunea ECHIPEI: pe teren omul are în dubă doar ce e la el.
  const stockLines = teamWarehouse[0]
    ? await db
        .select({ id: products.id, name: products.name, unit: products.unit, quantity: stock.quantity })
        .from(stock)
        .innerJoin(products, eq(stock.productId, products.id))
        .where(and(eq(stock.warehouseId, teamWarehouse[0].id), raw`${stock.quantity} > 0`))
        .orderBy(asc(products.name))
        .limit(20)
    : [];

  if (objectives.length === 0) {
    return (
      <Empty icon="clip" title="Niciun obiectiv de mentenanță">
        Obiectivele se leagă de contract la birou. Până atunci nu ai unde face inspecția.
      </Empty>
    );
  }

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <InspectionWizard
      objectives={objectives}
      subcontractors={subcontractors}
      lists={Object.fromEntries(listMap)}
      disciplines={types}
      stockLines={stockLines.map((line) => ({
        id: line.id,
        name: line.name,
        unit: line.unit,
        quantity: Number(line.quantity),
      }))}
      today={today}
      tomorrow={tomorrow}
      reportPeriod={today.slice(0, 7)}
      backHref="/teren/mentenanta"
      presetObjectiveId={sp.loc}
    />
  );
}
