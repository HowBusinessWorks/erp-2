import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

/* ───────────────────────────── Button ───────────────────────────── */

type ButtonVariant = "primary" | "default" | "quiet" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[3px] font-medium " +
  "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-blueprint text-white hover:bg-blueprint-ink",
  default: "bg-sheet text-ink border border-rule-strong hover:bg-sunk",
  quiet: "text-ink-2 hover:bg-sunk hover:text-ink",
  danger: "bg-over text-white hover:brightness-95",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-tiny",
  md: "h-9 px-3.5 text-[0.8125rem]",
};

export function Button({
  variant = "default",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={clsx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

/* ───────────────────────────── Badge ───────────────────────────── */

type BadgeTone = "neutral" | "blueprint" | "fill" | "warn" | "over";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-sunk text-ink-2 border-rule",
  blueprint: "bg-blueprint-soft text-blueprint-ink border-blueprint/20",
  fill: "bg-fill-soft text-fill border-fill/25",
  warn: "bg-warn-soft text-warn border-warn/30",
  over: "bg-over-soft text-over border-over/25",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-[2px] border px-1.5 py-0.5 text-micro font-medium leading-none",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ───────────────────────── Antet de pagină ───────────────────────── */

/**
 * Titlul stă la stânga, acțiunile la dreapta, iar linia de cotă de dedesubt
 * merge până la capăt. Fără subtitluri care repetă titlul.
 */
export function PageHeader({
  eyebrow,
  title,
  meta,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b border-rule pb-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <div className="eyebrow mb-1.5">{eyebrow}</div> : null}
          <h1 className="font-narrow text-[1.375rem] font-semibold leading-tight tracking-tight text-ink">
            {title}
          </h1>
          {meta ? <div className="mt-1 text-tiny text-ink-2">{meta}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/** Titlu de secțiune în interiorul unei pagini: etichetă + linie până la capăt. */
export function SectionRule({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="eyebrow shrink-0">{children}</span>
      <span aria-hidden className="h-px grow bg-rule" />
      {right ? <span className="shrink-0 text-tiny text-ink-2">{right}</span> : null}
    </div>
  );
}

/* ───────────────────────── Stare goală ───────────────────────── */

/** Starea goală explică ce se pune aici și cum, nu doar că nu e nimic. */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 border border-dashed border-rule-strong px-5 py-8">
      <p className="font-narrow text-[0.9375rem] font-semibold text-ink">{title}</p>
      {hint ? <p className="max-w-prose text-tiny text-ink-2">{hint}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

/* ───────────────────────── Câmpuri de formular ───────────────────────── */

const CONTROL =
  "h-9 w-full rounded-[3px] border border-rule-strong bg-sheet px-2.5 text-[0.8125rem] " +
  "text-ink placeholder:text-ink-3 focus:border-blueprint";

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-1 block">
        {label}
        {required ? <span className="text-over"> •</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-micro text-ink-3">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={clsx(CONTROL, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={clsx(CONTROL, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={clsx(CONTROL, "h-auto min-h-20 py-2 leading-relaxed", className)}
      {...props}
    />
  );
}

/** Câmp numeric: aliniat la dreapta, cifre tabulare. */
export function NumberInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      inputMode="decimal"
      className={clsx(CONTROL, "text-right tabular", className)}
      {...props}
    />
  );
}
