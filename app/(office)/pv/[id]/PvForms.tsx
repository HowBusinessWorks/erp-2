"use client";

import { closeHandover, signHandover } from "@/app/actions/equipment";
import { SignaturePad } from "@/components/domain/SignaturePad";
import { Button, Field, Input, NumberInput, Textarea } from "@/components/ui/primitives";

/**
 * Cele două etape ale PV-ului (ecranul 29).
 *
 * Un singur document, două momente. Etapa 1 se blochează la semnare — un PV de
 * predare care se mai poate edita nu dovedește nimic. Etapa 2 poate fi completată de
 * altcineva decât cel care a luat utilajul, de asta numele se scrie din nou.
 */

export function HandoverStage({
  protocolId,
  defaultName,
  hourMeter,
}: {
  protocolId: string;
  defaultName: string;
  hourMeter: string;
}) {
  return (
    <form action={signHandover} className="space-y-4">
      <input type="hidden" name="protocolId" value={protocolId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Predă" required>
          <Input name="handoverByName" defaultValue={defaultName} required />
        </Field>
        <Field label="Contor la predare" hint="ore de funcționare">
          <NumberInput name="hourMeter" defaultValue={hourMeter} />
        </Field>
        <Field label="Motorină în rezervor" hint="litri">
          <NumberInput name="fuel" placeholder="0" />
        </Field>
        <Field label="Stare la predare">
          <Input name="condition" placeholder="bună / uzuri normale / …" />
        </Field>
      </div>

      <Field label="Observații la predare">
        <Textarea name="notes" rows={2} placeholder="Ce trebuie știut" />
      </Field>

      <SignaturePad name="signature" label="Semnătura celui care primește" required />

      <p className="border-l-2 border-warn bg-warn-soft px-3 py-2 text-tiny text-warn">
        După semnare, etapa de predare se blochează. Nu se mai poate edita nimic din ea.
      </p>

      <div className="flex justify-end">
        <Button type="submit" variant="primary">
          Semnează predarea
        </Button>
      </div>
    </form>
  );
}

export function ReturnStage({ protocolId, handoverHourMeter }: { protocolId: string; handoverHourMeter: string }) {
  return (
    <form action={closeHandover} className="space-y-4">
      <input type="hidden" name="protocolId" value={protocolId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Predă înapoi" required hint="poate fi altcineva decât cel care a luat utilajul">
          <Input name="returnByName" required placeholder="Numele celui care predă" />
        </Field>
        <Field label="Contor la retur" hint={`la predare: ${handoverHourMeter} ore`}>
          <NumberInput name="hourMeter" defaultValue={handoverHourMeter} />
        </Field>
        <Field label="Motorină în rezervor" hint="litri">
          <NumberInput name="fuel" placeholder="0" />
        </Field>
        <Field label="Stare la retur">
          <Input name="condition" placeholder="bună / uzuri normale / …" />
        </Field>
      </div>

      <Field
        label="Probleme constatate"
        hint="Dacă scrii ceva aici, utilajul intră în service, nu se întoarce disponibil."
      >
        <Textarea name="issues" rows={2} placeholder="Lasă gol dacă nu e nimic" />
      </Field>

      <SignaturePad name="signature" label="Semnătura celui care primește înapoi" required />

      <p className="border-l-2 border-blueprint bg-blueprint-soft px-3 py-2 text-tiny text-blueprint-ink">
        La închidere, orele dintre cele două citiri de contor intră în registrul de cost la rata
        internă a utilajului. Dacă utilajul e imobilizat, nu se calculează cost de exploatare.
      </p>

      <div className="flex justify-end">
        <Button type="submit" variant="primary">
          Închide PV-ul
        </Button>
      </div>
    </form>
  );
}
