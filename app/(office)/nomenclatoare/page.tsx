import { asc, eq } from "drizzle-orm";

import { setNomenclatorActive, type ActivableEntity } from "@/app/actions/nomenclatoare";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Money } from "@/components/ui/gauge";
import { db } from "@/lib/db";
import {
  checklistItems,
  checklistTemplates,
  inspectionChecks,
  ticketTypes,
  firms,
  fuelPrices,
  laborRates,
  objectives,
  operationCatalog,
  operationCatalogMaterials,
  partners,
  products,
  pvTemplates,
  users,
} from "@/lib/db/schema";
import { fromDb } from "@/lib/money";
import {
  NOMENCLATOR_TABS,
  PARTNER_TYPES,
  PV_KINDS,
  formatChecklistItems,
  formatOperationMaterials,
  monthLabel,
  type NomenclatorTab,
} from "@/lib/nomenclatoare-types";
import { ROLE_LABELS, can, type Role } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

import {
  ChecklistForm,
  InspectionCheckForm,
  FirmForm,
  FuelPriceForm,
  LaborRateForm,
  OperationForm,
  PartnerForm,
  ProductForm,
  PvTemplateForm,
  UserForm,
  type Opt,
} from "./NomenclatorForms";

export const dynamic = "force-dynamic";

/**
 * Ecranul 37 — Nomenclatoare (PLAN.md §9.1). Casa datelor de referință: fără ea,
 * restul blocului E n-are ce pune în `<select>`.
 *
 * Filele stau pe URL (`?fila=…`), nu în stare locală: pagina rămâne componentă de
 * server și fiecare filă își aduce doar datele ei.
 */
export default async function NomenclatoarePage({
  searchParams,
}: {
  searchParams: Promise<{ fila?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const tab: NomenclatorTab = NOMENCLATOR_TABS.some((t) => t.key === sp.fila)
    ? (sp.fila as NomenclatorTab)
    : "firme";

  // Regula 5: poarta e `lib/permissions.ts`, verificată și aici, nu doar în acțiuni.
  if (!can(session.role, "nomenclatoare.editeaza")) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Evidență" title="Nomenclatoare" />
        <EmptyState
          title="Nomenclatoarele se administrează din birou"
          hint="Datele de referință — produse, calificări, rate, catalog de operațiuni — le ține echipa de birou. Rolul tău lucrează cu ele, dar nu le schimbă."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Evidență"
        title="Nomenclatoare"
        meta="Datele de referință din care alege tot restul aplicației. Nimic nu se șterge de aici: ce a fost folosit o dată se dezactivează, ca rapoartele vechi să rămână citibile."
      />

      <Tabs
        active={tab}
        items={NOMENCLATOR_TABS.map((t) => ({
          key: t.key,
          href: `/nomenclatoare?fila=${t.key}`,
          label: t.label,
        }))}
      />

      {tab === "firme" ? <FirmeTab /> : null}
      {tab === "parteneri" ? <ParteneriTab /> : null}
      {tab === "produse" ? <ProduseTab /> : null}
      {tab === "calificari" ? <CalificariTab /> : null}
      {tab === "operatiuni" ? <OperatiuniTab /> : null}
      {tab === "puncte" ? <PuncteTab /> : null}
      {tab === "checklist" ? <ChecklistTab /> : null}
      {tab === "utilizatori" ? <UtilizatoriTab /> : null}
      {tab === "motorina" ? <MotorinaTab /> : null}
      {tab === "pv" ? <PvTab /> : null}
    </div>
  );
}

/* ───────────────────────── piese comune ───────────────────────── */

function TabHead({ hint, action }: { hint: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <p className="max-w-prose text-tiny text-ink-2">{hint}</p>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

/** Dezactivare / reactivare — niciodată ștergere (PLAN.md §9.11). */
function ActiveCell({
  entity,
  id,
  active,
}: {
  entity: ActivableEntity;
  id: string;
  active: boolean;
}) {
  return (
    <form action={setNomenclatorActive} className="flex items-center justify-end gap-2">
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <Button type="submit" variant="quiet" size="sm">
        {active ? "Dezactivează" : "Reactivează"}
      </Button>
    </form>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge tone="fill">Activ</Badge>
  ) : (
    <Badge tone="neutral">Dezactivat</Badge>
  );
}

function rowTone(active: boolean): string | undefined {
  return active ? undefined : "opacity-55";
}

/* ───────────────────────────── Firme ───────────────────────────── */

async function FirmeTab() {
  const rows = await db.select().from(firms).orderBy(asc(firms.name));

  return (
    <section className="space-y-3">
      <TabHead
        hint="Fiecare firmă își emite facturile pe seria ei. Prefixul de aici e cel pe care îl citește lib/invoicing.ts."
        action={<FirmForm />}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Nicio firmă"
          hint="Fără cel puțin o firmă nu se poate emite nicio factură și niciun contract n-are emitent."
          action={<FirmForm />}
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Denumire</TH>
                <TH>CUI</TH>
                <TH>Reg. com.</TH>
                <TH>Prefix</TH>
                <TH>Stare</TH>
                <TH numeric>Acțiuni</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((f) => (
                <TR key={f.id} className={rowTone(f.active)}>
                  <TD className="font-medium">{f.name}</TD>
                  <TD muted>{f.cui}</TD>
                  <TD muted>{f.regCom ?? "—"}</TD>
                  <TD className="tabular">{f.documentPrefix}</TD>
                  <TD>
                    <StatusBadge active={f.active} />
                  </TD>
                  <TD numeric>
                    <div className="flex items-center justify-end gap-1">
                      <FirmForm
                        firm={{
                          id: f.id,
                          name: f.name,
                          cui: f.cui,
                          regCom: f.regCom,
                          address: f.address,
                          documentPrefix: f.documentPrefix,
                          color: f.color,
                        }}
                      />
                      <ActiveCell entity="firme" id={f.id} active={f.active} />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Sheet>
      )}
    </section>
  );
}

/* ─────────────────────────── Parteneri ─────────────────────────── */

const PARTNER_LABEL = new Map(PARTNER_TYPES.map((t) => [t.value, t.label]));

async function ParteneriTab() {
  const rows = await db.select().from(partners).orderBy(asc(partners.name));

  return (
    <section className="space-y-3">
      <TabHead
        hint="O singură fișă pe firmă, oricâte roluri ar avea. Procentul de garanție se reține automat din situațiile subcontractantului."
        action={<PartnerForm />}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Niciun partener"
          hint="Clienții, furnizorii și subcontractanții stau în aceeași listă — se disting prin roluri, nu prin tabele."
          action={<PartnerForm />}
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Denumire</TH>
                <TH>Roluri</TH>
                <TH>CUI</TH>
                <TH>Contact</TH>
                <TH numeric>Garanție</TH>
                <TH>Stare</TH>
                <TH numeric>Acțiuni</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((p) => (
                <TR key={p.id} className={rowTone(p.active)}>
                  <TD className="font-medium">{p.name}</TD>
                  <TD>
                    <span className="flex flex-wrap gap-1">
                      {p.types.map((t) => (
                        <Badge key={t} tone="blueprint">
                          {PARTNER_LABEL.get(t) ?? t}
                        </Badge>
                      ))}
                    </span>
                  </TD>
                  <TD muted>{p.cui ?? "—"}</TD>
                  <TD muted>{p.contactName ?? p.contactEmail ?? p.contactPhone ?? "—"}</TD>
                  <TD numeric muted>
                    {p.retentionPercent ? `${Number(p.retentionPercent)}%` : "—"}
                  </TD>
                  <TD>
                    <StatusBadge active={p.active} />
                  </TD>
                  <TD numeric>
                    <div className="flex items-center justify-end gap-1">
                      <PartnerForm
                        partner={{
                          id: p.id,
                          name: p.name,
                          types: p.types,
                          cui: p.cui,
                          address: p.address,
                          contactName: p.contactName,
                          contactPhone: p.contactPhone,
                          contactEmail: p.contactEmail,
                          specialty: p.specialty,
                          retentionPercent: p.retentionPercent,
                        }}
                      />
                      <ActiveCell entity="parteneri" id={p.id} active={p.active} />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Sheet>
      )}
    </section>
  );
}

/* ──────────────────────────── Produse ──────────────────────────── */

async function ProduseTab() {
  const [rows, supplierRows] = await Promise.all([
    db
      .select({ product: products, supplier: partners })
      .from(products)
      .leftJoin(partners, eq(products.defaultSupplierId, partners.id))
      .orderBy(asc(products.code)),
    db.select().from(partners).where(eq(partners.active, true)).orderBy(asc(partners.name)),
  ]);
  const suppliers: Opt[] = supplierRows
    .filter((p) => p.types.includes("furnizor"))
    .map((p) => ({ value: p.id, label: p.name }));

  return (
    <section className="space-y-3">
      <TabHead
        hint="Stocul minim și lead time-ul sunt cele care declanșează canalul A de achiziție. Un produs fără minim nu se comandă niciodată singur."
        action={<ProductForm suppliers={suppliers} />}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Niciun produs"
          hint="Fără nomenclatorul de produse nu există recepție, consum și nici semnal de reaprovizionare."
          action={<ProductForm suppliers={suppliers} />}
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Cod</TH>
                <TH>Denumire</TH>
                <TH>Categorie</TH>
                <TH>UM</TH>
                <TH>Furnizor implicit</TH>
                <TH numeric>Ultim preț</TH>
                <TH numeric>Lead time</TH>
                <TH numeric>Min / Max</TH>
                <TH>Stare</TH>
                <TH numeric>Acțiuni</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ product: p, supplier }) => (
                <TR key={p.id} className={rowTone(p.active)}>
                  <TD className="font-medium">{p.code}</TD>
                  <TD>{p.name}</TD>
                  <TD muted>{p.category ?? "—"}</TD>
                  <TD muted>{p.unit}</TD>
                  <TD muted>{supplier?.name ?? "—"}</TD>
                  <TD numeric muted>
                    <Money value={fromDb(p.lastPrice)} unit={null} />
                  </TD>
                  <TD numeric muted>{p.leadTimeDays} z</TD>
                  <TD numeric muted>
                    {Number(p.minStock)} / {Number(p.maxStock)}
                  </TD>
                  <TD>
                    <StatusBadge active={p.active} />
                  </TD>
                  <TD numeric>
                    <div className="flex items-center justify-end gap-1">
                      <ProductForm
                        suppliers={suppliers}
                        product={{
                          id: p.id,
                          code: p.code,
                          name: p.name,
                          category: p.category,
                          unit: p.unit,
                          defaultSupplierId: p.defaultSupplierId,
                          lastPrice: p.lastPrice,
                          leadTimeDays: p.leadTimeDays,
                          minStock: p.minStock,
                          maxStock: p.maxStock,
                          tracksLots: p.tracksLots,
                        }}
                      />
                      <ActiveCell entity="produse" id={p.id} active={p.active} />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Sheet>
      )}
    </section>
  );
}

/* ───────────────────── Calificări și rate orare ───────────────────── */

async function CalificariTab() {
  const rows = await db
    .select()
    .from(laborRates)
    .orderBy(asc(laborRates.qualification), asc(laborRates.validFrom));

  return (
    <section className="space-y-3">
      <TabHead
        hint="Rata orară nu se corectează retroactiv: o schimbare de salariu se scrie ca rând nou, cu altă dată de început. Pontajul vechi rămâne pe rata veche."
        action={<LaborRateForm />}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Nicio calificare"
          hint="Fără rată orară, pontajul nu produce cost și manopera din deviz nu are cu ce se compara."
          action={<LaborRateForm />}
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Calificare</TH>
                <TH numeric>Cost orar</TH>
                <TH>Valabil de la</TH>
                <TH>Până la</TH>
                <TH>Stare</TH>
                <TH numeric>Acțiuni</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id} className={rowTone(r.active)}>
                  <TD className="font-medium">{r.qualification}</TD>
                  <TD numeric>
                    <Money value={fromDb(r.hourlyCost)} unit={null} />
                  </TD>
                  <TD muted>{r.validFrom}</TD>
                  <TD muted>{r.validTo ?? "în vigoare"}</TD>
                  <TD>
                    <StatusBadge active={r.active} />
                  </TD>
                  <TD numeric>
                    <div className="flex items-center justify-end gap-1">
                      <LaborRateForm
                        rate={{
                          id: r.id,
                          qualification: r.qualification,
                          hourlyCost: r.hourlyCost,
                          validFrom: r.validFrom,
                          validTo: r.validTo,
                        }}
                      />
                      <ActiveCell entity="calificari" id={r.id} active={r.active} />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Sheet>
      )}
    </section>
  );
}

/* ─────────────────── Catalogul de operațiuni ─────────────────── */

async function OperatiuniTab() {
  const [rows, materialRows] = await Promise.all([
    db.select().from(operationCatalog).orderBy(asc(operationCatalog.code)),
    db
      .select({
        operationId: operationCatalogMaterials.operationId,
        quantity: operationCatalogMaterials.quantity,
        code: products.code,
      })
      .from(operationCatalogMaterials)
      .leftJoin(products, eq(operationCatalogMaterials.productId, products.id)),
  ]);

  const byOperation = new Map<string, { code: string; quantity: number }[]>();
  for (const m of materialRows) {
    const list = byOperation.get(m.operationId) ?? [];
    list.push({ code: m.code ?? "?", quantity: Number(m.quantity) });
    byOperation.set(m.operationId, list);
  }

  return (
    <section className="space-y-3">
      <TabHead
        hint="Sursa rutării din §7. Norma de timp și normele de material sunt cele care spun dacă o cerere e mentenanță curentă sau lucrare separată."
        action={<OperationForm />}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Catalog gol"
          hint="Fără operațiuni normate, fiecare cerere din teren trebuie apreciată din burtă."
          action={<OperationForm />}
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Cod</TH>
                <TH>Denumire</TH>
                <TH>Categorie</TH>
                <TH>UM</TH>
                <TH numeric>Normă (ore)</TH>
                <TH>Calificare</TH>
                <TH numeric>Cost estimat</TH>
                <TH numeric>Materiale</TH>
                <TH>Stare</TH>
                <TH numeric>Acțiuni</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((o) => {
                const materials = byOperation.get(o.id) ?? [];
                return (
                  <TR key={o.id} className={rowTone(o.active)}>
                    <TD className="font-medium">{o.code}</TD>
                    <TD>{o.name}</TD>
                    <TD muted>{o.category ?? "—"}</TD>
                    <TD muted>{o.unit}</TD>
                    <TD numeric muted>{Number(o.standardHours)}</TD>
                    <TD muted>{o.qualification ?? "—"}</TD>
                    <TD numeric muted>
                      <Money value={fromDb(o.estimatedCost)} unit={null} />
                    </TD>
                    <TD numeric muted>{materials.length || "—"}</TD>
                    <TD>
                      <StatusBadge active={o.active} />
                    </TD>
                    <TD numeric>
                      <div className="flex items-center justify-end gap-1">
                        <OperationForm
                          operation={{
                            id: o.id,
                            code: o.code,
                            name: o.name,
                            category: o.category,
                            unit: o.unit,
                            standardHours: o.standardHours,
                            qualification: o.qualification,
                            estimatedCost: o.estimatedCost,
                            materials: formatOperationMaterials(materials),
                          }}
                        />
                        <ActiveCell entity="operatiuni" id={o.id} active={o.active} />
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Sheet>
      )}
    </section>
  );
}

/* ───────────────────── Puncte de verificare ───────────────────── */

/** Nomenclatorul de tipuri e cel de la tichete — nu construim al doilea. */
async function inspectionTypeOptions(): Promise<Opt[]> {
  const rows = await db
    .select({ id: ticketTypes.id, name: ticketTypes.name })
    .from(ticketTypes)
    .where(eq(ticketTypes.active, true))
    .orderBy(asc(ticketTypes.position));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

async function objectiveKindOptions(): Promise<Opt[]> {
  const rows = await db
    .selectDistinct({ kind: objectives.kind })
    .from(objectives)
    .orderBy(asc(objectives.kind));
  return rows.map((k) => ({ value: k.kind, label: k.kind }));
}

async function PuncteTab() {
  const [rows, types, kinds] = await Promise.all([
    db
      .select({ point: inspectionChecks, type: ticketTypes })
      .from(inspectionChecks)
      .leftJoin(ticketTypes, eq(inspectionChecks.ticketTypeId, ticketTypes.id))
      .orderBy(asc(inspectionChecks.code)),
    inspectionTypeOptions(),
    objectiveKindOptions(),
  ]);

  return (
    <section className="space-y-3">
      <TabHead
        hint="Punctul se definește o dată și intră în oricâte liste. De-aia se poate răspunde la „la câte obiective a picat verificarea acumulatorilor” — altfel același punct e scris diferit în zece liste."
        action={<InspectionCheckForm ticketTypes={types} objectiveKinds={kinds} />}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Niciun punct de verificare"
          hint="Fără puncte, listele de inspecție rămân text liber și nu iese acoperire măsurabilă."
          action={<InspectionCheckForm ticketTypes={types} objectiveKinds={kinds} />}
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Cod</TH>
                <TH>Denumire</TH>
                <TH>Tip de inspecție</TH>
                <TH>Tip de obiectiv</TH>
                <TH>Cere</TH>
                <TH>Stare</TH>
                <TH numeric>Acțiuni</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ point, type }) => (
                <TR key={point.id} className={rowTone(point.active)}>
                  <TD className="font-medium">{point.code}</TD>
                  <TD>{point.name}</TD>
                  <TD muted>{type?.name ?? "orice tip"}</TD>
                  <TD muted>{point.objectiveKind ?? "orice tip"}</TD>
                  <TD muted>{describeDemands(point.requiresPhoto, point.requiresValue, point.valueUnit)}</TD>
                  <TD>
                    <StatusBadge active={point.active} />
                  </TD>
                  <TD numeric>
                    <div className="flex items-center justify-end gap-1">
                      <InspectionCheckForm
                        ticketTypes={types}
                        objectiveKinds={kinds}
                        point={{
                          id: point.id,
                          code: point.code,
                          name: point.name,
                          ticketTypeId: point.ticketTypeId,
                          objectiveKind: point.objectiveKind,
                          guidance: point.guidance,
                          requiresPhoto: point.requiresPhoto,
                          requiresValue: point.requiresValue,
                          valueUnit: point.valueUnit,
                        }}
                      />
                      <ActiveCell entity="puncte" id={point.id} active={point.active} />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Sheet>
      )}
    </section>
  );
}

function describeDemands(photo: boolean, value: boolean, unit: string | null): string {
  const parts: string[] = [];
  if (photo) parts.push("poză");
  if (value) parts.push(unit ? "valoare (" + unit + ")" : "valoare");
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/* ───────────────────── Liste de inspecție ───────────────────── */

async function ChecklistTab() {
  const [rows, itemRows, kindRows, types, catalog] = await Promise.all([
    db
      .select({ t: checklistTemplates, type: ticketTypes })
      .from(checklistTemplates)
      .leftJoin(ticketTypes, eq(checklistTemplates.ticketTypeId, ticketTypes.id))
      .orderBy(asc(checklistTemplates.name)),
    db.select().from(checklistItems).orderBy(asc(checklistItems.position)),
    db.selectDistinct({ kind: objectives.kind }).from(objectives).orderBy(asc(objectives.kind)),
    inspectionTypeOptions(),
    db.select({ id: inspectionChecks.id, code: inspectionChecks.code }).from(inspectionChecks),
  ]);

  const byTemplate = new Map<string, { section: string | null; text: string }[]>();
  const codeByCheck = new Map(catalog.map((c) => [c.id, c.code] as const));
  for (const item of itemRows) {
    const list = byTemplate.get(item.templateId) ?? [];
    // Înapoi în text: punctul legat se re-scrie ca ce a fost tastat — codul lui.
    list.push({
      section: item.section,
      text: (item.checkId ? codeByCheck.get(item.checkId) : null) ?? item.text,
    });
    byTemplate.set(item.templateId, list);
  }
  const objectiveKinds: Opt[] = kindRows.map((k) => ({ value: k.kind, label: k.kind }));

  return (
    <section className="space-y-3">
      <TabHead
        hint="Un punct NOK din fișă trebuie să aibă mereu o ieșire — rezolvat pe loc, intervenție sau propunere. De aceea contează ce scrie exact în punct."
        action={<ChecklistForm ticketTypes={types} objectiveKinds={objectiveKinds} />}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Nicio listă de inspecție"
          hint="Inspecția fără listă devine text liber, iar din text liber nu iese acoperire măsurabilă."
          action={<ChecklistForm ticketTypes={types} objectiveKinds={objectiveKinds} />}
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Denumire</TH>
                <TH>Tip de obiectiv</TH>
                <TH>Tip de inspecție</TH>
                <TH numeric>Puncte</TH>
                <TH>Stare</TH>
                <TH numeric>Acțiuni</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ t, type }) => {
                const items = byTemplate.get(t.id) ?? [];
                return (
                  <TR key={t.id} className={rowTone(t.active)}>
                    <TD className="font-medium">{t.name}</TD>
                    <TD muted>{t.objectiveKind ?? "orice tip"}</TD>
                    <TD muted>{type?.name ?? t.discipline ?? "—"}</TD>
                    <TD numeric muted>{items.length}</TD>
                    <TD>
                      <StatusBadge active={t.active} />
                    </TD>
                    <TD numeric>
                      <div className="flex items-center justify-end gap-1">
                        <ChecklistForm
                          ticketTypes={types}
                          objectiveKinds={objectiveKinds}
                          template={{
                            id: t.id,
                            name: t.name,
                            objectiveKind: t.objectiveKind,
                            ticketTypeId: t.ticketTypeId,
                            discipline: t.discipline,
                            items: formatChecklistItems(items),
                          }}
                        />
                        <ActiveCell entity="checklist" id={t.id} active={t.active} />
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Sheet>
      )}
    </section>
  );
}

/* ───────────────────────── Utilizatori ───────────────────────── */

async function UtilizatoriTab() {
  const [rows, firmRows] = await Promise.all([
    db
      .select({ user: users, firm: firms })
      .from(users)
      .leftJoin(firms, eq(users.firmId, firms.id))
      .orderBy(asc(users.name)),
    db.select().from(firms).orderBy(asc(firms.name)),
  ]);
  const firmOptions: Opt[] = firmRows.map((f) => ({ value: f.id, label: f.name }));

  return (
    <section className="space-y-3">
      <TabHead
        hint="Rolul decide tot ce vede omul. Șeful de șantier nu vede lei nicăieri — nu e o setare pe utilizator, e rolul însuși."
        action={<UserForm firms={firmOptions} />}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Niciun utilizator"
          hint="Fără utilizatori nu are cine ponta, cine aproba și cine semna."
          action={<UserForm firms={firmOptions} />}
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Nume</TH>
                <TH>E-mail</TH>
                <TH>Rol</TH>
                <TH>Firmă</TH>
                <TH>Calificare</TH>
                <TH>Stare</TH>
                <TH numeric>Acțiuni</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ user: u, firm }) => (
                <TR key={u.id} className={rowTone(u.active)}>
                  <TD className="font-medium">{u.name}</TD>
                  <TD muted>{u.email}</TD>
                  <TD>
                    <Badge tone="blueprint">{ROLE_LABELS[u.role as Role] ?? u.role}</Badge>
                  </TD>
                  <TD muted>{firm?.name ?? "—"}</TD>
                  <TD muted>{u.qualification ?? "—"}</TD>
                  <TD>
                    <StatusBadge active={u.active} />
                  </TD>
                  <TD numeric>
                    <div className="flex items-center justify-end gap-1">
                      <UserForm
                        firms={firmOptions}
                        user={{
                          id: u.id,
                          name: u.name,
                          email: u.email,
                          role: u.role as Role,
                          firmId: u.firmId,
                          qualification: u.qualification,
                        }}
                      />
                      <ActiveCell entity="utilizatori" id={u.id} active={u.active} />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Sheet>
      )}
    </section>
  );
}

/* ───────────────────────── Preț motorină ───────────────────────── */

async function MotorinaTab() {
  const rows = await db.select().from(fuelPrices).orderBy(asc(fuelPrices.day));
  const ordered = [...rows].reverse();

  return (
    <section className="space-y-3">
      <TabHead
        hint="Un preț pe lună. Alimentările dintr-o lună se evaluează la prețul lunii — de aceea nu se șterge niciun rând vechi: ar rescrie costuri deja raportate."
        action={<FuelPriceForm />}
      />
      {ordered.length === 0 ? (
        <EmptyState
          title="Niciun preț de motorină"
          hint="Fără preț, litrii din bonul de alimentare rămân litri și nu ajung niciodată în registrul de cost."
          action={<FuelPriceForm />}
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Luna</TH>
                <TH numeric>Preț / litru</TH>
                <TH>Sursă</TH>
                <TH numeric>Acțiuni</TH>
              </TR>
            </THead>
            <TBody>
              {ordered.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium">{monthLabel(p.day)}</TD>
                  <TD numeric>
                    <Money value={fromDb(p.pricePerLiter)} unit={null} />
                  </TD>
                  <TD>
                    <Badge tone={p.manualOverride ? "warn" : "neutral"}>
                      {p.manualOverride ? "Manual" : "Implicit"}
                    </Badge>
                  </TD>
                  <TD numeric>
                    <div className="flex items-center justify-end gap-1">
                      <FuelPriceForm
                        price={{
                          day: p.day,
                          pricePerLiter: p.pricePerLiter,
                          manualOverride: p.manualOverride,
                        }}
                      />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Sheet>
      )}
    </section>
  );
}

/* ───────────────────────── Șabloane de PV ───────────────────────── */

const PV_KIND_LABEL = new Map(PV_KINDS.map((k) => [k.value, k.label]));

async function PvTab() {
  const rows = await db.select().from(pvTemplates).orderBy(asc(pvTemplates.name));

  return (
    <section className="space-y-3">
      <TabHead
        hint="Șablonul ține tipul și PDF-ul. Poziționarea câmpurilor pe pagină se face în editorul de șabloane, procentual — nu în puncte fixe."
        action={<PvTemplateForm />}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Niciun șablon de PV"
          hint="Fără șablon, un proces-verbal de predare-primire se scrie de mână de fiecare dată."
          action={<PvTemplateForm />}
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Denumire</TH>
                <TH>Tip</TH>
                <TH numeric>Câmpuri poziționate</TH>
                <TH>PDF</TH>
                <TH>Stare</TH>
                <TH numeric>Acțiuni</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((t) => (
                <TR key={t.id} className={rowTone(t.active)}>
                  <TD className="font-medium">{t.name}</TD>
                  <TD muted>{PV_KIND_LABEL.get(t.kind) ?? t.kind}</TD>
                  <TD numeric muted>
                    {Array.isArray(t.fields) ? t.fields.length : 0}
                  </TD>
                  <TD muted>{t.storageKey ? "încărcat" : "lipsă"}</TD>
                  <TD>
                    <StatusBadge active={t.active} />
                  </TD>
                  <TD numeric>
                    <div className="flex items-center justify-end gap-1">
                      <PvTemplateForm
                        template={{
                          id: t.id,
                          name: t.name,
                          kind: t.kind,
                          storageKey: t.storageKey,
                        }}
                      />
                      <ActiveCell entity="pv" id={t.id} active={t.active} />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Sheet>
      )}
    </section>
  );
}
