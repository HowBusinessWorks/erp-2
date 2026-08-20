import clsx from "clsx";

import { formatShort, type Bani } from "@/lib/money";

/**
 * Cele două direcții, care sunt inversul una alteia (§4.2):
 *
 *   „consuma" — Mentenanță, Lucrări. Plafon de COST. Vrei să NU-l depășești.
 *               Bara curge de la stânga, trece în ocru la 80%, în teracotă peste 100%.
 *
 *   „umple"   — Delta. Plafon de VENIT. Vrei să-l UMPLI, iar ce rămâne neumplut
 *               e venit pierdut fără cost. De-aia restul se desenează HAȘURAT,
 *               nu gol: golul se citește ca „e bine", hașura se citește ca „lipsește".
 */

export type GaugeDirection = "consuma" | "umple";

const HATCH =
  "repeating-linear-gradient(135deg, var(--color-over) 0 1px, transparent 1px 6px)";

export function Gauge({
  direction,
  percent,
  size = "md",
  className,
}: {
  direction: GaugeDirection;
  percent: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(percent, 100));
  const overflow = percent > 100;

  const fillColor =
    direction === "umple"
      ? "var(--color-fill)"
      : percent > 100
        ? "var(--color-over)"
        : percent >= 80
          ? "var(--color-warn)"
          : "var(--color-blueprint)";

  return (
    <div
      className={clsx("relative w-full overflow-hidden rounded-[1px]", className)}
      style={{
        height: size === "sm" ? 6 : 9,
        // La Delta, fundalul e hașurat — restul neumplut e o problemă, nu spațiu liber.
        background: direction === "umple" ? HATCH : "var(--color-sunk)",
        backgroundColor: direction === "umple" ? "var(--color-over-soft)" : undefined,
      }}
      role="meter"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full transition-[width] duration-500 ease-out"
        style={{ width: `${clamped}%`, background: fillColor }}
      />
      {overflow ? (
        <span
          aria-hidden
          className="absolute inset-y-0 right-0 w-[3px]"
          style={{ background: "var(--color-over)" }}
        />
      ) : null}
    </div>
  );
}

/**
 * Rândul complet de plafon, așa cum apare pe ecranul de contract (§4.3):
 * eticheta și cifrele sus, bara jos, procentul la dreapta.
 */
export function BudgetRow({
  label,
  caption,
  direction,
  percent,
  right,
  hidePrices,
}: {
  label: string;
  caption?: string;
  direction: GaugeDirection;
  percent: number;
  right?: string;
  /** șeful de șantier nu vede lei — atunci rămâne doar bara și procentul */
  hidePrices?: boolean;
}) {
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-narrow text-[0.8125rem] font-semibold uppercase tracking-wide text-ink">
          {label}
        </span>
        <span className="shrink-0 tabular text-tiny text-ink-2">
          {hidePrices ? "—" : right}
        </span>
      </div>
      {caption && !hidePrices ? (
        <div className="mt-0.5 text-tiny text-ink-2">{caption}</div>
      ) : null}
      <div className="mt-1.5 flex items-center gap-2.5">
        <Gauge direction={direction} percent={percent} className="grow" />
        <span
          className={clsx(
            "w-11 shrink-0 text-right tabular text-tiny font-semibold",
            direction === "umple"
              ? percent >= 90
                ? "text-fill"
                : "text-over"
              : percent > 100
                ? "text-over"
                : percent >= 80
                  ? "text-warn"
                  : "text-ink-2",
          )}
        >
          {Math.round(percent)}%
        </span>
      </div>
    </div>
  );
}

/**
 * Bani, peste tot la fel: cifre tabulare, aliniate la dreapta.
 * `masked` e pentru rolurile fără drept financiar — nu ascunde doar valoarea,
 * arată explicit că există o valoare pe care nu o vezi.
 */
export function Money({
  value,
  masked,
  unit = "lei",
  tone,
  className,
}: {
  value: Bani;
  masked?: boolean;
  unit?: string | null;
  tone?: "over" | "fill" | "muted";
  className?: string;
}) {
  if (masked) {
    return (
      <span className={clsx("tabular text-ink-3", className)} title="Fără drept financiar">
        ····
      </span>
    );
  }
  return (
    <span
      className={clsx(
        "tabular",
        tone === "over" && "text-over",
        tone === "fill" && "text-fill",
        tone === "muted" && "text-ink-3",
        className,
      )}
    >
      {formatShort(value)}
      {unit ? <span className="ml-1 text-micro text-ink-3">{unit}</span> : null}
    </span>
  );
}
