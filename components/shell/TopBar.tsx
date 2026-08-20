"use client";

import clsx from "clsx";
import { Bell, ChevronDown, Eye, LogOut } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { logout, switchPerspective } from "@/app/actions/session";
import { PERSPECTIVES, ROLE_LABELS, type Role } from "@/lib/permissions";

export function TopBar({
  userName,
  role,
  actualRole,
  impersonating,
  unread,
  period,
}: {
  userName: string;
  role: Role;
  actualRole: Role;
  impersonating: boolean;
  unread: number;
  period: string;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-rule bg-sheet px-4">
      <span className="eyebrow">{period}</span>

      {impersonating ? (
        <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-warn/40 bg-warn-soft px-2 py-0.5 text-micro font-medium text-warn">
          <Eye size={11} strokeWidth={2.5} />
          Vezi ca {ROLE_LABELS[role]}
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          className="relative flex h-8 w-8 items-center justify-center rounded-[3px] text-ink-2 transition-colors hover:bg-sunk hover:text-ink"
          aria-label={`Notificări${unread ? ` (${unread} necitite)` : ""}`}
        >
          <Bell size={16} strokeWidth={1.75} />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-over px-1 text-[0.5625rem] font-bold leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>

        {actualRole === "admin" ? (
          <PerspectiveMenu current={role} />
        ) : (
          <span className="px-2 text-tiny text-ink-2">{ROLE_LABELS[role]}</span>
        )}

        <span aria-hidden className="mx-1 h-5 w-px bg-rule" />

        <span className="text-tiny font-medium text-ink">{userName}</span>

        <form action={logout}>
          <button
            type="submit"
            className="flex h-8 w-8 items-center justify-center rounded-[3px] text-ink-2 transition-colors hover:bg-sunk hover:text-ink"
            aria-label="Ieși din cont"
          >
            <LogOut size={15} strokeWidth={1.75} />
          </button>
        </form>
      </div>
    </header>
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
        className="flex h-8 items-center gap-1 rounded-[3px] px-2 text-tiny text-ink-2 transition-colors hover:bg-sunk hover:text-ink"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {ROLE_LABELS[current]}
        <ChevronDown size={13} strokeWidth={2} className={clsx(open && "rotate-180")} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-9 z-50 w-64 sheet py-1 shadow-[0_8px_24px_-12px_rgba(24,20,16,0.35)]"
        >
          <div className="eyebrow px-3 py-1.5">Vezi aplicația ca</div>
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
                "flex w-full flex-col items-start px-3 py-1.5 text-left transition-colors hover:bg-sunk",
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
