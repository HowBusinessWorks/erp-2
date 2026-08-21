"use client";

import { saveObjective } from "@/app/actions/contracts";
import { Field, FormModal } from "@/components/ui/form";
import { MapPicker } from "@/components/ui/map-picker";
import { OBJECTIVE_KINDS, validateObjective } from "@/lib/contracts-types";

export type ObjectiveValues = {
  id: string;
  code: string;
  name: string;
  kind: string;
  address: string | null;
  lat: string | null;
  lng: string | null;
  surface: string | null;
  notes: string | null;
};

/**
 * PLAN.md §9.3 — obiectivul, creat de unde începe fluxul: de pe `/obiective` sau direct
 * din pasul 4 al contractului (`contractId` prezent ⇒ se arondează pe loc).
 *
 * `kind` e listă închisă, nu text liber: rutarea din §7 filtrează catalogul de operațiuni
 * pe el, iar D4 din PROGRESS §4 e exact ce iese când nu o face.
 */
export function ObjectiveForm({
  objective,
  contractId,
  label,
  variant = "primary",
}: {
  objective?: ObjectiveValues;
  /** prezent doar când obiectivul se naște din fișa unui contract */
  contractId?: string;
  label?: string;
  variant?: "primary" | "default" | "quiet";
}) {
  const editing = Boolean(objective);
  return (
    <FormModal
      label={label ?? (editing ? "Editează" : "＋ Obiectiv")}
      variant={editing ? "quiet" : variant}
      size="sm"
      width="md"
      title={editing ? `Obiectivul ${objective!.code}` : "Obiectiv nou"}
      subtitle={
        editing
          ? "Codul și tipul se schimbă cu grijă: pe ele stau unitățile de lucru și rutarea."
          : contractId
            ? "Se creează și se arondează pe contract, de azi."
            : "Tipul decide ce operațiuni se pot ruta pe el."
      }
      action={saveObjective}
      validate={validateObjective}
      submitLabel={editing ? "Salvează" : "Creează obiectivul"}
    >
      {objective ? <input type="hidden" name="id" value={objective.id} /> : null}
      {contractId ? <input type="hidden" name="contractId" value={contractId} /> : null}

      <Field name="code" label="Cod" required defaultValue={objective?.code} placeholder="OB-1042" />
      <Field
        name="kind"
        label="Tip"
        kind="select"
        required
        defaultValue={objective?.kind ?? "statie"}
        options={OBJECTIVE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
      />
      <Field name="name" label="Denumire" required full defaultValue={objective?.name} />
      <Field name="address" label="Adresă" full defaultValue={objective?.address} />
      <MapPicker defaultLat={objective?.lat} defaultLng={objective?.lng} />
      <Field
        name="surface"
        label="Suprafață (mp)"
        kind="number"
        step="0.01"
        defaultValue={objective?.surface}
      />
      {contractId ? (
        <Field
          name="inspectionFrequencyMonths"
          label="Inspecție la (luni)"
          kind="number"
          hint="frecvența contractuală; gol = fără inspecții programate"
        />
      ) : null}
      <Field name="notes" label="Observații" kind="textarea" rows={2} full defaultValue={objective?.notes} />
    </FormModal>
  );
}
