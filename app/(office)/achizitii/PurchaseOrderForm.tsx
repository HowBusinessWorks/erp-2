"use client";

import { useState } from "react";

import { createPurchaseOrder } from "@/app/actions/operability";
import { Field, FieldError, FormModal } from "@/components/ui/form";
import { Button, NumberInput, Select } from "@/components/ui/primitives";
import { TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { format } from "@/lib/money";
import { numberOf, validatePoLines, validatePurchaseOrder } from "@/lib/operability-types";

type Opt = { value: string; label: string };

type Line = {
  productId: string;
  quantity: string;
  unitPrice: string;
  contractId: string;
  componentId: string;
  workUnitId: string;
  stageId: string;
};

const EMPTY: Line = {
  productId: "",
  quantity: "1",
  unitPrice: "",
  contractId: "",
  componentId: "",
  workUnitId: "",
  stageId: "",
};

/**
 * Canalul B din §16 — comanda făcută de birou pentru o lucrare anume (PLAN.md §9.8).
 *
 * Analitica stă **pe linie** și e obligatorie de la creare: fără ea raportul pe etapă e
 * gol (§22.4). De-aia coloana „Componentă" e în tabel, nu în antetul comenzii — două
 * linii ale aceleiași comenzi pot plăti din componente diferite.
 */
export function PurchaseOrderForm({
  firms,
  suppliers,
  warehouses,
  products,
  components,
  contractOfComponent,
  workUnits,
}: {
  firms: Opt[];
  suppliers: Opt[];
  warehouses: Opt[];
  products: Opt[];
  components: Opt[];
  /** componentă → contractul ei; linia din comandă le vrea pe amândouă */
  contractOfComponent: Record<string, string>;
  workUnits: Opt[];
}) {
  const [lines, setLines] = useState<Line[]>([EMPTY]);

  const drafts = lines.map((l) => ({
    productId: l.productId,
    quantity: numberOf(l.quantity) || 0,
    unitPrice: Math.round((numberOf(l.unitPrice) || 0) * 100),
    contractId: contractOfComponent[l.componentId] ?? "",
    componentId: l.componentId,
    workUnitId: l.workUnitId,
    stageId: l.stageId,
  }));

  const total = drafts.reduce((s, d) => s + Math.round(d.unitPrice * d.quantity), 0);

  function edit(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => (i === j ? { ...l, ...patch } : l)));
  }

  return (
    <FormModal
      label="＋ Comandă pentru o lucrare"
      variant="primary"
      size="sm"
      width="lg"
      columns={2}
      title="Comandă nouă — canalul B"
      subtitle="Comanda se naște în ciornă. Angajamentul intră în registru la lansare, de unde intra și până acum."
      action={createPurchaseOrder}
      validate={(v) => ({ ...validatePurchaseOrder(v), ...validatePoLines(drafts) })}
      submitLabel="Creează ciorna"
    >
      <input type="hidden" name="lines" value={JSON.stringify(drafts)} />

      <Field name="firmId" label="Firma care comandă" kind="select" required options={firms} />
      <Field name="deliverToWarehouseId" label="Se livrează la" kind="select" required options={warehouses} />
      <Field name="supplierId" label="Furnizor" kind="select">
        <option value="">— se alege la lansare —</option>
        {suppliers.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Field>
      <Field name="confirmedDeliveryAt" label="Livrare confirmată la" kind="date" />

      <div className="sm:col-span-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="eyebrow">Linii — analitica e obligatorie pe fiecare</span>
          <Button type="button" size="sm" onClick={() => setLines((ls) => [...ls, EMPTY])}>
            ＋ Linie
          </Button>
        </div>

        <div className="overflow-x-auto border border-rule">
          <Table>
            <THead>
              <TR>
                <TH>Produs</TH>
                <TH numeric>Cant.</TH>
                <TH numeric>Preț unitar</TH>
                <TH>Componentă</TH>
                <TH>Lucrare</TH>
                <TH numeric>Valoare</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {lines.map((l, i) => (
                <TR key={i}>
                  <TD className="min-w-52">
                    <Select
                      value={l.productId}
                      onChange={(e) => edit(i, { productId: e.target.value })}
                      className="h-8"
                    >
                      <option value="">— alege —</option>
                      {products.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                    <FieldError name={`line.${i}.productId`} />
                  </TD>
                  <TD className="w-20">
                    <NumberInput
                      value={l.quantity}
                      onChange={(e) => edit(i, { quantity: e.target.value })}
                      className="h-8 text-right"
                    />
                    <FieldError name={`line.${i}.quantity`} />
                  </TD>
                  <TD className="w-24">
                    <NumberInput
                      value={l.unitPrice}
                      onChange={(e) => edit(i, { unitPrice: e.target.value })}
                      placeholder="0,00"
                      className="h-8 text-right"
                    />
                  </TD>
                  <TD className="min-w-44">
                    <Select
                      value={l.componentId}
                      onChange={(e) => edit(i, { componentId: e.target.value })}
                      className="h-8"
                    >
                      <option value="">— alege —</option>
                      {components.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                    <FieldError name={`line.${i}.componentId`} />
                  </TD>
                  <TD className="min-w-44">
                    <Select
                      value={l.workUnitId}
                      onChange={(e) => edit(i, { workUnitId: e.target.value })}
                      className="h-8"
                    >
                      <option value="">— niciuna —</option>
                      {workUnits.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </Select>
                  </TD>
                  <TD numeric className="w-24">
                    {format(Math.round((drafts[i]?.unitPrice ?? 0) * (drafts[i]?.quantity ?? 0)))}
                  </TD>
                  <TD numeric className="w-8">
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                        className="text-micro text-ink-3 hover:text-over"
                        title="Scoate linia"
                      >
                        ✕
                      </button>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
            <tfoot>
              <TFootRow>
                <TD colSpan={5}>Total comandă</TD>
                <TD numeric>{format(total)}</TD>
                <TD />
              </TFootRow>
            </tfoot>
          </Table>
        </div>
        <FieldError name="lines" />
      </div>
    </FormModal>
  );
}
