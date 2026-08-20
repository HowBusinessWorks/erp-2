"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Modal } from "./modal";
import { Button, Input, NumberInput, Select, Textarea } from "./primitives";

/**
 * PLAN.md §9.0, principiul 2: UN SINGUR formular, refolosit. Nu se scrie al doilea.
 *
 * Trei piese și atât:
 *   `FormModal`    — buton + fereastră + <form> + subsolul cu acțiuni
 *   `Field`        — etichetă + control + eroare, pe variante
 *   `SubmitButton` — starea de trimitere, din `useFormStatus`
 *
 * Validarea NU stă aici (principiul 4): `validate` primește valorile și întoarce
 * erori pe nume de câmp. Funcția vine din `lib/`, aceeași care păzește și acțiunea.
 */

export type FormErrors = Record<string, string>;

const ErrorsContext = createContext<FormErrors>({});

/* ───────────────────────────── Field ───────────────────────────── */

type FieldKind =
  | "text"
  | "email"
  | "password"
  | "tel"
  | "number"
  | "money"
  | "date"
  | "month"
  | "select"
  | "textarea"
  | "checkbox";

export function Field({
  name,
  label,
  kind = "text",
  hint,
  error: errorProp,
  required,
  defaultValue,
  defaultChecked,
  placeholder,
  options,
  step,
  min,
  max,
  rows,
  disabled,
  full,
  children,
}: {
  name: string;
  label: string;
  kind?: FieldKind;
  hint?: string;
  error?: string;
  required?: boolean;
  defaultValue?: string | number | null;
  defaultChecked?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  step?: string;
  min?: string | number;
  max?: string | number;
  rows?: number;
  disabled?: boolean;
  /** ocupă toată lățimea grilei de formular */
  full?: boolean;
  /** conținut propriu (ex. <option>-uri generate) când `options` nu ajunge */
  children?: ReactNode;
}) {
  const errors = useContext(ErrorsContext);
  const error = errorProp ?? errors[name];
  const value = defaultValue === null || defaultValue === undefined ? "" : String(defaultValue);
  const invalid = Boolean(error);
  const ring = invalid ? "border-over focus:border-over" : "";
  const span = full ? "sm:col-span-2" : "";

  if (kind === "checkbox") {
    return (
      <div className={span}>
        <label className="flex items-center gap-2 py-1.5">
          <input
            type="checkbox"
            name={name}
            value="1"
            defaultChecked={defaultChecked}
            disabled={disabled}
            className="size-4 accent-blueprint"
          />
          <span className="text-[0.8125rem] text-ink">{label}</span>
        </label>
        <FieldFoot hint={hint} error={error} />
      </div>
    );
  }

  let control: ReactNode;
  if (kind === "select") {
    control = (
      <Select
        name={name}
        defaultValue={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={ring}
      >
        {children ??
          options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
      </Select>
    );
  } else if (kind === "textarea") {
    control = (
      <Textarea
        name={name}
        defaultValue={value}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        aria-invalid={invalid || undefined}
        className={ring}
      />
    );
  } else if (kind === "number" || kind === "money") {
    control = (
      <NumberInput
        name={name}
        defaultValue={value}
        placeholder={placeholder ?? (kind === "money" ? "0,00" : undefined)}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={ring}
      />
    );
  } else {
    control = (
      <Input
        type={kind === "month" ? "month" : kind}
        name={name}
        defaultValue={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={ring}
      />
    );
  }

  return (
    <label className={`block ${span}`}>
      <span className="eyebrow mb-1 block">
        {label}
        {required ? <span className="text-over"> •</span> : null}
      </span>
      {control}
      <FieldFoot hint={hint} error={error} />
    </label>
  );
}

/** Eroarea unui câmp construit manual (grup de bife, listă) — o citește din context. */
export function FieldError({ name }: { name: string }) {
  const error = useContext(ErrorsContext)[name];
  return error ? <span className="mt-1 block text-micro font-medium text-over">{error}</span> : null;
}

function FieldFoot({ hint, error }: { hint?: string; error?: string }) {
  if (error) return <span className="mt-1 block text-micro font-medium text-over">{error}</span>;
  if (hint) return <span className="mt-1 block text-micro text-ink-3">{hint}</span>;
  return null;
}

/* ─────────────────────────── SubmitButton ─────────────────────────── */

export function SubmitButton({
  children = "Salvează",
  variant = "primary",
  size = "md",
}: {
  children?: ReactNode;
  variant?: "primary" | "default" | "danger";
  size?: "sm" | "md";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending}>
      {pending ? "Se salvează…" : children}
    </Button>
  );
}

/** Butonul de renunțare din subsolul formularului — trece prin verificarea de „modificat”. */
function CancelButton({ onClick }: { onClick: () => void }) {
  const { pending } = useFormStatus();
  return (
    <Button type="button" size="md" onClick={onClick} disabled={pending}>
      Renunț
    </Button>
  );
}

/* ─────────────────────────── FormModal ─────────────────────────── */

/**
 * Regula 4 din CLAUDE.md: fereastra nu se închide la click în afara ei. `Modal` o
 * păzește deja (deduce singur starea de „modificat”), deci aici nu se reimplementează.
 */
export function FormModal({
  label,
  title,
  subtitle,
  action,
  validate,
  children,
  submitLabel = "Salvează",
  width = "md",
  variant = "default",
  size = "sm",
  columns = 2,
}: {
  label: ReactNode;
  title: string;
  subtitle?: ReactNode;
  action: (data: FormData) => Promise<void>;
  /** validator pur, din `lib/` — aceeași funcție păzește și acțiunea */
  validate?: (values: Record<string, string>) => FormErrors;
  children: ReactNode;
  submitLabel?: string;
  width?: "sm" | "md" | "lg";
  variant?: "primary" | "default" | "quiet" | "danger";
  size?: "sm" | "md";
  columns?: 1 | 2;
}) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  async function submit(data: FormData) {
    if (validate) {
      const values: Record<string, string> = {};
      for (const key of new Set(data.keys())) {
        values[key] = data
          .getAll(key)
          .map((v) => (typeof v === "string" ? v : ""))
          .join(",");
      }
      const found = validate(values);
      if (Object.keys(found).length > 0) {
        setErrors(found);
        return;
      }
    }
    setErrors({});
    await action(data);
    setOpen(false);
  }

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setErrors({});
          setOpen(false);
        }}
        title={title}
        subtitle={subtitle}
        width={width}
      >
        <ErrorsContext.Provider value={errors}>
          <form action={submit} noValidate>
            <div className={columns === 1 ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
              {children}
            </div>

            {Object.keys(errors).length > 0 ? (
              <p className="mt-3 border-l-2 border-over bg-over-soft px-3 py-2 text-tiny text-over">
                Mai sunt câmpuri de completat. Fiecare e marcat mai sus.
              </p>
            ) : null}

            <div className="-mx-5 -mb-4 mt-4 flex items-center justify-end gap-2 border-t border-rule bg-sunk/50 px-5 py-3">
              {/* Renunțarea trece prin aceeași poartă ca ✕ și Escape — nu ocolește
                  confirmarea de modificări nesalvate (regula 4). */}
              <CancelButton
                onClick={() =>
                  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
                }
              />
              <SubmitButton>{submitLabel}</SubmitButton>
            </div>
          </form>
        </ErrorsContext.Provider>
      </Modal>
    </>
  );
}
