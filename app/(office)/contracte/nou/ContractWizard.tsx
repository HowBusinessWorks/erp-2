"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Input, NumberInput, Select } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import {
  COMPONENT_KINDS,
  CONTRACT_KINDS,
  DEFAULT_COMPONENTS,
  INDIVIDUAL_COMPONENT,
  monthLabel,
  monthlyCostCap,
  numberOf,
  twelveMonths,
  validateComponents,
  validateContract,
  type ComponentDraft,
  type FormErrors,
} from "@/lib/contracts-types";
import { format, parseInput } from "@/lib/money";

export type Opt = { value: string; label: string };

/**
 * Asistentul de contract nou — PLAN.md §9.2.
 *
 * Trei pași, o singură trimitere. Motivul e la §9.2: un contract fără componente și
 * fără plafoane rupe panoul PM, deci nu are voie să existe pe jumătate. Pașii 4 și 5
 * (obiective, ani) sunt legături și se fac din fișa contractului.
 *
 * Validarea nu se rescrie aici: vine din `lib/contracts-types.ts`, aceeași funcție care
 * păzește și server action-ul (principiul 4 din §9.0).
 */

const STEPS = [
  { n: 1, label: "Contract", hint: "cine, cât, pe ce perioadă" },
  { n: 2, label: "Componente", hint: "cum se rupe abonamentul" },
  { n: 3, label: "Plafoane", hint: "12 luni de cost, ajustabile" },
];

export function ContractWizard({
  firms,
  clients,
  owners,
  action,
}: {
  firms: Opt[];
  clients: Opt[];
  owners: Opt[];
  action: (fd: FormData) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<FormErrors>({});

  const today = new Date().toISOString().slice(0, 10);
  const nextYear = `${new Date().getFullYear() + 1}-${today.slice(5)}`;

  const [head, setHead] = useState<Record<string, string>>({
    code: "",
    name: "",
    firmId: firms[0]?.value ?? "",
    clientId: clients[0]?.value ?? "",
    ownerId: owners[0]?.value ?? "",
    kind: "mentenanta",
    startDate: today,
    endDate: nextYear,
    monthlyValue: "",
    totalValue: "",
    paymentDays: "70",
    indexationPercent: "5",
    maintenanceThreshold: "2000",
    expiryAlertMonths: "6",
  });

  const [components, setComponents] = useState<ComponentDraft[]>(DEFAULT_COMPONENTS);
  /** Plafoanele atinse cu mâna: „componenta:luna" -> bani. Restul se recalculează liber. */
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  const months = useMemo(() => twelveMonths(head.startDate), [head.startDate]);
  const monthlyRevenue = useMemo(
    () =>
      head.kind === "mentenanta"
        ? parseInput(head.monthlyValue)
        : Math.round(parseInput(head.totalValue) / 12),
    [head.kind, head.monthlyValue, head.totalValue],
  );

  const plan = useMemo(
    () =>
      components.map((c, i) =>
        months.map((_, j) => overrides[`${i}:${j}`] ?? monthlyCostCap(monthlyRevenue, c)),
      ),
    [components, months, monthlyRevenue, overrides],
  );

  function setField(key: string, value: string) {
    setHead((h) => ({ ...h, [key]: value }));
    if (errors[key]) setErrors(({ [key]: _drop, ...rest }) => rest);
  }

  /** Tipul contractului schimbă structura: individualul are o singură componentă. */
  function setKind(kind: string) {
    setField("kind", kind);
    setComponents(kind === "mentenanta" ? DEFAULT_COMPONENTS : [INDIVIDUAL_COMPONENT]);
    setOverrides({});
  }

  function editComponent(i: number, patch: Partial<ComponentDraft>) {
    setComponents((cs) => cs.map((c, j) => (i === j ? { ...c, ...patch } : c)));
    setErrors({});
  }

  function goTo(next: number) {
    if (next <= step) {
      setStep(next);
      setErrors({});
      return;
    }
    const found = step === 1 ? validateContract(head) : validateComponents(components);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});
    setStep(next);
  }

  const weightSum = components.reduce((s, c) => s + c.revenuePercent, 0);
  const yearlyPlan = plan.map((line) => line.reduce((s, v) => s + v, 0));
  const totalPlan = yearlyPlan.reduce((s, v) => s + v, 0);
  const yearlyRevenue = monthlyRevenue * 12;

  async function submit(fd: FormData) {
    const found = { ...validateContract(head), ...validateComponents(components) };
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setStep(Object.keys(found).some((k) => k.startsWith("component")) || found.components ? 2 : 1);
      return;
    }
    for (const [key, value] of Object.entries(head)) fd.set(key, value);
    fd.set("components", JSON.stringify(components));
    fd.set("plan", JSON.stringify(plan));
    await action(fd);
  }

  return (
    <form action={submit} className="space-y-5" noValidate>
      <Stepper step={step} onGo={goTo} />

      {step === 1 ? (
        <StepOne
          head={head}
          errors={errors}
          firms={firms}
          clients={clients}
          owners={owners}
          onField={setField}
          onKind={setKind}
        />
      ) : null}

      {step === 2 ? (
        <StepTwo
          components={components}
          errors={errors}
          weightSum={weightSum}
          monthlyRevenue={monthlyRevenue}
          onEdit={editComponent}
          onAdd={() =>
            setComponents((cs) => [
              ...cs,
              { kind: "lucrari", name: "", revenuePercent: 0, targetMarginPercent: 25 },
            ])
          }
          onRemove={(i) => setComponents((cs) => cs.filter((_, j) => j !== i))}
        />
      ) : null}

      {step === 3 ? (
        <StepThree
          components={components}
          months={months}
          plan={plan}
          yearlyPlan={yearlyPlan}
          totalPlan={totalPlan}
          yearlyRevenue={yearlyRevenue}
          onOverride={(i, j, value) => setOverrides((o) => ({ ...o, [`${i}:${j}`]: value }))}
          onReset={() => setOverrides({})}
          touched={Object.keys(overrides).length}
        />
      ) : null}

      <Footer step={step} onBack={() => goTo(step - 1)} onNext={() => goTo(step + 1)} />
    </form>
  );
}

/* ───────────────────────────── Stepper ───────────────────────────── */

function Stepper({ step, onGo }: { step: number; onGo: (n: number) => void }) {
  return (
    <ol className="flex flex-wrap items-stretch gap-px border border-rule bg-rule">
      {STEPS.map((s) => {
        const state = s.n === step ? "current" : s.n < step ? "done" : "todo";
        return (
          <li key={s.n} className="min-w-[9rem] grow basis-0">
            <button
              type="button"
              onClick={() => onGo(s.n)}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                state === "current"
                  ? "bg-blueprint-soft"
                  : state === "done"
                    ? "bg-sheet hover:bg-sunk"
                    : "bg-sheet text-ink-3"
              }`}
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full text-micro font-semibold ${
                  state === "current"
                    ? "bg-blueprint text-white"
                    : state === "done"
                      ? "bg-fill text-white"
                      : "bg-sunk text-ink-3"
                }`}
              >
                {state === "done" ? "✓" : s.n}
              </span>
              <span className="min-w-0">
                <span
                  className={`block truncate text-tiny font-semibold ${
                    state === "todo" ? "text-ink-3" : "text-ink"
                  }`}
                >
                  {s.label}
                </span>
                <span className="block truncate text-micro text-ink-3">{s.hint}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ───────────────────────────── Pasul 1 ───────────────────────────── */

function Cell({
  label,
  error,
  hint,
  full,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="eyebrow mb-1 block">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-micro font-medium text-over">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-micro text-ink-3">{hint}</span>
      ) : null}
    </label>
  );
}

function StepOne({
  head,
  errors,
  firms,
  clients,
  owners,
  onField,
  onKind,
}: {
  head: Record<string, string>;
  errors: FormErrors;
  firms: Opt[];
  clients: Opt[];
  owners: Opt[];
  onField: (k: string, v: string) => void;
  onKind: (v: string) => void;
}) {
  const isMaintenance = head.kind === "mentenanta";
  return (
    <div className="space-y-4">
      <Sheet className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Cell label="Cod contract" error={errors.code} hint="ex. 4700">
            <Input
              value={head.code}
              onChange={(e) => onField("code", e.target.value)}
              placeholder="4700"
            />
          </Cell>
          <Cell label="Denumire" error={errors.name} full>
            <Input
              value={head.name}
              onChange={(e) => onField("name", e.target.value)}
              placeholder="Mentenanță rețele — Municipiul X"
            />
          </Cell>
          <Cell label="Firma care semnează" error={errors.firmId}>
            <Select value={head.firmId} onChange={(e) => onField("firmId", e.target.value)}>
              {firms.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Cell>
          <Cell
            label="Client"
            error={errors.clientId}
            hint={clients.length === 0 ? "Niciun client în nomenclator — adaugă unul întâi." : undefined}
          >
            <Select value={head.clientId} onChange={(e) => onField("clientId", e.target.value)}>
              {clients.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Cell>
          <Cell label="Tip" error={errors.kind}>
            <Select value={head.kind} onChange={(e) => onKind(e.target.value)}>
              {CONTRACT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Cell>
          <Cell label="Proprietar de contract (PM)" hint="un singur nume responsabil de P&L">
            <Select value={head.ownerId} onChange={(e) => onField("ownerId", e.target.value)}>
              <option value="">— nealocat —</option>
              {owners.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Cell>
          <Cell label="Început" error={errors.startDate}>
            <Input
              type="date"
              value={head.startDate}
              onChange={(e) => onField("startDate", e.target.value)}
            />
          </Cell>
          <Cell label="Sfârșit" error={errors.endDate}>
            <Input
              type="date"
              value={head.endDate}
              onChange={(e) => onField("endDate", e.target.value)}
            />
          </Cell>
        </div>
      </Sheet>

      <Sheet className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Cell
            label="Abonament lunar (lei)"
            error={errors.monthlyValue}
            hint={isMaintenance ? "din el ies plafoanele de la pasul 3" : "opțional la individual"}
          >
            <NumberInput
              value={head.monthlyValue}
              onChange={(e) => onField("monthlyValue", e.target.value)}
              placeholder="0,00"
            />
          </Cell>
          <Cell
            label="Valoare totală (lei)"
            error={errors.totalValue}
            hint={isMaintenance ? "valoarea contractată pe toată perioada" : "din ea ies plafoanele"}
          >
            <NumberInput
              value={head.totalValue}
              onChange={(e) => onField("totalValue", e.target.value)}
              placeholder="0,00"
            />
          </Cell>
          <Cell label="Termen de plată (zile)" error={errors.paymentDays}>
            <NumberInput
              value={head.paymentDays}
              onChange={(e) => onField("paymentDays", e.target.value)}
            />
          </Cell>
          <Cell label="Indexare anuală (%)" error={errors.indexationPercent} hint="poate fi 0">
            <NumberInput
              value={head.indexationPercent}
              onChange={(e) => onField("indexationPercent", e.target.value)}
            />
          </Cell>
          <Cell
            label="Prag mentenanță (lei)"
            hint="sub el, o cerere merge pe abonament, nu pe deviz"
          >
            <NumberInput
              value={head.maintenanceThreshold}
              onChange={(e) => onField("maintenanceThreshold", e.target.value)}
            />
          </Cell>
          <Cell label="Alertă de expirare (luni)">
            <NumberInput
              value={head.expiryAlertMonths}
              onChange={(e) => onField("expiryAlertMonths", e.target.value)}
            />
          </Cell>
        </div>
      </Sheet>
    </div>
  );
}

/* ───────────────────────────── Pasul 2 ───────────────────────────── */

function StepTwo({
  components,
  errors,
  weightSum,
  monthlyRevenue,
  onEdit,
  onAdd,
  onRemove,
}: {
  components: ComponentDraft[];
  errors: FormErrors;
  weightSum: number;
  monthlyRevenue: number;
  onEdit: (i: number, patch: Partial<ComponentDraft>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  const off = Math.abs(weightSum - 100) > 0.01;
  return (
    <div className="space-y-3">
      <Sheet>
        <Table>
          <THead>
            <TR>
              <TH>Tip</TH>
              <TH>Denumire</TH>
              <TH numeric>Pondere din abonament</TH>
              <TH numeric>Marjă țintă</TH>
              <TH numeric>Venit / lună</TH>
              <TH numeric>Plafon de cost / lună</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {components.map((c, i) => {
              const revenue = Math.round((monthlyRevenue * c.revenuePercent) / 100);
              const cap = monthlyCostCap(monthlyRevenue, c);
              return (
                <TR key={i}>
                  <TD className="w-36">
                    <Select
                      value={c.kind}
                      onChange={(e) => onEdit(i, { kind: e.target.value })}
                      className="h-8"
                    >
                      {COMPONENT_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </Select>
                  </TD>
                  <TD>
                    <Input
                      value={c.name}
                      onChange={(e) => onEdit(i, { name: e.target.value })}
                      className="h-8"
                      placeholder="Denumirea componentei"
                    />
                    {errors[`component.${i}.name`] ? (
                      <span className="mt-1 block text-micro text-over">
                        {errors[`component.${i}.name`]}
                      </span>
                    ) : null}
                  </TD>
                  <TD numeric className="w-28">
                    <NumberInput
                      value={String(c.revenuePercent)}
                      onChange={(e) => onEdit(i, { revenuePercent: numberOf(e.target.value) || 0 })}
                      className="h-8 text-right"
                    />
                  </TD>
                  <TD numeric className="w-28">
                    <NumberInput
                      value={String(c.targetMarginPercent)}
                      onChange={(e) =>
                        onEdit(i, { targetMarginPercent: numberOf(e.target.value) || 0 })
                      }
                      className="h-8 text-right"
                    />
                  </TD>
                  <TD numeric className="text-ink-2">
                    {format(revenue)}
                  </TD>
                  <TD numeric className="font-medium">
                    {format(cap)}
                  </TD>
                  <TD numeric className="w-10">
                    {components.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => onRemove(i)}
                        className="text-micro text-ink-3 hover:text-over"
                        title="Scoate componenta"
                      >
                        ✕
                      </button>
                    ) : null}
                  </TD>
                </TR>
              );
            })}
          </TBody>
          <tfoot>
            <TFootRow>
              <TD colSpan={2}>Total</TD>
              <TD numeric className={off ? "text-over" : "text-fill"}>
                {weightSum.toFixed(2)}%
              </TD>
              <TD />
              <TD numeric>
                {format(monthlyRevenue)}
              </TD>
              <TD numeric>
                {format(components.reduce((s, c) => s + monthlyCostCap(monthlyRevenue, c), 0))}
              </TD>
              <TD />
            </TFootRow>
          </tfoot>
        </Table>
      </Sheet>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" size="sm" onClick={onAdd}>
          ＋ Componentă
        </Button>
        {errors.components ? (
          <p className="border-l-2 border-over bg-over-soft px-3 py-1.5 text-tiny text-over">
            {errors.components}
          </p>
        ) : (
          <p className="text-micro text-ink-3">
            Plafonul de cost = venitul componentei × (100 − marja). Cu 25% marjă, plafonul e 75%
            din venit.
          </p>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── Pasul 3 ───────────────────────────── */

function StepThree({
  components,
  months,
  plan,
  yearlyPlan,
  totalPlan,
  yearlyRevenue,
  onOverride,
  onReset,
  touched,
}: {
  components: ComponentDraft[];
  months: { year: number; month: number }[];
  plan: number[][];
  yearlyPlan: number[];
  totalPlan: number;
  yearlyRevenue: number;
  onOverride: (i: number, j: number, value: number) => void;
  onReset: () => void;
  touched: number;
}) {
  const margin = yearlyRevenue - totalPlan;
  return (
    <div className="space-y-3">
      <Sheet className="overflow-x-auto">
        <Table>
          <THead>
            <TR>
              <TH className="sticky left-0 z-10 bg-sunk">Componentă</TH>
              {months.map((m) => (
                <TH key={`${m.year}-${m.month}`} numeric>
                  {monthLabel(m.year, m.month)}
                </TH>
              ))}
              <TH numeric>An</TH>
            </TR>
          </THead>
          <TBody>
            {components.map((c, i) => (
              <TR key={i}>
                <TD className="sticky left-0 z-10 whitespace-nowrap bg-sheet font-medium">
                  {c.name || "—"}
                </TD>
                {months.map((m, j) => (
                  <TD key={`${m.year}-${m.month}`} className="w-24 p-1">
                    <NumberInput
                      value={String((plan[i]?.[j] ?? 0) / 100)}
                      onChange={(e) =>
                        onOverride(i, j, Math.round((numberOf(e.target.value) || 0) * 100))
                      }
                      className="h-8 text-right tabular-nums"
                    />
                  </TD>
                ))}
                <TD numeric className="font-medium">
                  {format(yearlyPlan[i] ?? 0)}
                </TD>
              </TR>
            ))}
          </TBody>
          <tfoot>
            <TFootRow>
              <TD className="sticky left-0 z-10 bg-sunk">Total plafon de cost</TD>
              <TD colSpan={months.length} />
              <TD numeric>
                {format(totalPlan)}
              </TD>
            </TFootRow>
          </tfoot>
        </Table>
      </Sheet>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-micro text-ink-3">
          Venit anual {format(yearlyRevenue)} lei · marjă rămasă{" "}
          <span className={margin < 0 ? "font-medium text-over" : "font-medium text-fill"}>
            {format(margin)} lei
          </span>
          {touched > 0 ? ` · ${touched} luni ajustate manual` : " · toate lunile calculate"}
        </p>
        {touched > 0 ? (
          <Button type="button" size="sm" onClick={onReset}>
            Recalculează toate lunile
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────────────────────── Subsol ───────────────────────────── */

function Footer({
  step,
  onBack,
  onNext,
}: {
  step: number;
  onBack: () => void;
  onNext: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center justify-between gap-2 border-t border-rule pt-3">
      <Button type="button" onClick={onBack} disabled={step === 1 || pending}>
        Înapoi
      </Button>
      {step < STEPS.length ? (
        <Button type="button" variant="primary" onClick={onNext}>
          Continuă
        </Button>
      ) : (
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Se creează…" : "Creează contractul"}
        </Button>
      )}
    </div>
  );
}
