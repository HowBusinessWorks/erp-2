import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Tab-uri pe URL, nu pe stare locală: fiecare tab e o adresă care se poate da mai
 * departe și care se poate reîncărca. Paginile rămân componente de server.
 */
export function Tabs({
  items,
  active,
}: {
  items: { key: string; href: string; label: ReactNode; count?: number }[];
  active: string;
}) {
  return (
    <nav className="flex items-end gap-0.5 border-b border-rule">
      {items.map((item) => {
        const on = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`-mb-px rounded-t-chip border-b-2 px-3 py-2.5 text-[0.8125rem] transition-colors duration-[130ms] ${
              on
                ? "border-blueprint font-medium text-ink"
                : "border-transparent text-ink-2 hover:bg-sheet-2 hover:text-ink"
            }`}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className="tabular ml-1.5 text-micro text-ink-3">{item.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Pereche etichetă / valoare, cum stau datele într-un antet de dosar. */
export function DataPair({
  label,
  children,
  numeric,
}: {
  label: string;
  children: ReactNode;
  numeric?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow mb-0.5">{label}</div>
      <div className={`text-[0.8125rem] text-ink ${numeric ? "tabular" : ""}`}>{children}</div>
    </div>
  );
}
