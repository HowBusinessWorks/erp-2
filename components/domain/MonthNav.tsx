import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { labelPeriod, shiftPeriod, type Period } from "@/lib/period";

/**
 * Navigația pe lună. Toate ecranele de bani au aceeași — plafoanele, marja și
 * registrul se citesc întotdeauna „pe o lună”, niciodată cumulat implicit.
 */
export function MonthNav({
  period,
  basePath,
  extraParams,
  closed,
}: {
  period: Period;
  basePath: string;
  extraParams?: Record<string, string | undefined>;
  closed?: boolean;
}) {
  const href = (p: Period) => {
    const search = new URLSearchParams({ an: String(p.year), luna: String(p.month) });
    for (const [k, v] of Object.entries(extraParams ?? {})) if (v) search.set(k, v);
    return `${basePath}?${search.toString()}`;
  };

  return (
    <div className="flex items-center gap-1">
      <Link
        href={href(shiftPeriod(period, -1))}
        className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-rule-strong bg-sheet text-ink-2 transition-colors hover:bg-sunk hover:text-ink"
        aria-label="Luna anterioară"
      >
        <ChevronLeft size={14} strokeWidth={2} />
      </Link>
      <span className="min-w-36 text-center font-narrow text-[0.8125rem] font-semibold capitalize text-ink">
        {labelPeriod(period)}
      </span>
      <Link
        href={href(shiftPeriod(period, 1))}
        className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-rule-strong bg-sheet text-ink-2 transition-colors hover:bg-sunk hover:text-ink"
        aria-label="Luna următoare"
      >
        <ChevronRight size={14} strokeWidth={2} />
      </Link>
      {closed !== undefined ? (
        <span
          className={`ml-2 inline-flex items-center rounded-[2px] border px-1.5 py-0.5 text-micro font-medium leading-none ${
            closed
              ? "border-rule-strong bg-sunk text-ink-2"
              : "border-fill/25 bg-fill-soft text-fill"
          }`}
        >
          {closed ? "lună închisă" : "lună deschisă"}
        </span>
      ) : null}
    </div>
  );
}
