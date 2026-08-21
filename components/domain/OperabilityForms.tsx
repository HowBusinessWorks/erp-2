"use client";

import {
  createFolder,
  createManualCost,
  createRequest,
  createTransport,
  createWorkUnitDirect,
  saveEquipment,
  saveStage,
  saveTool,
  saveWarehouse,
  uploadFile,
} from "@/app/actions/operability";
import { Field, FormModal } from "@/components/ui/form";
import {
  COST_TYPES,
  EQUIPMENT_CATEGORIES,
  REQUEST_KINDS,
  REQUEST_SOURCES,
  TRANSPORT_KINDS,
  WAREHOUSE_KINDS,
  WORK_UNIT_KINDS,
  validateEquipment,
  validateFolder,
  validateManualCost,
  validateRequest,
  validateStage,
  validateTool,
  validateTransport,
  validateWarehouse,
  validateWorkUnit,
} from "@/lib/operability-types";

/**
 * Formularele blocului E, §9.4–§9.10. Toate pe `FormModal` — principiul 2 din §9.0:
 * un singur formular, refolosit. Fiecare stă pe ecranul de unde începe fluxul lui.
 */

export type Opt = { value: string; label: string };

function options(list: readonly { value: string; label: string }[]): Opt[] {
  return list.map((o) => ({ value: o.value, label: o.label }));
}

/* ═══════════════ §9.4 Cererea din birou ═══════════════ */

export function RequestForm({
  objectives,
  contracts,
  firms,
}: {
  objectives: Opt[];
  contracts: Opt[];
  firms: Opt[];
}) {
  return (
    <FormModal
      label="＋ Cerere"
      variant="primary"
      size="sm"
      width="md"
      title="Cerere nouă"
      subtitle="Clientul a sunat la birou. De aici încolo urmează exact aceeași rutare ca o cerere venită din teren."
      action={createRequest}
      validate={validateRequest}
      submitLabel="Înregistrează și rutează"
    >
      <Field name="title" label="Ce cere" required full placeholder="Scurgere la caminul C4" />
      <Field name="kind" label="Tip" kind="select" required options={options(REQUEST_KINDS)} />
      <Field name="source" label="Cum a intrat" kind="select" options={options(REQUEST_SOURCES)} />
      <Field name="objectiveId" label="Obiectiv" kind="select" required full options={objectives} />
      <Field name="contractId" label="Contract" kind="select">
        <option value="">— se decide la rutare —</option>
        {contracts.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Field>
      <Field name="firmId" label="Firma" kind="select">
        <option value="">— nealocată —</option>
        {firms.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </Field>
      <Field
        name="estimatedValue"
        label="Valoare estimată (lei)"
        kind="money"
        hint="pragul de mentenanță se compară cu ea"
      />
      <Field
        name="expiresAt"
        label="Expiră la"
        kind="date"
        hint="obligatoriu la propuneri — altfel backlogul Delta se umple"
      />
      <Field name="description" label="Detalii" kind="textarea" rows={3} full />
    </FormModal>
  );
}

/* ═══════════════ §9.5 Unitate de lucru și etape ═══════════════ */

export function WorkUnitForm({
  firms,
  objectives,
  users,
  contracts,
  components,
  subcontractors,
}: {
  firms: Opt[];
  objectives: Opt[];
  users: Opt[];
  contracts: Opt[];
  /** componentele tuturor contractelor, etichetate cu contractul lor */
  components: Opt[];
  subcontractors: Opt[];
}) {
  return (
    <FormModal
      label="＋ Unitate de lucru"
      variant="primary"
      size="sm"
      width="lg"
      title="Unitate de lucru nouă"
      subtitle="Nu tot ce se lucrează trece printr-o cerere. Finanțarea e o legătură, nu un câmp: alegerea de mai jos creează o alocare."
      action={createWorkUnitDirect}
      validate={validateWorkUnit}
      submitLabel="Deschide unitatea"
    >
      <Field name="title" label="Denumire" required full />
      <Field name="kind" label="Tip" kind="select" required options={options(WORK_UNIT_KINDS)} />
      <Field name="firmId" label="Firma executantă" kind="select" required options={firms} />
      <Field name="objectiveId" label="Obiectiv" kind="select" required full options={objectives} />
      <Field name="responsibleId" label="Responsabil" kind="select">
        <option value="">— nealocat —</option>
        {users.map((u) => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
      </Field>
      <Field
        name="executant"
        label="Executant"
        kind="select"
        options={[
          { value: "propriu", label: "Cu forțe proprii" },
          { value: "subcontractant", label: "Subcontractant" },
        ]}
      />
      <Field name="subcontractorId" label="Subcontractant" kind="select">
        <option value="">— niciunul —</option>
        {subcontractors.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Field>
      <Field
        name="status"
        label="Stare"
        kind="select"
        defaultValue="planificata"
        options={[
          { value: "planificata", label: "Planificată" },
          { value: "propusa", label: "Propusă" },
          { value: "in_lucru", label: "În lucru" },
        ]}
      />
      <Field name="startDate" label="Început" kind="date" />
      <Field name="endDate" label="Sfârșit" kind="date" />
      <Field name="estimatedValue" label="Valoare estimată (lei)" kind="money" />
      <Field name="budgetCost" label="Buget de cost (lei)" kind="money" />

      <div className="mt-1 border-t border-rule pt-2 sm:col-span-2">
        <p className="eyebrow mb-2">Finanțare — luna se ia din data de început</p>
      </div>
      <Field name="fundingContractId" label="Contract" kind="select">
        <option value="">— nefinanțată deocamdată —</option>
        {contracts.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Field>
      <Field name="fundingComponentId" label="Componentă" kind="select">
        <option value="">— niciuna —</option>
        {components.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Field>
      <Field name="fundingValue" label="Sumă alocată (lei)" kind="money" />
      <Field name="fundingReason" label="Motivul alocării" />
      <Field name="description" label="Descriere" kind="textarea" rows={2} full />
    </FormModal>
  );
}

export type StageValues = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  materialBudget: string;
  laborBudget: string;
  percentOfWork: string;
};

export function StageForm({
  workUnitId,
  stage,
}: {
  workUnitId: string;
  /** sumele vin deja în lei: conversia din bani se face pe server, nu aici */
  stage?: StageValues;
}) {
  const editing = Boolean(stage);
  return (
    <FormModal
      label={editing ? "Editează" : "＋ Etapă"}
      variant={editing ? "quiet" : "primary"}
      size="sm"
      title={editing ? `Etapa „${stage!.name}”` : "Etapă nouă"}
      subtitle="Graficul de execuție se desenează din etape. O lucrare fără etape are Gantt gol."
      action={saveStage}
      validate={validateStage}
    >
      <input type="hidden" name="workUnitId" value={workUnitId} />
      {stage ? <input type="hidden" name="id" value={stage.id} /> : null}
      <Field name="name" label="Denumire" required full defaultValue={stage?.name} />
      <Field name="startDate" label="Început" kind="date" defaultValue={stage?.startDate} />
      <Field name="endDate" label="Sfârșit" kind="date" defaultValue={stage?.endDate} />
      <Field
        name="materialBudget"
        label="Buget materiale (lei)"
        kind="money"
        defaultValue={stage?.materialBudget}
      />
      <Field
        name="laborBudget"
        label="Buget manoperă (lei)"
        kind="money"
        defaultValue={stage?.laborBudget}
      />
      <Field
        name="percentOfWork"
        label="Pondere din lucrare (%)"
        kind="number"
        step="0.01"
        full
        defaultValue={stage?.percentOfWork}
        hint="cât din valoarea lucrării acoperă etapa"
      />
    </FormModal>
  );
}

/* ═══════════════ §9.7 Resurse ═══════════════ */

export type EquipmentValues = {
  id: string;
  code: string;
  name: string;
  category: string;
  firmId: string | null;
  status: string;
  internalHourlyRate: string;
  isRented: boolean;
  dailyRentCost: string;
  hourMeter: string;
  km: string;
  itpExpiry: string | null;
  rcaExpiry: string | null;
  iscirExpiry: string | null;
  nextServiceDate: string | null;
  nextServiceHours: string | null;
  activities: string[];
  accessories: string[];
};

export function EquipmentForm({
  equipment,
  firms,
  activities,
}: {
  /** sumele vin deja în lei — conversia din bani se face pe server */
  equipment?: EquipmentValues;
  firms: Opt[];
  activities: string[];
}) {
  const editing = Boolean(equipment);
  return (
    <FormModal
      label={editing ? "Editează" : "＋ Utilaj"}
      variant={editing ? "default" : "primary"}
      size="sm"
      width="lg"
      title={editing ? `Utilajul ${equipment!.code}` : "Utilaj nou"}
      subtitle="Revizia se calculează pe DATĂ și pe ORE. Un utilaj introdus fără ora următoarei revizii nu declanșează niciodată revizia."
      action={saveEquipment}
      validate={validateEquipment}
    >
      {equipment ? <input type="hidden" name="id" value={equipment.id} /> : null}
      <Field name="code" label="Cod" required defaultValue={equipment?.code} />
      <Field name="name" label="Denumire" required defaultValue={equipment?.name} />
      <Field
        name="category"
        label="Categorie"
        kind="select"
        required
        defaultValue={equipment?.category}
        options={EQUIPMENT_CATEGORIES.map((c) => ({ value: c, label: c }))}
      />
      <Field name="firmId" label="Firma" kind="select" defaultValue={equipment?.firmId ?? ""}>
        <option value="">— nealocat —</option>
        {firms.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </Field>
      <Field
        name="status"
        label="Stare"
        kind="select"
        defaultValue={equipment?.status ?? "disponibil"}
        options={[
          { value: "disponibil", label: "Disponibil" },
          { value: "service", label: "În service" },
          { value: "indisponibil", label: "Indisponibil" },
          { value: "casat", label: "Casat" },
        ]}
      />
      <Field
        name="internalHourlyRate"
        label="Tarif orar intern (lei)"
        kind="money"
        defaultValue={equipment?.internalHourlyRate}
        hint="amortizare + reparații + asigurări / ore anuale"
      />
      <Field name="isRented" label="Utilaj închiriat" kind="checkbox" defaultChecked={equipment?.isRented} />
      <Field
        name="dailyRentCost"
        label="Chirie pe zi (lei)"
        kind="money"
        defaultValue={equipment?.dailyRentCost}
      />

      <div className="mt-1 border-t border-rule pt-2 sm:col-span-2">
        <p className="eyebrow mb-2">Contoare și scadențe</p>
      </div>
      <Field name="hourMeter" label="Contor ore" kind="number" step="0.1" defaultValue={equipment?.hourMeter} />
      <Field name="km" label="Kilometraj" kind="number" step="1" defaultValue={equipment?.km} />
      <Field
        name="nextServiceDate"
        label="Următoarea revizie — data"
        kind="date"
        defaultValue={equipment?.nextServiceDate}
      />
      <Field
        name="nextServiceHours"
        label="Următoarea revizie — ora contorului"
        kind="number"
        step="1"
        defaultValue={equipment?.nextServiceHours}
        hint="fără ea, revizia se declanșează doar calendaristic"
      />
      <Field name="itpExpiry" label="ITP până la" kind="date" defaultValue={equipment?.itpExpiry} />
      <Field name="rcaExpiry" label="RCA până la" kind="date" defaultValue={equipment?.rcaExpiry} />
      <Field name="iscirExpiry" label="ISCIR până la" kind="date" defaultValue={equipment?.iscirExpiry} />
      <Field
        name="accessories"
        label="Accesorii"
        defaultValue={equipment?.accessories.join(", ")}
        hint="separate prin virgulă"
      />

      <div className="sm:col-span-2">
        <span className="eyebrow mb-1 block">Ce activități poate face</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {activities.map((a) => (
            <label key={a} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="activities"
                value={a}
                defaultChecked={equipment?.activities.includes(a)}
                className="size-4 accent-blueprint"
              />
              <span className="text-tiny text-ink">{a}</span>
            </label>
          ))}
        </div>
        <span className="mt-1 block text-micro text-ink-3">
          Pe ele se sprijină filtrul din solicitarea de utilaj.
        </span>
      </div>
    </FormModal>
  );
}

export type ToolValues = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  firmId: string | null;
  status: string;
  warehouseId: string | null;
  holderUserId: string | null;
  holderPartnerId: string | null;
  purchaseValue: string;
};

export function ToolForm({
  tool,
  firms,
  warehouses,
  users,
  partners,
}: {
  /** sumele vin deja în lei — conversia din bani se face pe server */
  tool?: ToolValues;
  firms: Opt[];
  warehouses: Opt[];
  users: Opt[];
  partners: Opt[];
}) {
  const editing = Boolean(tool);
  return (
    <FormModal
      label={editing ? "Editează" : "＋ Unealtă"}
      variant={editing ? "quiet" : "primary"}
      size="sm"
      title={editing ? `Unealta ${tool!.code}` : "Unealtă nouă"}
      action={saveTool}
      validate={validateTool}
    >
      {tool ? <input type="hidden" name="id" value={tool.id} /> : null}
      <Field name="code" label="Cod" required defaultValue={tool?.code} />
      <Field name="name" label="Denumire" required defaultValue={tool?.name} />
      <Field name="category" label="Categorie" defaultValue={tool?.category} />
      <Field
        name="status"
        label="Stare"
        kind="select"
        defaultValue={tool?.status ?? "activ"}
        options={[
          { value: "activ", label: "Activă" },
          { value: "la_reparatii", label: "La reparații" },
          { value: "casat", label: "Casată" },
          { value: "pierdut", label: "Pierdută" },
        ]}
      />
      <Field name="firmId" label="Firma" kind="select" defaultValue={tool?.firmId ?? ""}>
        <option value="">— nealocată —</option>
        {firms.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </Field>
      <Field name="warehouseId" label="Gestiune" kind="select" defaultValue={tool?.warehouseId ?? ""}>
        <option value="">— niciuna —</option>
        {warehouses.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </Field>
      <Field name="holderUserId" label="La cine e (angajat)" kind="select" defaultValue={tool?.holderUserId ?? ""}>
        <option value="">— în magazie —</option>
        {users.map((u) => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
      </Field>
      <Field
        name="holderPartnerId"
        label="La cine e (partener)"
        kind="select"
        defaultValue={tool?.holderPartnerId ?? ""}
      >
        <option value="">— niciunul —</option>
        {partners.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Field>
      <Field
        name="purchaseValue"
        label="Valoare de achiziție (lei)"
        kind="money"
        full
        defaultValue={tool?.purchaseValue}
      />
    </FormModal>
  );
}

export function TransportForm({
  objectives,
  workUnits,
}: {
  objectives: Opt[];
  workUnits: Opt[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <FormModal
      label="＋ Transport"
      variant="primary"
      size="sm"
      width="md"
      title="Transport cerut de la birou"
      subtitle="Coada de transporturi se umple azi doar automat, din comenzi și rezervări. Ăsta e drumul manual."
      action={createTransport}
      validate={validateTransport}
      submitLabel="Cere transportul"
    >
      <Field name="kind" label="Tip" kind="select" required options={options(TRANSPORT_KINDS)} />
      <Field name="day" label="Ziua" kind="date" required defaultValue={today} />
      <Field name="fromObjectiveId" label="De la obiectivul" kind="select">
        <option value="">— altundeva —</option>
        {objectives.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Field>
      <Field name="toObjectiveId" label="La obiectivul" kind="select">
        <option value="">— altundeva —</option>
        {objectives.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Field>
      <Field name="fromText" label="De la (text liber)" placeholder="Depozit central" />
      <Field name="toText" label="Până la (text liber)" />
      <Field name="workUnitId" label="Pe lucrarea" kind="select" full>
        <option value="">— niciuna —</option>
        {workUnits.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </Field>
      <Field name="cost" label="Cost estimat (lei)" kind="money" />
      <Field name="description" label="Ce se transportă" kind="textarea" rows={2} full />
    </FormModal>
  );
}

/* ═══════════════ §9.8 Gestiune nouă ═══════════════ */

export function WarehouseForm({
  firms,
  workUnits,
  partners,
  users,
}: {
  firms: Opt[];
  workUnits: Opt[];
  partners: Opt[];
  users: Opt[];
}) {
  return (
    <FormModal
      label="＋ Gestiune"
      variant="default"
      size="sm"
      width="md"
      title="Gestiune nouă"
      subtitle="Fără o gestiune, un șantier nou n-are unde primi marfă."
      action={saveWarehouse}
      validate={validateWarehouse}
    >
      <Field name="code" label="Cod" required placeholder="SNT-12" />
      <Field name="name" label="Denumire" required />
      <Field name="firmId" label="Firma" kind="select" required options={firms} />
      <Field name="kind" label="Tip" kind="select" required options={options(WAREHOUSE_KINDS)} />
      <Field name="workUnitId" label="Lucrarea (la gestiune de șantier)" kind="select" full>
        <option value="">— niciuna —</option>
        {workUnits.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </Field>
      <Field name="partnerId" label="Partenerul (la consignație)" kind="select">
        <option value="">— niciunul —</option>
        {partners.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Field>
      <Field name="keeperId" label="Gestionar" kind="select">
        <option value="">— nealocat —</option>
        {users.map((u) => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
      </Field>
    </FormModal>
  );
}

/* ═══════════════ §9.9 Documente ═══════════════ */

export function FolderForm({ parentId, parentName }: { parentId?: string; parentName?: string }) {
  return (
    <FormModal
      label="＋ Folder"
      variant="default"
      size="sm"
      width="sm"
      columns={1}
      title="Folder nou"
      subtitle={parentName ? `Se creează în „${parentName}”.` : "Se creează în rădăcina arborelui."}
      action={createFolder}
      validate={validateFolder}
    >
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      <Field name="name" label="Nume" required />
    </FormModal>
  );
}

export function UploadForm({
  parentId,
  parentName,
  workUnitId,
}: {
  parentId?: string;
  parentName?: string;
  workUnitId?: string;
}) {
  return (
    <FormModal
      label="＋ Fișier"
      variant="primary"
      size="sm"
      width="sm"
      columns={1}
      title="Încarcă un fișier"
      subtitle={
        parentName
          ? `Ajunge în „${parentName}”. Versiunile nu se suprascriu niciodată.`
          : "Ajunge în rădăcină. Versiunile nu se suprascriu niciodată."
      }
      action={uploadFile}
      submitLabel="Încarcă"
    >
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      {workUnitId ? <input type="hidden" name="workUnitId" value={workUnitId} /> : null}
      <label className="block">
        <span className="eyebrow mb-1 block">
          Fișier<span className="text-over"> •</span>
        </span>
        <input
          type="file"
          name="file"
          required
          className="w-full border border-rule-strong bg-sheet px-2.5 py-1.5 text-[0.8125rem] text-ink file:mr-3 file:border-0 file:bg-sunk file:px-2 file:py-1 file:text-tiny file:text-ink-2"
        />
        <span className="mt-1 block text-micro text-ink-3">
          Maximum 25 MB, într-o singură bucată.
        </span>
      </label>
      <Field name="name" label="Nume în arbore" hint="gol = numele fișierului" />
      <Field
        name="phase"
        label="Faza"
        kind="select"
        options={[
          { value: "", label: "— fără —" },
          { value: "inainte", label: "Înainte" },
          { value: "dupa", label: "După" },
        ]}
      />
    </FormModal>
  );
}

/* ═══════════════ §9.10 Costul introdus manual ═══════════════ */

export function ManualCostForm({
  firms,
  contracts,
  components,
  objectives,
  workUnits,
  suppliers,
}: {
  firms: Opt[];
  contracts: Opt[];
  components: Opt[];
  objectives: Opt[];
  workUnits: Opt[];
  suppliers: Opt[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <FormModal
      label="＋ Cost"
      variant="primary"
      size="sm"
      width="lg"
      title="Cost introdus manual"
      subtitle="Factura care nu vine printr-o recepție: chirii, utilități, servicii. Intră în registru prin aceeași poartă ca restul — o lună închisă e refuzată."
      action={createManualCost}
      validate={validateManualCost}
      submitLabel="Înregistrează costul"
    >
      <Field name="firmId" label="Firma" kind="select" required options={firms} />
      <Field name="costType" label="Fel de cost" kind="select" required options={options(COST_TYPES)} />
      <Field name="documentDate" label="Data documentului" kind="date" required defaultValue={today} />
      <Field
        name="effectDate"
        label="Luna de raportare"
        kind="date"
        defaultValue={today}
        hint="implicit = data documentului"
      />
      <Field name="value" label="Valoare (lei)" kind="money" required />
      <Field name="supplierId" label="Furnizor" kind="select">
        <option value="">— niciunul —</option>
        {suppliers.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Field>

      <div className="mt-1 border-t border-rule pt-2 sm:col-span-2">
        <p className="eyebrow mb-2">Unde s-a folosit</p>
      </div>
      <Field name="objectiveId" label="Obiectiv" kind="select">
        <option value="">— niciunul —</option>
        {objectives.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Field>
      <Field name="workUnitId" label="Unitate de lucru" kind="select">
        <option value="">— niciuna —</option>
        {workUnits.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </Field>
      <Field name="usedContractId" label="Contract folosit" kind="select">
        <option value="">— niciunul —</option>
        {contracts.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Field>
      <Field name="usedComponentId" label="Componentă folosită" kind="select">
        <option value="">— niciuna —</option>
        {components.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Field>

      <div className="mt-1 border-t border-rule pt-2 sm:col-span-2">
        <p className="eyebrow mb-2">Cine plătește</p>
      </div>
      <Field name="chargedContractId" label="Contract descărcat" kind="select">
        <option value="">— ca la „folosit” —</option>
        {contracts.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Field>
      <Field name="chargedComponentId" label="Componentă descărcată" kind="select">
        <option value="">— ca la „folosit” —</option>
        {components.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Field>
      <Field
        name="splitReason"
        label="Motivul, când plătește altcineva"
        full
        hint="obligatoriu când componenta descărcată diferă de cea unde s-a folosit"
      />
      <Field name="note" label="Observație" kind="textarea" rows={2} full />
    </FormModal>
  );
}
