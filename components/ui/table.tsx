import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

/**
 * Tabelul e suprafața principală a aplicației. Reguli:
 *  - linii de cotă orizontale, fără zebra, fără chenare verticale
 *  - cifrele la dreapta, cu `tabular`
 *  - rândul se subliniază la hover, nu se colorează tot
 *  - capul de tabel rămâne lipit când se derulează liste lungi
 */

export function Sheet({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("sheet overflow-hidden", className)}>{children}</div>;
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={clsx("w-full border-collapse text-[0.8125rem]", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      className={clsx("sticky top-0 z-10 bg-sunk/95 backdrop-blur-[2px]", className)}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={clsx("divide-y divide-rule", className)} {...props} />;
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={clsx("group transition-colors hover:bg-sunk/60", className)} {...props} />;
}

export function TH({
  numeric,
  className,
  ...props
}: ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={clsx(
        "th-label border-b border-rule-strong px-3 py-2 text-left align-bottom",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  numeric,
  strong,
  muted,
  className,
  ...props
}: ComponentProps<"td"> & { numeric?: boolean; strong?: boolean; muted?: boolean }) {
  return (
    <td
      className={clsx(
        "px-3 py-2 align-middle",
        numeric && "text-right tabular",
        strong && "font-semibold text-ink",
        muted && "text-ink-3",
        className,
      )}
      {...props}
    />
  );
}

/** Rând de separare cu etichetă — grupează liniile fără să adauge un al doilea tabel. */
export function TGroupRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr className="bg-sunk/70">
      <td colSpan={colSpan} className="eyebrow px-3 py-1.5">
        {label}
      </td>
    </tr>
  );
}

/** Rând de total — linie groasă deasupra, cum e într-un registru. */
export function TFootRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={clsx("border-t-2 border-rule-strong bg-sunk/40 font-semibold", className)}
      {...props}
    />
  );
}
