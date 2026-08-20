"use client";

import { useMemo, useState } from "react";

import { createConsumption } from "@/app/actions/stock";
import { Button, Field, Input, NumberInput, Select, Textarea } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";

type StockItem = {
  warehouseId: string;
  productId: string;
  name: string;
  unit: string;
  available: number;
};

type Unit = { id: string; label: string };
type Stage = { id: string; workUnitId: string; label: string };

/**
 * Ecranul 23, bonul de consum — momentul în care materialul devine cost.
 *
 * Ecranul refuză să treacă peste disponibil: un bon de consum pentru marfă care nu e
 * în gestiune înseamnă că altcineva a luat-o fără hârtie, iar stocul negativ ascunde
 * exact asta. Prețul nu se scrie aici — el vine din CMP-ul gestiunii.
 */
export function ConsumForm({
  warehouses,
  items,
  units,
  stages,
  today,
}: {
  warehouses: { id: string; label: string }[];
  items: StockItem[];
  units: Unit[];
  stages: Stage[];
  today: string;
}) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [workUnitId, setWorkUnitId] = useState("");
  const [lines, setLines] = useState<{ productId: string; quantity: string }[]>([
    { productId: "", quantity: "" },
  ]);

  const stockHere = useMemo(
    () => items.filter((i) => i.warehouseId === warehouseId && i.available > 0),
    [items, warehouseId],
  );
  const stagesHere = useMemo(
    () => stages.filter((s) => s.workUnitId === workUnitId),
    [stages, workUnitId],
  );

  const payload = lines
    .filter((l) => l.productId && Number(l.quantity) > 0)
    .map((l) => ({ productId: l.productId, quantity: Number(l.quantity) }));

  const overdrawn = lines.some((l) => {
    const item = stockHere.find((i) => i.productId === l.productId);
    return item ? Number(l.quantity) > item.available : false;
  });

  return (
    <form action={createConsumption} className="space-y-4">
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Din gestiunea" required>
          <Select
            name="warehouseId"
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setLines([{ productId: "", quantity: "" }]);
            }}
            required
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Pe unitatea de lucru" required hint="Ea decide cine plătește.">
          <Select
            name="workUnitId"
            value={workUnitId}
            onChange={(e) => setWorkUnitId(e.target.value)}
            required
          >
            <option value="" disabled>
              Alege lucrarea
            </option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Etapa" hint={stagesHere.length ? undefined : "Lucrarea asta nu are etape."}>
          <Select name="stageId" defaultValue="" disabled={stagesHere.length === 0}>
            <option value="">— fără etapă —</option>
            {stagesHere.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Ziua" required>
          <Input type="date" name="day" defaultValue={today} required />
        </Field>
      </div>

      <Sheet>
        <Table>
          <THead>
            <TR>
              <TH>Produs</TH>
              <TH numeric>Disponibil</TH>
              <TH numeric>Consumat</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {lines.map((line, i) => {
              const item = stockHere.find((s) => s.productId === line.productId);
              const over = item ? Number(line.quantity) > item.available : false;
              return (
                <TR key={i}>
                  <TD>
                    <Select
                      value={line.productId}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, j) =>
                            j === i ? { ...l, productId: e.target.value } : l,
                          ),
                        )
                      }
                      className="h-8 w-full text-tiny"
                    >
                      <option value="">Alege produsul</option>
                      {stockHere.map((s) => (
                        <option key={s.productId} value={s.productId}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </TD>
                  <TD numeric muted>
                    {item ? `${item.available} ${item.unit}` : "—"}
                  </TD>
                  <TD numeric>
                    <NumberInput
                      value={line.quantity}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, j) => (j === i ? { ...l, quantity: e.target.value } : l)),
                        )
                      }
                      className={`h-8 w-24 text-tiny ${over ? "border-over text-over" : ""}`}
                    />
                  </TD>
                  <TD>
                    {lines.length > 1 ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                      >
                        Scot
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Sheet>

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          size="sm"
          onClick={() => setLines((prev) => [...prev, { productId: "", quantity: "" }])}
        >
          ＋ Încă o linie
        </Button>
        <span className="text-micro text-ink-3">
          Valoarea se calculează la CMP-ul gestiunii, nu la prețul ultimei facturi.
        </span>
      </div>

      <Field label="Observație">
        <Textarea name="note" rows={2} placeholder="La ce s-a folosit, dacă nu e evident" />
      </Field>

      {overdrawn ? (
        <p className="border-l-2 border-over bg-over-soft px-3 py-2 text-tiny text-over">
          O linie cere mai mult decât e disponibil. Fie marfa a plecat fără bon, fie cantitatea e
          greșită — ambele se lămuresc înainte, nu după.
        </p>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-rule pt-3">
        <Button
          type="submit"
          variant="primary"
          disabled={payload.length === 0 || overdrawn || !workUnitId}
        >
          Emit bonul de consum
        </Button>
      </div>
    </form>
  );
}
