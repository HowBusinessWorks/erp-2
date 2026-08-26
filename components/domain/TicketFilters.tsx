"use client";

import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button, Chip, Select, Toolbar } from "@/components/ui/primitives";
import type { Opt } from "@/lib/pickers";
import { DUE_FILTERS, URGENCY_LABELS, URGENCY_ORDER } from "@/lib/tickets";

/** Filtrele trăiesc în URL: board-ul filtrat e o adresă care se poate trimite mai departe. */
export function TicketFilters({
  types,
  partners,
  users,
  shown,
  total,
}: {
  types: Opt[];
  partners: Opt[];
  users: Opt[];
  shown: number;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const typed = useRef(false);

  const value = (key: string) => params.get(key) ?? "";

  function apply(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    // Panoul de detaliu nu supraviețuiește unei schimbări de filtru — ar putea dispărea din board.
    next.delete("tichet");
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  // Căutarea nu umple istoricul: `replace`, cu o pauză cât să se termine cuvântul.
  useEffect(() => {
    if (!typed.current) return;
    const t = setTimeout(() => apply({ q: q.trim() || null }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    if (!typed.current) setQ(params.get("q") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const active: { key: string; label: string }[] = [];
  if (value("q")) active.push({ key: "q", label: `„${value("q")}"` });
  if (value("tip"))
    active.push({ key: "tip", label: types.find((t) => t.value === value("tip"))?.label ?? "Tip" });
  if (value("urgenta"))
    active.push({
      key: "urgenta",
      label: URGENCY_LABELS[value("urgenta") as keyof typeof URGENCY_LABELS] ?? "Urgență",
    });
  if (value("subcontractant"))
    active.push({
      key: "subcontractant",
      label:
        value("subcontractant") === "none"
          ? "Fără subcontractant"
          : (partners.find((p) => p.value === value("subcontractant"))?.label ?? "Subcontractant"),
    });
  if (value("responsabil"))
    active.push({
      key: "responsabil",
      label:
        value("responsabil") === "none"
          ? "Fără responsabil"
          : (users.find((u) => u.value === value("responsabil"))?.label ?? "Responsabil"),
    });
  if (value("termen"))
    active.push({
      key: "termen",
      label: DUE_FILTERS.find((d) => d.value === value("termen"))?.label ?? "Termen",
    });
  if (value("ale_mele")) active.push({ key: "ale_mele", label: "Doar ale mele" });

  return (
    <div className="space-y-2">
      <Toolbar count={`${shown} tichete din ${total}`}>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3"
          />
          <input
            value={q}
            onChange={(e) => {
              typed.current = true;
              setQ(e.target.value);
            }}
            placeholder="Caută titlu, cod, descriere…"
            aria-label="Caută în tichete"
            className="h-[30px] w-56 rounded-ctl border border-rule-strong bg-sheet pl-8 pr-2.5 text-[12.5px] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-3 focus:border-blueprint focus:shadow-[0_0_0_3px_var(--acc-soft)]"
          />
        </div>

        <Select
          size="sm"
          aria-label="Tip de tichet"
          value={value("tip")}
          placeholder="Orice tip"
          className="w-36"
          onChange={(e) => apply({ tip: e.target.value || null })}
          options={[{ value: "", label: "Orice tip" }, ...types]}
        />

        <Select
          size="sm"
          aria-label="Urgență"
          value={value("urgenta")}
          placeholder="Orice urgență"
          className="w-36"
          onChange={(e) => apply({ urgenta: e.target.value || null })}
          options={[
            { value: "", label: "Orice urgență" },
            ...URGENCY_ORDER.map((u) => ({ value: u, label: URGENCY_LABELS[u] })),
          ]}
        />

        <Select
          size="sm"
          aria-label="Subcontractant"
          value={value("subcontractant")}
          placeholder="Orice subcontractant"
          className="w-44"
          onChange={(e) => apply({ subcontractant: e.target.value || null })}
          options={[
            { value: "", label: "Orice subcontractant" },
            { value: "none", label: "Neatribuit" },
            ...partners,
          ]}
        />

        <Select
          size="sm"
          aria-label="Responsabil"
          value={value("responsabil")}
          placeholder="Orice responsabil"
          className="w-40"
          onChange={(e) => apply({ responsabil: e.target.value || null })}
          options={[
            { value: "", label: "Orice responsabil" },
            { value: "none", label: "Neatribuit" },
            ...users,
          ]}
        />

        <Select
          size="sm"
          aria-label="Termen"
          value={value("termen")}
          placeholder="Orice termen"
          className="w-36"
          onChange={(e) => apply({ termen: e.target.value || null })}
          options={DUE_FILTERS}
        />

        <Chip
          href="#"
          active={Boolean(value("ale_mele"))}
          onClick={(e) => {
            e.preventDefault();
            apply({ ale_mele: value("ale_mele") ? null : "1" });
          }}
        >
          Doar ale mele
        </Chip>

        <Chip
          href="#"
          active={Boolean(value("finale"))}
          onClick={(e) => {
            e.preventDefault();
            apply({ finale: value("finale") ? null : "1" });
          }}
        >
          Arată etapele finale
        </Chip>
      </Toolbar>

      {active.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {active.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => apply({ [f.key]: null })}
              className="inline-flex items-center gap-1.5 rounded-full border border-blueprint-line bg-blueprint-soft px-2.5 py-[3px] text-[11.5px] text-blueprint-ink transition-colors hover:border-blueprint"
            >
              {f.label}
              <X aria-hidden className="size-3" />
            </button>
          ))}
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="ml-auto"
            onClick={() =>
              apply({
                q: null,
                tip: null,
                urgenta: null,
                subcontractant: null,
                responsabil: null,
                termen: null,
                ale_mele: null,
              })
            }
          >
            Șterge filtrele
          </Button>
        </div>
      ) : null}
    </div>
  );
}
