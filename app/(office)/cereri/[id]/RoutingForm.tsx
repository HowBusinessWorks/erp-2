"use client";

import { useState } from "react";

import { decideRequest } from "@/app/actions/requests";
import { Gauge } from "@/components/ui/gauge";
import {
  Button,
  Field,
  NumberInput,
  SectionRule,
  Textarea,
} from "@/components/ui/primitives";
import { format, formatShort } from "@/lib/money";
import { ROUTING_EFFECT, ROUTING_LABELS, type RoutingContext } from "@/lib/routing";

/**
 * Ecranul 8 — decizia de rutare (§7).
 *
 * Cele trei ramuri, plus contractul nou, puse una lângă alta cu efectul lor economic
 * scris în clar. Sistemul recomandă pe cifre; omul apasă și rămâne cu numele pe decizie.
 */
export function RoutingForm({
  requestId,
  context,
  period,
  periodLabel,
}: {
  requestId: string;
  context: RoutingContext;
  period: { year: number; month: number };
  periodLabel: string;
}) {
  const [choice, setChoice] = useState(context.suggestion);
  const selected = context.branches.find((b) => b.decision === choice)!;

  return (
    <form action={decideRequest} className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="year" value={period.year} />
      <input type="hidden" name="month" value={period.month} />
      <input type="hidden" name="decision" value={choice} />
      <input type="hidden" name="componentId" value={selected.componentId ?? ""} />

      <SectionRule right={`decizie pentru ${periodLabel}`}>Rutare</SectionRule>

      <p className="max-w-prose text-tiny text-ink-2">
        Estimat <span className="tabular font-medium text-ink">{format(context.estimated)} lei</span>,
        pragul contractului{" "}
        <span className="tabular font-medium text-ink">{formatShort(context.threshold)} lei</span>.
        Cifrele de mai jos sunt de pe {periodLabel}, nu din memorie.
      </p>

      {/* Cât mai e liber, acum, în fiecare direcție. Fără asta decizia e din ochi. */}
      <div className="grid gap-2 sm:grid-cols-3">
        {context.delta ? (
          <Capacity
            label="Delta lunii"
            direction="umple"
            cap={context.delta.cap}
            used={context.delta.filled}
            free={context.delta.free}
            hint="se umple"
          />
        ) : null}
        {context.works ? (
          <Capacity
            label="Componenta Lucrări"
            direction="consuma"
            cap={context.works.cap}
            used={context.works.used}
            free={context.works.free}
            hint="se consumă"
          />
        ) : null}
        {context.maintenance ? (
          <Capacity
            label="Mentenanță"
            direction="consuma"
            cap={context.maintenance.cap}
            used={context.maintenance.used}
            free={context.maintenance.free}
            hint="se consumă"
          />
        ) : null}
      </div>

      <div className="space-y-1.5">
        {context.branches.map((branch) => {
          const on = branch.decision === choice;
          return (
            <label
              key={branch.decision}
              className={`flex cursor-pointer items-start gap-3 border px-3.5 py-2.5 transition-colors ${
                on ? "border-blueprint bg-blueprint-soft/60" : "border-rule hover:bg-sunk/60"
              } ${!branch.possible && !on ? "opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="alegere"
                className="mt-1 accent-[var(--color-blueprint)]"
                checked={on}
                onChange={() => setChoice(branch.decision)}
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-narrow text-[0.9375rem] font-semibold text-ink">
                    {ROUTING_LABELS[branch.decision]}
                  </span>
                  {branch.recommended ? (
                    <span className="rounded-[2px] border border-fill/25 bg-fill-soft px-1.5 py-0.5 text-micro font-medium leading-none text-fill">
                      recomandat
                    </span>
                  ) : null}
                  {!branch.possible ? (
                    <span className="rounded-[2px] border border-rule bg-sunk px-1.5 py-0.5 text-micro leading-none text-ink-3">
                      nu încape
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-tiny text-ink-2">{branch.reason}</span>
                {on ? (
                  <span className="mt-1 block text-micro text-ink-3">
                    {ROUTING_EFFECT[branch.decision]}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-rule pt-3">
        <div className="w-40">
          <Field label="Valoare alocată" hint="implicit, estimarea">
            <NumberInput name="value" defaultValue={(context.estimated / 100).toFixed(2)} />
          </Field>
        </div>
        <div className="min-w-64 grow">
          <Field label="Notă de decizie">
            <Textarea name="note" rows={2} placeholder="De ce ai ales ramura asta" />
          </Field>
        </div>
        <Button type="submit" variant="primary">
          Decide și produce lucrarea
        </Button>
      </div>

      <p className="text-micro text-ink-3">
        Decizia produce direct obiectul următor: unitatea de lucru și alocarea ei de finanțare,
        pe componenta aleasă, în {periodLabel}. Nu rămâne „aprobat” fără urmare.
      </p>
    </form>
  );
}

function Capacity({
  label,
  direction,
  cap,
  used,
  free,
  hint,
}: {
  label: string;
  direction: "umple" | "consuma";
  cap: number;
  used: number;
  free: number;
  hint: string;
}) {
  const percent = cap === 0 ? 0 : (used / cap) * 100;
  return (
    <div className="sheet px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">{label}</span>
        <span className="text-micro text-ink-3">{hint}</span>
      </div>
      <div className="tabular mt-1 text-[0.9375rem] font-semibold text-ink">
        {formatShort(Math.max(0, free))}
        <span className="ml-1 text-tiny font-normal text-ink-3">liber din {formatShort(cap)}</span>
      </div>
      <Gauge direction={direction} percent={percent} size="sm" className="mt-1.5" />
    </div>
  );
}
