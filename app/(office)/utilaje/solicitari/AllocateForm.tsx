"use client";

import { useState } from "react";

import { allocateEquipment } from "@/app/actions/equipment";
import { ModalTrigger } from "@/components/ui/modal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";

export type Candidate = {
  id: string;
  code: string;
  name: string;
  category: string;
  activities: string[];
  /** planificările care se lovesc de fereastra cerută */
  busyOn: { from: string; to: string }[];
  status: string;
  immobilized: boolean;
};

/**
 * Ecranul 28 — biroul alege bucata concretă (§18.1.2).
 *
 * Omul din teren a cerut o capacitate: „excavator, trei zile, la Berceni". Aici se
 * vede care excavator e liber în fereastra aia și care nu, cu motivul scris lângă.
 * Utilajele ocupate nu dispar din listă — se văd, marcate, pentru că uneori decizia
 * corectă e să decalezi cealaltă planificare.
 */
export function AllocateForm({
  requestId,
  requestTitle,
  suggestedFrom,
  suggestedTo,
  candidates,
}: {
  requestId: string;
  requestTitle: string;
  suggestedFrom: string;
  suggestedTo: string;
  candidates: Candidate[];
}) {
  const [from, setFrom] = useState(suggestedFrom);
  const [to, setTo] = useState(suggestedTo);

  const conflicts = (c: Candidate) => c.busyOn.filter((b) => b.from <= to && from <= b.to);

  return (
    <ModalTrigger
      label="Alocă utilaj"
      variant="primary"
      size="sm"
      title="Alocarea utilajului"
      subtitle="Terenul cere o capacitate, biroul alege bucata. Solicitantul rămâne responsabil de utilaj cât e la el."
      width="lg"
    >
      {(close) => (
        <form action={allocateEquipment} className="space-y-4">
          <input type="hidden" name="requestId" value={requestId} />

          <div className="sheet px-3 py-2 text-tiny text-ink-2">
            Cererea: <span className="font-medium text-ink">{requestTitle}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="De la" required>
              <Input
                type="date"
                name="fromDate"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </Field>
            <Field label="Până la" required>
              <Input
                type="date"
                name="toDate"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </Field>
          </div>

          <Field label="Utilajul" required>
            <Select name="equipmentId" defaultValue="" required>
              <option value="" disabled>
                Alege utilajul
              </option>
              {candidates.map((c) => {
                const busy = conflicts(c);
                const blocked = c.immobilized || c.status === "casat";
                return (
                  <option key={c.id} value={c.id} disabled={blocked}>
                    {c.code} · {c.name}
                    {c.immobilized
                      ? " — imobilizat"
                      : busy.length
                        ? ` — ocupat ${busy[0].from} → ${busy[0].to}`
                        : " — liber"}
                  </option>
                );
              })}
            </Select>
          </Field>

          {/* Disponibilitatea, scrisă în clar: o listă derulantă ascunde de ce nu se poate. */}
          <div className="max-h-44 space-y-1 overflow-y-auto border border-rule-strong bg-sunk px-3 py-2">
            {candidates.map((c) => {
              const busy = conflicts(c);
              return (
                <div key={c.id} className="flex items-baseline justify-between gap-3 text-micro">
                  <span className="text-ink-2">
                    {c.code} <span className="text-ink-3">{c.name}</span>
                  </span>
                  <span
                    className={
                      c.immobilized ? "text-over" : busy.length ? "text-warn" : "text-fill"
                    }
                  >
                    {c.immobilized
                      ? "imobilizat"
                      : busy.length
                        ? `ocupat ${busy.length === 1 ? "" : `${busy.length}×`} în fereastră`
                        : "liber"}
                  </span>
                </div>
              );
            })}
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="withOperator"
              className="size-3.5 accent-[var(--color-blueprint)]"
            />
            <span className="text-tiny text-ink-2">Cu operator</span>
          </label>

          <Field label="Observație">
            <Textarea name="note" rows={2} placeholder="Ce trebuie știut la predare" />
          </Field>

          <div className="flex justify-end gap-2 border-t border-rule pt-3">
            <Button type="button" onClick={close}>
              Renunț
            </Button>
            <Button type="submit" variant="primary">
              Alocă
            </Button>
          </div>
        </form>
      )}
    </ModalTrigger>
  );
}
