"use client";

import clsx from "clsx";
import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { NavGroup } from "@/lib/navigation";

/**
 * Paleta de comenzi — Ctrl/⌘ K. Nu conține decât ecranele pe care rolul are voie
 * să le vadă, pentru că se hrănește din exact aceeași listă ca bara de navigație.
 *
 * Nu e o fereastră de date: nu are ce pierde la închidere, deci Escape și clicul
 * în afară o închid. Regula 4 rămâne a modalelor cu formular.
 */

const EVENT = "damina:palette";

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

type Entry = { href: string; label: string; group: string };

/** Fără diacritice și fără majuscule — „situații" trebuie găsit și cu „situatii". */
function fold(s: string) {
  return s
    .toLocaleLowerCase("ro")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[șş]/g, "s")
    .replace(/[țţ]/g, "t");
}

export function CommandPalette({ groups }: { groups: NavGroup[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo<Entry[]>(
    () =>
      groups.flatMap((g) =>
        g.items.filter((i) => !i.stub).map((i) => ({ href: i.href, label: i.label, group: g.label })),
      ),
    [groups],
  );

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return entries;
    return entries.filter((e) => fold(`${e.label} ${e.group}`).includes(q));
  }, [entries, query]);

  useEffect(() => {
    function onOpen() {
      setQuery("");
      setCursor(0);
      setOpen(true);
    }
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    }
    window.addEventListener(EVENT, onOpen);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(EVENT, onOpen);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (results.length ? (c + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (results.length ? (c - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[cursor];
      if (hit) go(hit.href);
    }
  }

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[90]" data-print="hide">
      <button
        type="button"
        aria-label="Închide paleta"
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default bg-[rgba(18,16,14,.42)] backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Caută sau execută"
        onKeyDown={onKeyDown}
        className="absolute left-1/2 top-[12vh] w-[640px] max-w-[94vw] -translate-x-1/2 overflow-hidden rounded-[13px] border border-rule bg-sheet shadow-float"
      >
        <div className="flex items-center gap-[11px] border-b border-rule px-4 py-3.5 text-ink-3">
          <Search size={17} strokeWidth={1.9} className="shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            placeholder="Sari la un ecran…"
            className="w-full border-0 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
          />
        </div>

        <div className="max-h-[46vh] overflow-y-auto p-[7px]">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-tiny text-ink-3">Niciun ecran găsit.</p>
          ) : (
            results.map((e, i) => {
              const head = e.group !== lastGroup ? ((lastGroup = e.group), e.group) : null;
              return (
                <div key={e.href}>
                  {head ? (
                    <div className="px-[11px] pb-1 pt-2 font-narrow text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-3">
                      {head}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(e.href)}
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-ctl px-[11px] py-2.5 text-left text-[13.5px]",
                      i === cursor ? "bg-blueprint-soft text-blueprint-ink" : "text-ink",
                    )}
                  >
                    <span className="truncate">{e.label}</span>
                    {i === cursor ? (
                      <CornerDownLeft size={13} strokeWidth={2} className="ml-auto shrink-0" />
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex gap-4 border-t border-rule bg-sheet-2 px-4 py-2.5 text-[11px] text-ink-3">
          <span>↑ ↓ navighează</span>
          <span>⏎ deschide</span>
          <span>Esc închide</span>
        </div>
      </div>
    </div>
  );
}
