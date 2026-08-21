"use client";

import {
  addContractYear,
  linkObjective,
  saveComponentBudget,
  unlinkObjective,
  updateContract,
} from "@/app/actions/contracts";
import { Field, FormModal } from "@/components/ui/form";
import { Button } from "@/components/ui/primitives";
import {
  CONTRACT_KINDS,
  validateContract,
  validateContractObjective,
  validateContractYear,
} from "@/lib/contracts-types";
import { fromDb } from "@/lib/money";

export type Opt = { value: string; label: string };

export type ContractValues = {
  id: string;
  code: string;
  name: string;
  firmId: string;
  clientId: string;
  ownerId: string | null;
  kind: string;
  startDate: string;
  endDate: string;
  totalValue: string;
  monthlyValue: string;
  paymentDays: number;
  indexationPercent: string;
  maintenanceThreshold: string;
  expiryAlertMonths: number;
};

/** Banii vin din DB ca `numeric`; formularul îi vrea în lei, cu virgulă. */
function lei(value: string): string {
  return (fromDb(value) / 100).toFixed(2).replace(".", ",");
}

/* ─────────────────── Editarea contractului (§9.11) ─────────────────── */

export function ContractEditForm({
  contract,
  firms,
  clients,
  owners,
}: {
  contract: ContractValues;
  firms: Opt[];
  clients: Opt[];
  owners: Opt[];
}) {
  return (
    <FormModal
      label="Editează contractul"
      variant="default"
      size="sm"
      width="lg"
      title={`Contractul ${contract.code}`}
      subtitle="Componentele și ponderile nu se schimbă de aici: au produs deja plafoane și alocări. Corecția lor e o realocare."
      action={updateContract}
      validate={validateContract}
    >
      <input type="hidden" name="id" value={contract.id} />
      <Field name="code" label="Cod" required defaultValue={contract.code} />
      <Field
        name="kind"
        label="Tip"
        kind="select"
        defaultValue={contract.kind}
        options={CONTRACT_KINDS.map((k) => ({ value: k.value, label: k.label }))}
      />
      <Field name="name" label="Denumire" required full defaultValue={contract.name} />
      <Field name="firmId" label="Firma" kind="select" defaultValue={contract.firmId} options={firms} />
      <Field name="clientId" label="Client" kind="select" defaultValue={contract.clientId} options={clients} />
      <Field name="ownerId" label="Proprietar (PM)" kind="select" defaultValue={contract.ownerId ?? ""}>
        <option value="">— nealocat —</option>
        {owners.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Field>
      <Field name="startDate" label="Început" kind="date" required defaultValue={contract.startDate} />
      <Field name="endDate" label="Sfârșit" kind="date" required defaultValue={contract.endDate} />
      <Field
        name="monthlyValue"
        label="Abonament lunar (lei)"
        kind="money"
        defaultValue={lei(contract.monthlyValue)}
        hint="schimbarea nu rescrie plafoanele deja generate"
      />
      <Field
        name="totalValue"
        label="Valoare totală (lei)"
        kind="money"
        defaultValue={lei(contract.totalValue)}
      />
      <Field name="paymentDays" label="Termen de plată (zile)" kind="number" defaultValue={contract.paymentDays} />
      <Field
        name="indexationPercent"
        label="Indexare anuală (%)"
        kind="number"
        step="0.01"
        defaultValue={contract.indexationPercent}
      />
      <Field
        name="maintenanceThreshold"
        label="Prag mentenanță (lei)"
        kind="money"
        defaultValue={lei(contract.maintenanceThreshold)}
      />
      <Field
        name="expiryAlertMonths"
        label="Alertă de expirare (luni)"
        kind="number"
        defaultValue={contract.expiryAlertMonths}
      />
    </FormModal>
  );
}

/* ─────────────────── Plafonul lunii (pasul 3, după creare) ─────────────────── */

export function BudgetForm({
  componentId,
  componentName,
  isDelta,
  year,
  month,
  monthLabel,
  plan,
  manualCap,
  notes,
}: {
  componentId: string;
  componentName: string;
  isDelta: boolean;
  year: number;
  month: number;
  monthLabel: string;
  plan: string;
  manualCap: string | null;
  notes: string | null;
}) {
  return (
    <FormModal
      label="Plafon"
      variant="quiet"
      size="sm"
      width="sm"
      columns={1}
      title={`${componentName} — ${monthLabel}`}
      subtitle={
        isDelta
          ? "Delta are plafon de VENIT, pus manual. Nu se reportează în luna următoare."
          : "Plafonul de cost al lunii. O lună închisă e refuzată de acțiune."
      }
      action={saveComponentBudget}
    >
      <input type="hidden" name="componentId" value={componentId} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      <Field name="plan" label="Plafon de cost (lei)" kind="money" defaultValue={lei(plan)} />
      {isDelta ? (
        <Field
          name="manualCap"
          label="Plafon de venit — Delta (lei)"
          kind="money"
          defaultValue={lei(manualCap ?? "0")}
          hint="ținta de umplut din propuneri"
        />
      ) : null}
      <Field name="notes" label="Motivul ajustării" kind="textarea" rows={2} defaultValue={notes} />
    </FormModal>
  );
}

/* ─────────────────── Pasul 4: obiective arondate ─────────────────── */

export function LinkObjectiveForm({
  contractId,
  objectives,
  templates,
}: {
  contractId: string;
  objectives: Opt[];
  templates: Opt[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <FormModal
      label="Arondează un obiectiv"
      variant="default"
      size="sm"
      title="Obiectiv pe contract"
      subtitle="Profilul de inspecție stă pe legătură, nu pe obiectiv: același obiectiv poate avea alte inspecții pe alt contract."
      action={linkObjective}
      validate={validateContractObjective}
      submitLabel="Arondează"
    >
      <input type="hidden" name="contractId" value={contractId} />
      <Field name="objectiveId" label="Obiectiv" kind="select" required full options={objectives} />
      <Field name="fromDate" label="De la" kind="date" required defaultValue={today} />
      <Field name="toDate" label="Până la" kind="date" hint="gol = pe termen nedefinit" />
      <Field name="inspectionFrequencyMonths" label="Inspecție la (luni)" kind="number" />
      <Field name="checklistTemplateId" label="Șablon de checklist" kind="select">
        <option value="">— fără —</option>
        {templates.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Field>
    </FormModal>
  );
}

/**
 * Scoaterea de pe contract nu șterge rândul: îi pune data de ieșire. Istoricul unităților
 * de lucru trebuie să rămână explicabil (§9.11).
 */
export function UnlinkObjectiveButton({
  linkId,
  contractId,
}: {
  linkId: string;
  contractId: string;
}) {
  return (
    <form action={unlinkObjective}>
      <input type="hidden" name="linkId" value={linkId} />
      <input type="hidden" name="contractId" value={contractId} />
      <Button type="submit" size="sm" variant="quiet" title="Închide arondarea de azi">
        Scoate
      </Button>
    </form>
  );
}

/* ─────────────────── Pasul 5: anul contractual următor ─────────────────── */

export function ContractYearForm({
  contractId,
  nextYearNo,
  suggestedStart,
  suggestedEnd,
  indexationPercent,
}: {
  contractId: string;
  nextYearNo: number;
  suggestedStart: string;
  suggestedEnd: string;
  indexationPercent: string;
}) {
  return (
    <FormModal
      label={`＋ Anul ${nextYearNo}`}
      variant="default"
      size="sm"
      title={`Anul contractual ${nextYearNo}`}
      subtitle="Abonamentul se indexează din ultimul an. Anii deja înregistrați nu se rescriu."
      action={addContractYear}
      validate={validateContractYear}
      submitLabel="Adaugă anul"
    >
      <input type="hidden" name="contractId" value={contractId} />
      <Field name="startDate" label="Început" kind="date" required defaultValue={suggestedStart} />
      <Field name="endDate" label="Sfârșit" kind="date" required defaultValue={suggestedEnd} />
      <Field
        name="indexationPercent"
        label="Indexare (%)"
        kind="number"
        step="0.01"
        full
        defaultValue={indexationPercent}
        hint="0 înseamnă abonament neschimbat — vezi ce face pe termen lung la „Marjă pe ani”"
      />
    </FormModal>
  );
}
