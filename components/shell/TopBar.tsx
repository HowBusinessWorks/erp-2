"use client";

import clsx from "clsx";
import {
  AlignJustify,
  Calendar,
  ChevronDown,
  Eye,
  LogOut,
  Moon,
  Rows3,
  Search,
  Sun,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";

import { logout, switchPerspective } from "@/app/actions/session";
import { CommandPalette, openCommandPalette } from "@/components/shell/CommandPalette";
import { NotificationBell } from "@/components/shell/NotificationBell";
import type { NavGroup } from "@/lib/navigation";
import type { Signal } from "@/lib/notification-types";
import { PERSPECTIVES, ROLE_LABELS, type Role } from "@/lib/permissions";

const THEME_KEY = "damina.theme";
const DENSITY_KEY = "damina.density";

const ICON_BTN =
  "grid size-[34px] place-items-center rounded-ctl text-ink-2 transition-colors duration-[130ms] hover:bg-sunk hover:text-ink";

export function TopBar({
  userName,
  role,
  actualRole,
  impersonating,
  signals,
  period,
  groups,
}: {
  userName: string;
  role: Role;
  actualRole: Role;
  impersonating: boolean;
  signals: Signal[];
  period: string;
  groups: NavGroup[];
}) {
  return (
    <header
      data-print="hide"
      className="relative z-30 flex h-14 shrink-0 items-center gap-2.5 border-b border-rule bg-sheet px-4"
    >
      <Breadcrumbs groups={groups} />

      <button
        type="button"
        onClick={openCommandPalette}
        className="mx-auto hidden h-9 w-[min(430px,38vw)] items-center gap-2.5 rounded-ctl border border-rule bg-sheet-2 px-3 text-[13px] text-ink-3 transition-colors duration-[130ms] hover:border-rule-strong hover:bg-sheet lg:flex"
      >
        <Search size={15} strokeWidth={1.9} className="shrink-0" />
        <span>Caută contract, lucrare, document…</span>
        <span className="ml-auto rounded border border-rule-strong px-1.5 text-[10px]">Ctrl K</span>
      </button>

      <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
        {impersonating ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warn-line bg-warn-soft px-2.5 py-1 text-micro font-medium text-warn">
            <Eye size={11} strokeWidth={2.5} />
            Vezi ca {ROLE_LABELS[role]}
          </span>
        ) : null}

        <span className="hidden h-[34px] items-center gap-2 rounded-ctl border border-rule bg-sheet-2 px-3 text-[13px] text-ink-2 md:flex">
          <Calendar size={14} strokeWidth={1.8} />
          <b className="font-medium text-ink">{period}</b>
        </span>

        <DensityToggle />
        <ThemeToggle />

        <NotificationBell signals={signals} />

        {actualRole === "admin" ? (
          <PerspectiveMenu current={role} />
        ) : (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-blueprint-line bg-blueprint-soft px-3 text-[12.5px] font-medium text-blueprint-ink">
            <Eye size={13} strokeWidth={1.9} />
            {ROLE_LABELS[role]}
          </span>
        )}

        <span aria-hidden className="mx-0.5 h-5 w-px bg-rule" />

        <span className="hidden text-tiny font-medium text-ink xl:inline">{userName}</span>

        <form action={logout}>
          <button type="submit" className={ICON_BTN} aria-label="Ieși din cont">
            <LogOut size={15} strokeWidth={1.75} />
          </button>
        </form>
      </div>

      <CommandPalette groups={groups} />
    </header>
  );
}

/** Unde ești, pe scurt: grupul din bara de navigație și ecranul curent. */
function Breadcrumbs({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const match = groups
    .flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  if (!match) return <span className="text-[13px] text-ink-3">Damina</span>;

  const deeper = pathname !== match.href;

  return (
    <nav
      aria-label="Traseu"
      className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[13px] text-ink-3"
    >
      <span>{match.group}</span>
      <span aria-hidden>/</span>
      <b className={clsx("font-medium", deeper ? "text-ink-2" : "text-ink")}>{match.label}</b>
      {deeper ? (
        <>
          <span aria-hidden>/</span>
          <b className="truncate font-medium text-ink">detaliu</b>
        </>
      ) : null}
    </nav>
  );
}

/** Tema. Se ține pe `<html data-theme>`, ca să nu clipească la navigare. */
function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // Citim o stare care traieste in afara React (localStorage / atributul de pe <html>).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(THEME_KEY, next);
    setDark(!dark);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={ICON_BTN}
      aria-label={dark ? "Temă deschisă" : "Temă închisă"}
      title="Comută tema"
    >
      {dark ? <Sun size={17} strokeWidth={1.8} /> : <Moon size={17} strokeWidth={1.8} />}
    </button>
  );
}

/** Densitatea tabelelor — aceleași ecrane, mai multe rânduri pe ecran. */
function DensityToggle() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    // Citim o stare care traieste in afara React (localStorage / atributul de pe <html>).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompact(document.documentElement.dataset.density === "compact");
  }, []);

  function toggle() {
    const next = compact ? "normal" : "compact";
    document.documentElement.dataset.density = next;
    window.localStorage.setItem(DENSITY_KEY, next);
    setCompact(!compact);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={ICON_BTN}
      aria-label="Densitatea tabelelor"
      title="Densitatea tabelelor"
    >
      {compact ? <Rows3 size={17} strokeWidth={1.8} /> : <AlignJustify size={17} strokeWidth={1.8} />}
    </button>
  );
}

/**
 * Comutatorul de perspectivă. Un demo trebuie să poată arăta în 10 secunde
 * că șeful de șantier nu vede prețuri — nu prin logout și login cu alt cont.
 */
function PerspectiveMenu({ current }: { current: Role }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-full border border-blueprint-line bg-blueprint-soft px-3 text-[12.5px] font-medium text-blueprint-ink transition-colors duration-[130ms] hover:brightness-[0.98]"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Eye size={13} strokeWidth={1.9} />
        {ROLE_LABELS[current]}
        <ChevronDown size={13} strokeWidth={2} className={clsx(open && "rotate-180")} />
      </button>

      {open ? (
        <div
          role="menu"
          className="sheet absolute right-0 top-10 z-50 w-64 overflow-hidden py-1 shadow-lift"
        >
          <div className="eyebrow px-3 py-2">Vezi aplicația ca</div>
          {PERSPECTIVES.map((p) => (
            <button
              key={p.role}
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  await switchPerspective(p.role === "admin" ? null : p.role);
                  setOpen(false);
                });
              }}
              className={clsx(
                "flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-sunk",
                p.role === current && "bg-blueprint-soft",
              )}
            >
              <span className="text-tiny font-medium text-ink">{p.label}</span>
              <span className="text-micro text-ink-3">{p.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
