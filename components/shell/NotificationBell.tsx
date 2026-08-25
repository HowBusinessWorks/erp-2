"use client";

import clsx from "clsx";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SIGNAL_LABEL, type Signal } from "@/lib/notification-types";

const DOT: Record<Signal["severity"], string> = {
  critic: "bg-over",
  atentie: "bg-warn",
  info: "bg-ink-3",
};

/**
 * Clopoțelul arată semnale calculate acum, nu rânduri scrise cândva. De asta nu are
 * „marchează ca citit": n-ai ce să citești, ai ce să rezolvi. Un semnal dispare când
 * dispare cauza — bugetul coboară sub 80%, situația e aprobată, PV-ul e semnat.
 */
export function NotificationBell({ signals }: { signals: Signal[] }) {
  const [open, setOpen] = useState(false);
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

  const critical = signals.filter((s) => s.severity === "critic").length;
  const count = signals.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative grid size-[34px] place-items-center rounded-ctl text-ink-2 transition-colors duration-[130ms] hover:bg-sunk hover:text-ink"
        aria-label={`Semnale${count ? ` (${count})` : ""}`}
      >
        <Bell size={17} strokeWidth={1.8} />
        {count > 0 ? (
          <span
            className={clsx(
              "absolute right-[5px] top-[5px] grid h-4 min-w-4 place-items-center rounded-full border-2 border-sheet px-1 text-[10px] font-bold leading-none text-white",
              critical > 0 ? "bg-over" : "bg-warn",
            )}
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="sheet absolute right-0 top-11 z-50 w-[390px] overflow-hidden shadow-lift"
        >
          <div className="flex items-baseline justify-between border-b border-rule bg-sheet-2 px-4 py-2.5">
            <span className="eyebrow">Semnale</span>
            <span className="text-micro text-ink-3">
              {count === 0 ? "nimic de rezolvat" : `${count} · recalculate acum`}
            </span>
          </div>

          {count === 0 ? (
            <div className="flex items-center gap-2 px-3 py-6 text-tiny text-ink-2">
              <Check size={14} strokeWidth={2} className="text-fill" />
              Niciun plafon depășit, nicio scadență apropiată.
            </div>
          ) : (
            <ul className="max-h-[26rem] overflow-y-auto">
              {signals.map((s, i) => (
                <li key={`${s.kind}-${i}`}>
                  <Link
                    href={s.href}
                    onClick={() => setOpen(false)}
                    className="flex gap-3 border-b border-rule px-4 py-3 transition-colors last:border-b-0 hover:bg-sheet-2"
                  >
                    <span
                      aria-hidden
                      className={clsx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", DOT[s.severity])}
                    />
                    <span className="min-w-0">
                      <span className="block text-micro uppercase tracking-wide text-ink-3">
                        {SIGNAL_LABEL[s.kind]}
                      </span>
                      <span className="block text-tiny font-medium leading-snug text-ink">
                        {s.title}
                      </span>
                      {s.body ? (
                        <span className="mt-0.5 block text-micro leading-snug text-ink-2">
                          {s.body}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
