"use client";

import { useState } from "react";

import { mapDevizLines, unmapDevizLines } from "@/app/actions/deviz";
import { Button, NumberInput } from "@/components/ui/primitives";
import { formatShort } from "@/lib/money";

export type MapLine = {
  id: string;
  position: number;
  name: string;
  unit: string;
  quantity: string;
  total: number;
};

export type MapLink = {
  id: string;
  clientLineId: string;
  internalLineId: string;
  coefficient: string;
};

/**
 * Ecranul 17 — panoul de mapare N:M (§8.4).
 *
 * Stânga: pozițiile din devizul client. Dreapta: articolele din devizul intern.
 * Alegi o poziție din stânga și legi de ea câte articole interne o compun. Un articol
 * intern poate apărea în două poziții — de asta legătura are coeficient: 1 = tot
 * articolul intră aici, 0,5 = jumătate, restul e în altă poziție.
 *
 * Fără coeficient, un articol folosit în două locuri s-ar număra de două ori la cost
 * și marja ar ieși mai mică decât e în realitate.
 */
export function MappingPanel({
  devizId,
  clientLines,
  internalLines,
  links,
  showPrices,
  canEdit,
}: {
  devizId: string;
  clientLines: MapLine[];
  internalLines: MapLine[];
  links: MapLink[];
  showPrices: boolean;
  canEdit: boolean;
}) {
  const [active, setActive] = useState<string | null>(clientLines[0]?.id ?? null);

  const linksFor = (clientLineId: string) => links.filter((l) => l.clientLineId === clientLineId);
  const activeLinks = active ? linksFor(active) : [];
  const activeLine = clientLines.find((l) => l.id === active) ?? null;

  // cât din poziția de client e acoperit de articolele interne legate de ea
  const coveredCost = activeLinks.reduce((a, link) => {
    const internal = internalLines.find((i) => i.id === link.internalLineId);
    return a + (internal ? internal.total * Number(link.coefficient) : 0);
  }, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ─────────── devizul client ─────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="eyebrow shrink-0">Poziții client</span>
          <span aria-hidden className="h-px grow bg-rule" />
          <span className="shrink-0 text-micro text-ink-3">{clientLines.length}</span>
        </div>

        <div className="space-y-1">
          {clientLines.map((line) => {
            const n = linksFor(line.id).length;
            return (
              <button
                key={line.id}
                type="button"
                onClick={() => setActive(line.id)}
                className={`flex w-full items-baseline justify-between gap-3 border px-3 py-2 text-left ${
                  active === line.id
                    ? "border-blueprint bg-blueprint-soft"
                    : "border-rule-strong bg-sheet hover:bg-sunk"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-tiny text-ink">
                    <span className="tabular text-ink-3">{line.position}.</span> {line.name}
                  </span>
                  <span className="block text-micro text-ink-3">
                    {line.quantity} {line.unit}
                    {showPrices ? ` · ${formatShort(line.total)}` : ""}
                  </span>
                </span>
                {/* Poziția nemapată e cea care contează: ai ofertat fără să știi costul. */}
                <span
                  className={`shrink-0 text-micro ${n === 0 ? "font-medium text-over" : "text-fill"}`}
                >
                  {n === 0 ? "nemapată" : `${n} intern${n === 1 ? "" : "e"}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─────────── devizul intern ─────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="eyebrow shrink-0">Articole interne</span>
          <span aria-hidden className="h-px grow bg-rule" />
          <span className="shrink-0 text-micro text-ink-3">{internalLines.length}</span>
        </div>

        {activeLine ? (
          <div className="border border-rule-strong bg-sunk px-3 py-2">
            <div className="text-micro text-ink-3">Se leagă de</div>
            <div className="truncate text-tiny font-medium text-ink">{activeLine.name}</div>
            {showPrices ? (
              <div className="mt-1 flex items-baseline justify-between gap-3 text-micro">
                <span className="text-ink-3">cost intern acoperit</span>
                <span className="tabular text-ink-2">
                  {formatShort(coveredCost)} din {formatShort(activeLine.total)}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1">
          {internalLines.map((line) => {
            const link = activeLinks.find((l) => l.internalLineId === line.id);
            return (
              <div
                key={line.id}
                className={`border px-3 py-2 ${
                  link ? "border-fill bg-fill-soft" : "border-rule-strong bg-sheet"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-tiny text-ink">{line.name}</span>
                    <span className="block text-micro text-ink-3">
                      {line.quantity} {line.unit}
                      {showPrices ? ` · ${formatShort(line.total)}` : ""}
                    </span>
                  </span>

                  {canEdit && active ? (
                    link ? (
                      <form action={unmapDevizLines} className="flex shrink-0 items-center gap-1.5">
                        <input type="hidden" name="mappingId" value={link.id} />
                        <input type="hidden" name="devizId" value={devizId} />
                        <span className="tabular text-micro text-ink-2">×{link.coefficient}</span>
                        <button type="submit" className="text-micro text-over hover:underline">
                          desfă
                        </button>
                      </form>
                    ) : (
                      <form action={mapDevizLines} className="flex shrink-0 items-center gap-1.5">
                        <input type="hidden" name="clientLineId" value={active} />
                        <input type="hidden" name="internalLineId" value={line.id} />
                        <input type="hidden" name="devizId" value={devizId} />
                        <NumberInput
                          name="coefficient"
                          defaultValue="1"
                          step="0.1"
                          className="h-7 w-16 text-micro"
                          title="Cât din articol intră în poziția asta"
                        />
                        <Button type="submit" size="sm">
                          leagă
                        </Button>
                      </form>
                    )
                  ) : link ? (
                    <span className="shrink-0 tabular text-micro text-fill">
                      ×{link.coefficient}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
