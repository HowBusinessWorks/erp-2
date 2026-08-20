"use client";

import { addFuelLog, addRepair } from "@/app/actions/equipment";
import { ModalTrigger } from "@/components/ui/modal";
import { Button, Field, Input, NumberInput, Select, Textarea } from "@/components/ui/primitives";
import { REPAIR_KIND_LABEL } from "@/lib/equipment";

/**
 * Formularele din dosarul utilajului (ecranul 27).
 *
 * Stau într-un fișier de client separat pentru că `ModalTrigger` primește copiii ca
 * funcție — asta nu trece granița server/client. Pagina rămâne componentă de server.
 */

export function AddFuelLog({
  equipmentId,
  hourMeter,
  today,
  lastPrice,
}: {
  equipmentId: string;
  hourMeter: string;
  today: string;
  lastPrice: string;
}) {
  return (
    <ModalTrigger
      label="Alimentare"
      size="sm"
      title="Alimentare cu motorină"
      subtitle="Citirea contorului la alimentare e singurul moment în care contorul se actualizează sigur. De aia se cere aici, nu separat."
    >
      {(close) => (
        <form action={addFuelLog} className="space-y-4">
          <input type="hidden" name="equipmentId" value={equipmentId} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data" required>
              <Input type="date" name="day" defaultValue={today} required />
            </Field>
            <Field label="Contor la alimentare" hint="ore de funcționare">
              <NumberInput name="hourMeter" defaultValue={hourMeter} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Litri" required>
              <NumberInput name="liters" required placeholder="0" />
            </Field>
            <Field label="Preț / litru" hint="lei">
              <NumberInput name="pricePerLiter" defaultValue={lastPrice} />
            </Field>
          </div>

          <p className="border-l-2 border-rule-strong bg-sunk px-3 py-2 text-micro text-ink-3">
            Valoarea intră în registrul de cost ca motorină, pe firma utilajului. Nu se scrie
            nicăieri direct — trece prin `recordCost`, ca orice leu din aplicație.
          </p>

          <div className="flex justify-end gap-2 border-t border-rule pt-3">
            <Button type="button" onClick={close}>
              Renunț
            </Button>
            <Button type="submit" variant="primary">
              Înregistrează
            </Button>
          </div>
        </form>
      )}
    </ModalTrigger>
  );
}

export function AddRepair({
  equipmentId,
  today,
  openIssues,
}: {
  equipmentId: string;
  today: string;
  openIssues: { id: string; label: string }[];
}) {
  return (
    <ModalTrigger
      label="Reparație"
      size="sm"
      title="Reparație sau revizie"
      subtitle="Costul se raportează la ore de funcționare, nu la zile de calendar."
    >
      {(close) => (
        <form action={addRepair} className="space-y-4">
          <input type="hidden" name="equipmentId" value={equipmentId} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tip" required>
              <Select name="kind" defaultValue="interventie" required>
                {Object.entries(REPAIR_KIND_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Începută la" required>
              <Input type="date" name="startedAt" defaultValue={today} required />
            </Field>
          </div>

          {openIssues.length ? (
            <Field
              label="Din observația de teren"
              hint="Legătura rămâne în ambele sensuri: observația se vede pe reparație, reparația pe observație."
            >
              <Select name="requestId" defaultValue="">
                <option value="">— fără legătură —</option>
                {openIssues.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Ce s-a reparat" required>
            <Textarea name="description" rows={2} required placeholder="Descrierea intervenției" />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Ore" hint="de funcționare">
              <NumberInput name="hours" placeholder="0" />
            </Field>
            <Field label="Manoperă" hint="lei">
              <NumberInput name="laborCost" placeholder="0" />
            </Field>
            <Field label="Materiale" hint="lei">
              <NumberInput name="materialCost" placeholder="0" />
            </Field>
          </div>

          <label className="flex items-start gap-2 border border-rule-strong bg-sunk px-3 py-2">
            <input
              type="checkbox"
              name="immobilized"
              className="mt-0.5 size-3.5 accent-[var(--color-blueprint)]"
            />
            <span className="text-tiny text-ink-2">
              <span className="font-medium text-ink">Imobilizează utilajul.</span> Cât e
              imobilizat nu mai produce cost de exploatare — altfel ai plăti amortizare pentru un
              utilaj care stă în service.
            </span>
          </label>

          <div className="flex justify-end gap-2 border-t border-rule pt-3">
            <Button type="button" onClick={close}>
              Renunț
            </Button>
            <Button type="submit" variant="primary">
              Înregistrează
            </Button>
          </div>
        </form>
      )}
    </ModalTrigger>
  );
}
