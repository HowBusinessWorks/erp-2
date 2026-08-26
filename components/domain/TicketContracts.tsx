"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge, EmptyState } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/tickets";

export type ContractCard = {
  id: string;
  code: string;
  name: string;
  type: string;
  clientName: string | null;
  open: number;
  urgent: number;
  total: number;
  stages: number;
  lastAt: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  mentenanta: "Mentenanță",
  individual_deviz: "Deviz",
  individual_inversa: "Inversă",
};

/** Lista de contracte e mică — filtrarea se face în memorie, fără drum la server. */
export function TicketContracts({ contracts }: { contracts: ContractCard[] }) {
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return contracts;
    return contracts.filter(
      (c) =>
        c.code.toLowerCase().includes(needle) ||
        c.name.toLowerCase().includes(needle) ||
        (c.clientName ?? "").toLowerCase().includes(needle),
    );
  }, [contracts, q]);

  if (contracts.length === 0) {
    return (
      <EmptyState
        title="Niciun contract"
        hint="Tichetele stau pe contracte. Creează un contract, apoi revino aici."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative w-full max-w-sm">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Caută contract sau client…"
          aria-label="Caută contract"
          className="h-[38px] w-full rounded-ctl border border-rule-strong bg-sheet pl-9 pr-3 text-[13.5px] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-3 focus:border-blueprint focus:shadow-[0_0_0_3px_var(--acc-soft)]"
        />
      </div>

      {shown.length === 0 ? (
        <p className="text-tiny text-ink-2">Niciun contract nu se potrivește cu „{q}".</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((c) => (
          <Link
            key={c.id}
            href={`/tichete/${c.id}`}
            className="flex flex-col rounded-sheet border border-rule bg-sheet p-4 shadow-flat transition hover:border-blueprint-line hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint motion-reduce:transition-none"
          >
            <div className="flex items-start gap-2">
              <span className="tabular font-narrow text-[15px] font-semibold text-ink">
                {c.code}
              </span>
              <Badge className="ml-auto">{TYPE_LABEL[c.type] ?? c.type}</Badge>
            </div>
            <p className="mt-0.5 line-clamp-1 text-[12.5px] text-ink-2">{c.name}</p>
            {c.clientName ? (
              <p className="line-clamp-1 text-[11.5px] text-ink-3">{c.clientName}</p>
            ) : null}

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Figure label="Deschise" value={c.open} />
              <Figure label="Urgente" value={c.urgent} tone={c.urgent > 0 ? "over" : undefined} />
              <Figure label="Total" value={c.total} muted />
            </div>

            <div className="mt-4 flex items-center gap-2 border-t border-rule pt-2.5">
              {c.stages === 0 ? (
                <Badge tone="warn">Fără etape</Badge>
              ) : (
                <span className="text-[11px] text-ink-3">
                  {c.lastAt ? `ultimul tichet ${timeAgo(c.lastAt)}` : "niciun tichet încă"}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: number;
  tone?: "over";
  muted?: boolean;
}) {
  return (
    <div>
      <div
        className={`tabular text-2xl font-semibold leading-none ${
          tone === "over" ? "text-over" : muted ? "text-ink-3" : "text-ink"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] text-ink-3">{label}</div>
    </div>
  );
}
