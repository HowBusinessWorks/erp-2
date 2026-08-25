import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

/**
 * Tabelul e suprafața principală a aplicației. Reguli:
 *  - linii de cotă orizontale, fără zebra, fără chenare verticale
 *  - cifrele la dreapta, cu `tabular`, și niciodată rupte pe două rânduri
 *  - rândul se luminează la hover, nu se colorează tot
 *  - capul de tabel rămâne lipit când se derulează liste lungi
 *  - densitatea vine din `[data-density]`, comutată din bara de sus
 */

export function Sheet({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("sheet overflow-hidden", className)}>{children}</div>;
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table
        className={clsx("w-full border-collapse text-[length:var(--tbl-fs)]", className)}
        {...props}
      />
    </div>
  );
}

export function THead({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={clsx("sticky top-0 z-10 bg-sheet-2", className)} {...props} />;
}

export function TBody({ className, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody
      className={clsx("divide-y divide-rule [&>tr:last-child]:border-b-0", className)}
      {...props}
    />
  );
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={clsx("group transition-colors duration-100 hover:bg-sheet-2", className)}
      {...props}
    />
  );
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
        "th-label whitespace-nowrap border-b border-rule-strong bg-sheet-2 px-[13px] py-2.5 text-left align-bottom",
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
  code,
  className,
  ...props
}: ComponentProps<"td"> & {
  numeric?: boolean;
  strong?: boolean;
  muted?: boolean;
  /** celulă de identificator: cifre înguste, pe un singur rând */
  code?: boolean;
}) {
  return (
    <td
      className={clsx(
        "px-[13px] py-[var(--row-y)] align-middle",
        numeric && "whitespace-nowrap text-right tabular",
        code && "whitespace-nowrap font-narrow font-semibold tracking-[0.01em]",
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
    <tr className="bg-sunk">
      <td
        colSpan={colSpan}
        className="px-[13px] py-[7px] font-narrow text-[10.5px] font-semibold uppercase tracking-[0.11em] text-ink-2"
      >
        {label}
      </td>
    </tr>
  );
}

/** Rând de total — linie groasă deasupra, cum e într-un registru. */
export function TFootRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={clsx(
        "tabular border-t-2 border-rule-strong bg-sheet-2 font-semibold [&>td]:py-2.5",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Acțiunile unui rând. Stau ascunse până la hover sau focus — o coloană de
 * butoane pe fiecare linie face lista ilizibilă, iar la tastatură tot apar.
 */
export function TRowActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "flex justify-end gap-0.5 opacity-0 transition-opacity duration-100",
        "group-hover:opacity-100 group-focus-within:opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}
