"use client";

import { moveFunding } from "@/app/actions/work-units";
import { Button, Field, Select, Textarea } from "@/components/ui/primitives";
import { ModalTrigger } from "@/components/ui/modal";

/**
 * Ecranul 12 — mutarea finanțării (§13.1).
 *
 * Regula pe care nu o are niciun soft de pe piață: costurile urmează unitatea de lucru.
 * Ecranul spune, ÎNAINTE de apăsare, care din cele două comportamente se va întâmpla,
 * pentru că sunt fundamental diferite și amândouă corecte.
 */
export function MoveFunding({
  workUnitId,
  current,
  options,
  period,
  periodLabel,
  closedMonths,
}: {
  workUnitId: string;
  current: { contractCode: string; componentName: string } | null;
  options: { id: string; label: string }[];
  period: { year: number; month: number };
  periodLabel: string;
  /** câte dintre lunile cu cost pe unitatea asta sunt deja închise */
  closedMonths: number;
}) {
  return (
    <ModalTrigger
      label="Mută finanțarea"
      variant="default"
      size="sm"
      title="Mutarea finanțării"
      subtitle="Analitica „folosit” nu se schimbă niciodată. Istoricul obiectivului rămâne intact."
    >
      {(close) => (
        <form action={moveFunding} className="space-y-4">
          <input type="hidden" name="workUnitId" value={workUnitId} />
          <input type="hidden" name="year" value={period.year} />
          <input type="hidden" name="month" value={period.month} />

          <div className="sheet px-3 py-2 text-tiny text-ink-2">
            Acum:{" "}
            <span className="font-medium text-ink">
              {current ? `${current.contractCode} · ${current.componentName}` : "nefinanțată"}
            </span>
          </div>

          <Field label="Mută pe componenta" required>
            <Select name="toComponentId" required defaultValue="">
              <option value="" disabled>
                Alege componenta
              </option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Motiv" required hint="O mutare fără motiv e o mutare pe care nimeni nu o poate apăra.">
            <Textarea name="reason" rows={2} required placeholder="De ce se mută finanțarea" />
          </Field>

          {/* Cele două comportamente, scrise înainte de apăsare. */}
          <div className="space-y-1.5 border-t border-rule pt-3 text-tiny">
            <p className="text-ink-2">
              <span className="font-medium text-ink">Lunile deschise:</span> liniile de cost se
              rescriu direct pe noua componentă.
            </p>
            <p className="text-ink-2">
              <span className="font-medium text-ink">Lunile închise:</span> liniile rămân datate în
              luna lor, iar în {periodLabel} se emite un document de realocare care scoate valoarea
              din componenta veche și o pune pe cea nouă.
            </p>
            {closedMonths > 0 ? (
              <p className="border-l-2 border-warn bg-warn-soft px-3 py-1.5 text-warn">
                Unitatea are cost în {closedMonths}{" "}
                {closedMonths === 1 ? "lună închisă" : "luni închise"}. Se va emite document de
                realocare — apare în lista realocărilor lunii.
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-rule pt-3">
            <Button type="button" onClick={close}>
              Renunț
            </Button>
            <Button type="submit" variant="primary">
              Mută
            </Button>
          </div>
        </form>
      )}
    </ModalTrigger>
  );
}
