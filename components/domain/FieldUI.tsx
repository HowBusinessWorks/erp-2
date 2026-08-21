import Link from "next/link";
import type { ReactNode } from "react";

import { Icon, type IconName } from "./FieldIcons";

/**
 * Piesele de interfață ale aplicației de teren.
 *
 * Toate sunt componente de server: nu au stare, doar formă. Ce are nevoie de stare
 * (bara de Trimite, punctele de checklist) stă în `FieldKit.tsx`, marcat "use client".
 * Nimic de aici nu afișează lei — regula 5 din CLAUDE.md nu are excepții pe teren.
 */

/* ───────────────────────── bara de sus ───────────────────────── */

export function FieldBar({
  title,
  sub,
  back,
  action,
  children,
  compact = true,
}: {
  title: ReactNode;
  sub?: ReactNode;
  /** unde duce săgeata din stânga; lipsă = ecran de rădăcină, fără săgeată */
  back?: string;
  action?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="f-bar">
      <div className="f-line1">
        {back ? (
          <Link href={back} className="f-ib" aria-label="Înapoi">
            <Icon name="left" />
          </Link>
        ) : null}
        <h1 className={compact ? "f-sm-title" : undefined}>
          {title}
          {sub ? <span className="f-sub">{sub}</span> : null}
        </h1>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ───────────────────────── rânduri și blocuri ───────────────────────── */

export function Block({ children, padded }: { children: ReactNode; padded?: boolean }) {
  return <div className={padded ? "f-blk f-p" : "f-blk"}>{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="f-lbl">{children}</div>;
}

type Tone = "a" | "g" | "r" | "b" | "n" | "d";

/** Rândul mare cu pătrat colorat — cărămida din care e făcut tot meniul de teren. */
export function Row({
  href,
  icon,
  tone = "n",
  title,
  meta,
  right,
}: {
  href: string;
  icon: IconName;
  tone?: Tone;
  title: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <Link href={href} className="f-brow">
      <span className={`f-sq f-${tone}`}>
        <Icon name={icon} />
      </span>
      <span className="f-tx">
        <b>{title}</b>
        {meta ? <span>{meta}</span> : null}
      </span>
      {right ?? (
        <span className="f-go">
          <Icon name="right" />
        </span>
      )}
    </Link>
  );
}

/** Același rând, dar fără destinație — pentru notificări și liste care doar spun ceva. */
export function StaticRow({
  icon,
  tone = "n",
  title,
  meta,
  right,
}: {
  icon: IconName;
  tone?: Tone;
  title: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="f-brow" style={{ cursor: "default" }}>
      <span className={`f-sq f-${tone}`}>
        <Icon name={icon} />
      </span>
      <span className="f-tx">
        <b>{title}</b>
        {meta ? <span>{meta}</span> : null}
      </span>
      {right}
    </div>
  );
}

export function Pill({
  tone = "n",
  children,
}: {
  tone?: Tone | "on-dark" | "am-solid";
  children: ReactNode;
}) {
  return <span className={`f-pil f-${tone}`}>{children}</span>;
}

/* ───────────────────────── alerte, note, gol ───────────────────────── */

export function Alert({
  tone = "b",
  icon = "info",
  title,
  children,
  action,
}: {
  tone?: "r" | "g" | "a" | "b";
  icon?: IconName;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`f-al f-${tone}`}>
      <Icon name={icon} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{title}</b>
        {children ? <p>{children}</p> : null}
        {action}
      </div>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <div className="f-note">{children}</div>;
}

export function Empty({
  icon = "check",
  title,
  children,
}: {
  icon?: IconName;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="f-emp">
      <Icon name={icon} />
      <b>{title}</b>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

/* ───────────────────────── butoane ───────────────────────── */

export function ButtonLink({
  href,
  icon,
  variant = "gho",
  small,
  children,
}: {
  href: string;
  icon?: IconName;
  variant?: "pri" | "dark" | "out" | "gho" | "grn" | "red";
  small?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`f-bt f-${variant}${small ? " f-s" : ""}`}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </Link>
  );
}

export function Buttons({ children }: { children: ReactNode }) {
  return <div className="f-bts">{children}</div>;
}

/* ───────────────────────── diverse ───────────────────────── */

export function Progress({ percent, onDark }: { percent: number; onDark?: boolean }) {
  return (
    <div className={onDark ? "f-prg f-on-dark" : "f-prg"}>
      <i style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

/** Filtrele orizontale — linkuri, nu stare de client: fiecare filtru e o adresă. */
export function Filters({
  options,
  current,
  hrefFor,
}: {
  options: { value: string; label: string }[];
  current: string;
  hrefFor: (value: string) => string;
}) {
  return (
    <div className="f-flt">
      {options.map((option) => (
        <Link
          key={option.value}
          href={hrefFor(option.value)}
          className={option.value === current ? "f-on" : undefined}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <div className="f-fld">
      {label ? <span className="f-lab">{label}</span> : null}
      {children}
    </div>
  );
}

/** Inițialele, pentru avatarul pătrat. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const ZILE = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];
const LUNI = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

export function longDate(date: Date): string {
  return `${ZILE[date.getDay()]}, ${date.getDate()} ${LUNI[date.getMonth()]}`;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${LUNI[m - 1]}`;
}
