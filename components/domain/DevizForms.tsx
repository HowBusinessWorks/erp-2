"use client";

import { useMemo, useState } from "react";

import {
  createDeviz,
  createPackage,
  createSituatie,
  deleteDevizLine,
  proposeSupplement,
  saveDevizAsTemplate,
  saveDevizLine,
} from "@/app/actions/deviz";
import { Field, FormModal } from "@/components/ui/form";
import { Button, NumberInput } from "@/components/ui/primitives";
import { TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { validateDevizLine, validatePackage } from "@/lib/operability-types";

/**
 * PLAN.md §9.6 — devizul și derivatele lui: crearea, nu doar operarea.
 * Toate pe `FormModal`, ca restul blocului E.
 */

export type Opt = { value: string; label: string };

/* ═══════════════ Deviz nou ═══════════════ */

export function DevizForm({
  workUnits,
  templates,
  workUnitId,
}: {
  workUnits: Opt[];
  templates: Opt[];
  /** prezent când butonul stă pe fișa unei lucrări: unitatea e deja știută */
  workUnitId?: string;
}) {
  return (
    <FormModal
      label="＋ Deviz"
      variant="primary"
      size="sm"
      width="md"
      title="Deviz nou"
      subtitle="Versiunea se pune singură: e următoarea pe perechea lucrare + fel. Un deviz client v2 și unul intern v1 stau liniștite pe aceeași lucrare."
      action={createDeviz}
      submitLabel="Deschide devizul"
    >
      {workUnitId ? (
        <input type="hidden" name="workUnitId" value={workUnitId} />
      ) : (
        <Field name="workUnitId" label="Unitate de lucru" kind="select" required full options={workUnits} />
      )}
      <Field
        name="kind"
        label="Fel"
        kind="select"
        required
        options={[
          { value: "intern", label: "Intern — costul real" },
          { value: "client", label: "Client — ce se ofertează" },
        ]}
      />
      <Field
        name="templateId"
        label="Pornește de la un șablon"
        kind="select"
        hint="un deviz pornit de la zero de fiecare dată e motivul pentru care lumea lucrează în Excel"
      >
        <option value="">— de la zero —</option>
        {templates.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Field>
      <Field name="overheadPercent" label="Indirecte (%)" kind="number" step="0.01" />
      <Field name="profitPercent" label="Profit (%)" kind="number" step="0.01" />
      <Field name="notes" label="Observații" kind="textarea" rows={2} full />
    </FormModal>
  );
}

/* ═══════════════ Poziție de deviz ═══════════════ */

export type DevizLineValues = {
  id: string;
  name: string;
  unit: string;
  category: string | null;
  code: string | null;
  quantity: string;
  materialUnitPrice: string;
  laborUnitPrice: string;
  unitPrice: string;
};

export function DevizLineForm({
  devizId,
  units,
  articles,
  line,
}: {
  devizId: string;
  units: string[];
  /** articolele normate — catalogul avea salvarea, nu și consumul */
  articles: Opt[];
  /** sumele vin deja în lei; conversia din bani se face pe server */
  line?: DevizLineValues;
}) {
  const editing = Boolean(line);
  return (
    <FormModal
      label={editing ? "Editează" : "＋ Poziție"}
      variant={editing ? "quiet" : "primary"}
      size="sm"
      width="md"
      title={editing ? `Poziția „${line!.name}”` : "Poziție nouă"}
      subtitle="Alegerea unui articol normat completează denumirea, unitatea și costul de material din catalog."
      action={saveDevizLine}
      validate={validateDevizLine}
    >
      <input type="hidden" name="devizId" value={devizId} />
      {line ? <input type="hidden" name="id" value={line.id} /> : null}

      <Field name="normedArticleId" label="Din articol normat" kind="select" full>
        <option value="">— poziție scrisă de mână —</option>
        {articles.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </Field>
      <Field name="description" label="Denumire" required full defaultValue={line?.name} />
      <Field
        name="unit"
        label="Unitate"
        kind="select"
        required
        defaultValue={line?.unit ?? "buc"}
        options={units.map((u) => ({ value: u, label: u }))}
      />
      <Field name="quantity" label="Cantitate" kind="number" step="0.001" defaultValue={line?.quantity} />
      <Field name="category" label="Capitol" defaultValue={line?.category} />
      <Field name="code" label="Cod" defaultValue={line?.code} />
      <Field
        name="materialUnitPrice"
        label="Material / unitate (lei)"
        kind="money"
        defaultValue={line?.materialUnitPrice}
      />
      <Field
        name="laborUnitPrice"
        label="Manoperă / unitate (lei)"
        kind="money"
        defaultValue={line?.laborUnitPrice}
      />
      <Field
        name="unitPrice"
        label="Preț unitar (lei)"
        kind="money"
        full
        defaultValue={line?.unitPrice}
        hint="gol = material + manoperă"
      />
    </FormModal>
  );
}

export function DeleteDevizLineButton({ devizId, id }: { devizId: string; id: string }) {
  return (
    <form action={deleteDevizLine}>
      <input type="hidden" name="devizId" value={devizId} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="quiet" title="Scoate poziția din ciornă">
        ✕
      </Button>
    </form>
  );
}

export function DevizTemplateForm({ devizId }: { devizId: string }) {
  return (
    <FormModal
      label="Salvează ca șablon"
      variant="default"
      size="sm"
      width="sm"
      columns={1}
      title="Șablon de deviz"
      subtitle="Pozițiile devizului, fără valorile lui: următoarea lucrare de același fel pornește de aici."
      action={saveDevizAsTemplate}
    >
      <input type="hidden" name="devizId" value={devizId} />
      <Field name="name" label="Denumirea șablonului" required />
      <Field name="objectiveKind" label="Pentru tipul de obiectiv" hint="gol = orice tip" />
    </FormModal>
  );
}

/* ═══════════════ Pachet nou ═══════════════ */

export function PackageForm({
  workUnits,
  subcontractors,
  workUnitId,
}: {
  workUnits: Opt[];
  subcontractors: Opt[];
  workUnitId?: string;
}) {
  return (
    <FormModal
      label="＋ Pachet"
      variant="primary"
      size="sm"
      width="md"
      title="Pachet de subcontractare"
      subtitle="Pachetul se naște gol. Liniile se aduc din devizul intern — și materialele rămân afară, refuzate de sistem."
      action={createPackage}
      validate={validatePackage}
      submitLabel="Creează pachetul"
    >
      {workUnitId ? (
        <input type="hidden" name="workUnitId" value={workUnitId} />
      ) : (
        <Field name="workUnitId" label="Unitate de lucru" kind="select" required full options={workUnits} />
      )}
      <Field name="name" label="Denumire" required full />
      <Field name="subcontractorId" label="Subcontractant" kind="select" required options={subcontractors} />
      <Field name="specialty" label="Specialitate" placeholder="electric, sanitar, construcții" />
      <Field
        name="retentionPercent"
        label="Garanție reținută (%)"
        kind="number"
        step="0.01"
        full
        hint="se reține din fiecare situație aprobată"
      />
    </FormModal>
  );
}

/* ═══════════════ Situație de lucrări, manuală ═══════════════ */

export type PackageLineRow = {
  id: string;
  name: string;
  unit: string;
  contracted: number;
  executed: number;
};

export function SituatieForm({
  packageId,
  lines,
}: {
  packageId: string;
  lines: PackageLineRow[];
}) {
  const now = new Date();
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const overruns = useMemo(
    () =>
      lines.filter((l) => {
        const declared = Number(String(quantities[l.id] ?? "").replace(",", ".")) || 0;
        return declared > 0 && l.executed + declared > l.contracted + 1e-9;
      }),
    [lines, quantities],
  );

  return (
    <FormModal
      label="＋ Situație"
      variant="primary"
      size="sm"
      width="lg"
      columns={2}
      title="Situație de lucrări"
      subtitle="Calea manuală, pentru lucrările care nu vin prin portalul de subcontractanți. Verificările sunt aceleași."
      action={createSituatie}
      submitLabel="Declară situația"
    >
      <input type="hidden" name="packageId" value={packageId} />
      <Field
        name="year"
        label="Anul"
        kind="number"
        required
        defaultValue={String(now.getFullYear())}
      />
      <Field
        name="month"
        label="Luna"
        kind="number"
        required
        min={1}
        max={12}
        defaultValue={String(now.getMonth() + 1)}
      />

      <div className="sm:col-span-2">
        <span className="eyebrow mb-1.5 block">Cantități declarate luna asta</span>
        <div className="max-h-72 overflow-y-auto border border-rule">
          <Table>
            <THead>
              <TR>
                <TH>Poziție</TH>
                <TH numeric>Contractat</TH>
                <TH numeric>Executat până acum</TH>
                <TH numeric>Declar acum</TH>
              </TR>
            </THead>
            <TBody>
              {lines.map((l) => {
                const declared = Number(String(quantities[l.id] ?? "").replace(",", ".")) || 0;
                const over = declared > 0 && l.executed + declared > l.contracted + 1e-9;
                return (
                  <TR key={l.id}>
                    <TD>{l.name}</TD>
                    <TD numeric muted>
                      {l.contracted} {l.unit}
                    </TD>
                    <TD numeric muted>{l.executed}</TD>
                    <TD className="w-28">
                      <NumberInput
                        name={`qty.${l.id}`}
                        value={quantities[l.id] ?? ""}
                        onChange={(e) =>
                          setQuantities((q) => ({ ...q, [l.id]: e.target.value }))
                        }
                        className={`h-8 text-right ${over ? "border-over" : ""}`}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
            <tfoot>
              <TFootRow>
                <TD colSpan={3}>{lines.length} poziții</TD>
                <TD numeric>
                  {overruns.length > 0 ? (
                    <span className="text-over">{overruns.length} peste</span>
                  ) : (
                    "în limite"
                  )}
                </TD>
              </TFootRow>
            </tfoot>
          </Table>
        </div>
        {overruns.length > 0 ? (
          <p className="mt-2 border-l-2 border-over bg-over-soft px-3 py-2 text-tiny text-over">
            {overruns.length === 1 ? "O poziție depășește" : `${overruns.length} poziții depășesc`}{" "}
            cantitatea contractată. Sistemul refuză declararea — propune întâi o suplimentare.
          </p>
        ) : null}
      </div>
    </FormModal>
  );
}

/* ═══════════════ Suplimentare propusă ═══════════════ */

export function SupplementForm({
  packageId,
  situatieId,
  units,
}: {
  packageId: string;
  situatieId?: string;
  units: string[];
}) {
  return (
    <FormModal
      label="＋ Suplimentare"
      variant="default"
      size="sm"
      width="md"
      title="Propune o suplimentare"
      subtitle="Rămâne propunere până când PM-ul decide. Abia la acceptare linia de pachet și cea de situație se creează în aceeași tranzacție."
      action={proposeSupplement}
      submitLabel="Propune"
    >
      <input type="hidden" name="packageId" value={packageId} />
      {situatieId ? <input type="hidden" name="situatieId" value={situatieId} /> : null}
      <Field name="name" label="Ce s-a executat în plus" required full />
      <Field
        name="unit"
        label="Unitate"
        kind="select"
        defaultValue="buc"
        options={units.map((u) => ({ value: u, label: u }))}
      />
      <Field name="quantity" label="Cantitate" kind="number" step="0.001" required />
      <Field name="unitPrice" label="Preț unitar (lei)" kind="money" />
      <Field
        name="reason"
        label="De ce"
        kind="textarea"
        rows={2}
        full
        hint="motivul e ce citește PM-ul când decide"
      />
    </FormModal>
  );
}
