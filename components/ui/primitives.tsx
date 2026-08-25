import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

/* ───────────────────────────── Button ───────────────────────────── */

type ButtonVariant = "primary" | "default" | "quiet" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-ctl border border-transparent " +
  "font-medium transition-[background-color,border-color,box-shadow,transform] duration-[130ms] " +
  "active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-40";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-blueprint text-white shadow-flat hover:bg-blueprint-ink",
  default: "bg-sheet text-ink border-rule-strong hover:bg-sunk hover:border-ink-3",
  quiet: "text-ink-2 hover:bg-sunk hover:text-ink",
  danger: "bg-over text-white shadow-flat hover:brightness-95",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-[29px] px-2.5 text-tiny gap-[5px] rounded-chip",
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
  blueprint: "bg-blueprint-soft text-blueprint-ink border-blueprint-line",
  fill: "bg-fill-soft text-fill border-fill-line",
  warn: "bg-warn-soft text-warn border-warn-line",
  over: "bg-over-soft text-over border-over-line",
};

/**
 * Pastilă de stare. `dot` pune punctul din față — se citește dintr-o privire pe
 * o coloană de tabel, unde cuvântul singur se pierde între rânduri.
 */
export function Badge({
  tone = "neutral",
  dot,
  children,
  className,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-[5px] whitespace-nowrap rounded-full border px-2 py-[2.5px] " +
          "text-[11px] font-medium leading-[1.45]",
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot ? (
        <span aria-hidden className="size-[5px] shrink-0 rounded-full bg-current" />
      ) : null}
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
    <header className="flex flex-wrap items-end gap-5 border-b border-rule pb-4">
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1.5">{eyebrow}</div> : null}
        <h1 className="narrow-title text-[26px] text-ink">{title}</h1>
        {meta ? <div className="mt-1.5 text-[13px] text-ink-2">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

/** Titlu de secțiune în interiorul unei pagini: etichetă + linie până la capăt. */
export function SectionRule({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="shrink-0 font-narrow text-sm font-semibold text-ink">{children}</h2>
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
    <div className="flex flex-col items-start gap-1.5 rounded-sheet border border-dashed border-rule-strong bg-sheet-2 px-7 py-7">
      <p className="font-narrow text-[15.5px] font-semibold text-ink">{title}</p>
      {hint ? <p className="max-w-[52ch] text-tiny text-ink-2">{hint}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

/* ───────────────────────── Notă ───────────────────────── */

type NoteTone = "info" | "fill" | "warn" | "over";

const NOTE_TONES: Record<NoteTone, string> = {
  info: "bg-blueprint-soft text-blueprint-ink border-blueprint-line",
  fill: "bg-fill-soft text-fill border-fill-line",
  warn: "bg-warn-soft text-warn border-warn-line",
  over: "bg-over-soft text-over border-over-line",
};

/** Casetă informativă. Explică o regulă sau o consecință, nu decorează. */
export function Note({
  tone = "info",
  icon,
  children,
  className,
}: {
  tone?: NoteTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex gap-[11px] rounded-ctl border px-[15px] py-3 text-tiny leading-[1.55]",
        NOTE_TONES[tone],
        className,
      )}
    >
      {icon ? <span className="mt-px shrink-0">{icon}</span> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ───────────────────────── KPI ───────────────────────── */

type DeltaTone = "up" | "down" | "flat";

/**
 * Cifra mare a unui ecran. Eticheta sus, valoarea în Archivo Narrow cu cifre
 * tabulare, iar dedesubt delta față de perioada anterioară și, opțional, o
 * linie de tendință — destul cât să se vadă direcția, nu un grafic în miniatură.
 */
export function Kpi({
  label,
  value,
  unit,
  delta,
  deltaTone = "flat",
  deltaNote,
  spark,
  icon,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  delta?: ReactNode;
  deltaTone?: DeltaTone;
  deltaNote?: ReactNode;
  /** serie de valori pentru linia de tendință; 2–24 puncte e intervalul util */
  spark?: number[];
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-sheet border border-rule bg-sheet px-4 pb-3 pt-3.5 shadow-flat transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-rule-strong hover:shadow-lift",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
        {icon}
        {label}
      </div>
      <div className="narrow-title tabular text-[27px] leading-[1.25] text-ink">
        {value}
        {unit ? <small className="ml-1 text-[13px] font-medium text-ink-3">{unit}</small> : null}
      </div>
      {delta !== undefined || spark ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {delta !== undefined ? (
            <span
              className={clsx(
                "tabular inline-flex items-center gap-1 text-[11.5px] font-semibold",
                deltaTone === "up" && "text-fill",
                deltaTone === "down" && "text-over",
                deltaTone === "flat" && "text-ink-3",
              )}
            >
              {delta}
              {deltaNote ? (
                <em className="not-italic font-normal text-ink-3">{deltaNote}</em>
              ) : null}
            </span>
          ) : (
            <span />
          )}
          {spark && spark.length > 1 ? <Sparkline points={spark} tone={deltaTone} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function Sparkline({ points, tone }: { points: number[]; tone: DeltaTone }) {
  const w = 74;
  const h = 22;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * (h - 3) - 1.5;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const color =
    tone === "up"
      ? "var(--ok)"
      : tone === "down"
        ? "var(--bad)"
        : "var(--tx-3)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/* ───────────────────────── Bara de unelte ───────────────────────── */

/** Rândul de deasupra unei liste: segmente, căutare, filtre, contor. */
export function Toolbar({
  segments,
  children,
  right,
  count,
}: {
  segments?: ReactNode;
  children?: ReactNode;
  right?: ReactNode;
  count?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-1 bg-paper px-1 pb-3 pt-1">
      {segments ? <div className="mb-3">{segments}</div> : null}
      {children || right || count !== undefined ? (
        <div className="flex flex-wrap items-center gap-2">
          {children}
          <div className="ml-auto flex items-center gap-2">
            {count !== undefined ? (
              <span className="tabular text-[11.5px] text-ink-3">{count}</span>
            ) : null}
            {right}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Segmente-pastilă. Fiecare segment e o adresă, ca și tab-urile. */
export function Segments({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex gap-0.5 rounded-ctl bg-sunk p-[3px]">{children}</div>
  );
}

export function Segment({
  active,
  count,
  className,
  children,
  ...props
}: ComponentProps<"a"> & { active?: boolean; count?: number }) {
  return (
    <a
      className={clsx(
        "rounded-chip px-3 py-1.5 text-[12.5px] transition-colors duration-[130ms]",
        active ? "bg-sheet font-medium text-ink shadow-flat" : "text-ink-2 hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined ? (
        <span className="tabular ml-1.5 text-[11px] text-ink-3">{count}</span>
      ) : null}
    </a>
  );
}

/** Filtru-chip. Aprins = albastru plin, ca să se vadă că lista e restrânsă. */
export function Chip({
  active,
  className,
  ...props
}: ComponentProps<"a"> & { active?: boolean }) {
  return (
    <a
      className={clsx(
        "inline-flex h-[30px] items-center gap-1.5 rounded-full border px-[11px] text-tiny transition-colors duration-[130ms]",
        active
          ? "border-blueprint bg-blueprint text-white"
          : "border-rule-strong bg-sheet text-ink-2 hover:border-ink-3 hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}

/* ───────────────────────── Traseu de stare ───────────────────────── */

export type PipelineStep = { label: string; state: "done" | "now" | "todo" };

/** Unde e documentul în drumul lui. Pașii se ating, ca pe o bandă. */
export function Pipeline({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="flex flex-wrap items-center">
      {steps.map((s, i) => (
        <span
          key={s.label}
          className={clsx(
            "-mr-px flex items-center gap-2 border px-3.5 py-1.5 pl-[11px] text-tiny",
            i === 0 && "rounded-l-ctl",
            i === steps.length - 1 && "mr-0 rounded-r-ctl",
            s.state === "done" && "border-fill-line bg-fill-soft text-fill",
            s.state === "now" &&
              "z-[1] border-blueprint-line bg-blueprint-soft font-semibold text-blueprint-ink",
            s.state === "todo" && "border-rule bg-sheet-2 text-ink-3",
          )}
        >
          <span
            className={clsx(
              "grid size-[17px] place-items-center rounded-full text-[10px] font-bold",
              s.state === "done" && "bg-fill text-white",
              s.state === "now" && "bg-blueprint text-white",
              s.state === "todo" && "bg-sunk-2 text-ink-3",
            )}
          >
            {i + 1}
          </span>
          {s.label}
        </span>
      ))}
    </div>
  );
}

/* ───────────────────────── Cronologie ───────────────────────── */

export type TrailItem = { title: ReactNode; meta?: ReactNode; state?: "done" | "now" | "todo" };

/** Ce s-a întâmplat cu documentul, în ordine. */
export function Trail({ items }: { items: TrailItem[] }) {
  return (
    <ol className="relative pl-5 before:absolute before:bottom-[7px] before:left-[5px] before:top-[7px] before:w-px before:bg-rule before:content-['']">
      {items.map((item, i) => (
        <li
          key={i}
          className={clsx(
            "relative pb-4 last:pb-0",
            "before:absolute before:-left-[18px] before:top-[5px] before:size-[9px] before:rounded-full before:border-2 before:content-['']",
            item.state === "done" && "before:border-fill before:bg-fill",
            item.state === "now" &&
              "before:border-blueprint before:bg-blueprint before:shadow-[0_0_0_3px_var(--acc-soft)]",
            (!item.state || item.state === "todo") && "before:border-rule-strong before:bg-sheet",
          )}
        >
          <b className="block text-[12.5px] font-medium text-ink">{item.title}</b>
          {item.meta ? <span className="text-[11.5px] text-ink-3">{item.meta}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/* ───────────────────────── Antet de detaliu ───────────────────────── */

/**
 * Antetul unui dosar: rămâne lipit sus, ține traseul de stare și tab-urile.
 * Când derulezi o listă de 200 de poziții, tot vezi ce document citești.
 */
export function DetailHeader({
  eyebrow,
  title,
  badges,
  actions,
  steps,
  tabs,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  steps?: PipelineStep[];
  tabs?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-1 border-b border-rule bg-paper px-1 pb-3 pt-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
          <div className="narrow-title text-[22px] text-ink">{title}</div>
        </div>
        {badges ? <div className="flex items-center gap-2">{badges}</div> : null}
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
      {steps ? (
        <div className="mt-3">
          <Pipeline steps={steps} />
        </div>
      ) : null}
      {tabs ? <div className="-mb-3 mt-3.5">{tabs}</div> : null}
    </div>
  );
}

/* ───────────────────────── Câmpuri de formular ───────────────────────── */

const CONTROL =
  "h-[38px] w-full rounded-ctl border border-rule-strong bg-sheet px-[11px] text-[13.5px] " +
  "text-ink placeholder:text-ink-3 outline-none transition-[border-color,box-shadow] duration-[130ms] " +
  "focus:border-blueprint focus:shadow-[0_0_0_3px_var(--acc-soft)]";

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
      <span className="eyebrow mb-1.5 block">
        {label}
        {required ? <span className="text-over"> •</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11.5px] text-ink-3">{hint}</span> : null}
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
