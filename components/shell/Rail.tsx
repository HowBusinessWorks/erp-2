"use client";

import clsx from "clsx";
import {
  ArrowLeftRight,
  BarChart3,
  Banknote,
  Boxes,
  Calculator,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Hammer,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Library,
  ListTodo,
  Package,
  PackageCheck,
  PanelLeft,
  Plug,
  Receipt,
  Route,
  SearchCheck,
  Search,
  ShieldCheck,
  ShoppingCart,
  Target,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { openCommandPalette } from "@/components/shell/CommandPalette";
import type { NavGroup, NavIcon } from "@/lib/navigation";
import type { Signal } from "@/lib/notification-types";

/**
 * Bara de navigație — coloană închisă la culoare, lipită de marginea stângă.
 * Contrastul cu hârtia caldă a conținutului e ce dă aplicației identitatea;
 * tot ea ține navigația vizibilă permanent, fără hamburger.
 *
 * Contoarele de pe intrări nu sunt inventate: sunt semnalele calculate în
 * `lib/notifications.ts`, repartizate după adresa la care duc.
 */

const ICONS: Record<NavIcon, LucideIcon> = {
  panou: LayoutDashboard,
  contracte: FileSignature,
  obiective: Target,
  cereri: Inbox,
  tichete: KanbanSquare,
  backlog: ListTodo,
  lucrari: Hammer,
  cost: Receipt,
  realocari: ArrowLeftRight,
  perioade: CalendarCheck,
  devize: Calculator,
  pachete: Package,
  situatii: FileSpreadsheet,
  garantii: ShieldCheck,
  stoc: Boxes,
  consum: ClipboardList,
  achizitii: ShoppingCart,
  receptii: PackageCheck,
  utilaje: Truck,
  solicitari: ClipboardCheck,
  unelte: Wrench,
  transporturi: Route,
  concedii: CalendarDays,
  documente: FileText,
  rapoarte: BarChart3,
  inspectii: SearchCheck,
  facturi: Banknote,
  integrari: Plug,
  nomenclatoare: Library,
};

const MINI_KEY = "damina.rail.mini";

/** Semnalele se repartizează pe intrarea cu adresa cea mai lungă care le prinde. */
function countsFor(groups: NavGroup[], signals: Signal[]) {
  const hrefs = groups
    .flatMap((g) => g.items)
    .filter((i) => !i.stub)
    .map((i) => i.href)
    .sort((a, b) => b.length - a.length);

  const counts: Record<string, { total: number; critic: boolean }> = {};
  for (const s of signals) {
    const match = hrefs.find((h) => s.href === h || s.href.startsWith(`${h}/`) || s.href.startsWith(`${h}?`));
    if (!match) continue;
    const cell = (counts[match] ??= { total: 0, critic: false });
    cell.total += 1;
    if (s.severity === "critic") cell.critic = true;
  }
  return counts;
}

export function Rail({
  groups,
  firmName,
  userName,
  roleLabel,
  signals = [],
}: {
  groups: NavGroup[];
  firmName: string;
  userName: string;
  roleLabel: string;
  signals?: Signal[];
}) {
  const pathname = usePathname();
  const [mini, setMini] = useState(false);

  useEffect(() => {
    // Citim o stare care traieste in afara React (localStorage / atributul de pe <html>).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMini(window.localStorage.getItem(MINI_KEY) === "1");
  }, []);

  function toggleMini() {
    setMini((v) => {
      window.localStorage.setItem(MINI_KEY, v ? "0" : "1");
      return !v;
    });
  }

  const counts = countsFor(groups, signals);
  const initials = userName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <nav
      data-print="hide"
      className={clsx(
        "flex h-full shrink-0 flex-col bg-rail text-ink-rail transition-[width] duration-200 ease-out",
        mini ? "w-16" : "w-[244px]",
      )}
    >
      {/* siglă */}
      <div className="flex items-center gap-[11px] border-b border-white/[0.06] px-3.5 py-[15px]">
        <div className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-gradient-to-br from-[#3E7FB8] to-[#1B4570] font-narrow text-base font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.22)]">
          D
        </div>
        {mini ? null : (
          <div className="min-w-0">
            <b className="block font-narrow text-[15.5px] font-bold uppercase leading-[1.15] tracking-[0.14em] text-white">
              Damina
            </b>
            <span className="block truncate text-[10.5px] tracking-wide text-ink-rail-2">
              {firmName}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={toggleMini}
          aria-label={mini ? "Extinde navigația" : "Restrânge navigația"}
          className={clsx(
            "grid size-7 shrink-0 place-items-center rounded-chip text-ink-rail-2 transition-colors hover:bg-white/10 hover:text-white",
            mini ? "hidden" : "ml-auto",
          )}
        >
          <PanelLeft size={16} strokeWidth={1.7} />
        </button>
      </div>

      {/* căutare */}
      <button
        type="button"
        onClick={openCommandPalette}
        className={clsx(
          "mx-2.5 mb-1.5 mt-[11px] flex h-[34px] items-center gap-2.5 rounded-ctl border border-white/[0.05] bg-white/[0.055] px-2.5 text-[13px] text-ink-rail-2 transition-colors hover:bg-white/10 hover:text-ink-rail",
          mini && "justify-center px-0",
        )}
      >
        <Search size={15} strokeWidth={2} className="shrink-0" />
        {mini ? null : (
          <>
            <span>Caută sau execută</span>
            <span className="ml-auto rounded border border-white/15 px-1.5 text-[10px]">
              Ctrl K
            </span>
          </>
        )}
      </button>

      <div className="grow overflow-y-auto py-1.5">
        {groups.map((group) => (
          <div key={group.label} className="mb-1">
            {mini ? (
              <div aria-hidden className="mx-3 my-2 h-px bg-white/[0.07]" />
            ) : (
              <div className="px-[18px] pb-1.5 pt-3 font-narrow text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-rail-2">
                {group.label}
              </div>
            )}
            <ul>
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = ICONS[item.icon];
                const count = counts[item.href];

                /* Intrarea fără ecran se VEDE — altfel harta aplicației pare mai mică
                   decât e. Dar nu duce nicăieri: un link care dă 404 e mai rău decât
                   unul care spune că urmează. */
                if (item.stub) {
                  return (
                    <li key={item.href}>
                      <span
                        title="Ecranul urmează — vezi PLAN.md §5"
                        className={clsx(
                          "mx-2 my-px flex cursor-default items-center gap-[11px] rounded-ctl px-2.5 py-[7px] text-[13px] text-ink-rail-2/60",
                          mini && "justify-center px-0",
                        )}
                      >
                        <Icon size={17} strokeWidth={1.8} className="shrink-0 opacity-75" />
                        {mini ? null : (
                          <>
                            <span className="truncate">{item.label}</span>
                            <span className="ml-auto shrink-0 rounded border border-white/15 px-1 text-[9px] uppercase tracking-wider">
                              urmează
                            </span>
                          </>
                        )}
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={mini ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "relative mx-2 my-px flex items-center gap-[11px] rounded-ctl px-2.5 py-[7px] text-[13px] transition-colors duration-[130ms]",
                        mini && "justify-center px-0",
                        active
                          ? "bg-white/10 font-medium text-white"
                          : "text-ink-rail hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      {active ? (
                        <span
                          aria-hidden
                          className="absolute -left-2 bottom-[7px] top-[7px] w-[3px] rounded-r-[3px] bg-[#5A9BD6]"
                        />
                      ) : null}
                      <Icon
                        size={17}
                        strokeWidth={1.8}
                        className={clsx("shrink-0", active ? "text-[#8FBEE8]" : "opacity-75")}
                      />
                      {mini ? null : <span className="truncate">{item.label}</span>}
                      {!mini && count ? (
                        <span
                          className={clsx(
                            "ml-auto grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full px-1.5 text-[10px] font-semibold text-white",
                            count.critic ? "bg-[#A64832]" : "bg-white/[0.11]",
                          )}
                        >
                          {count.total}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* contul, în subsol */}
      <div className="border-t border-white/[0.06] p-2.5">
        <div
          className={clsx(
            "flex w-full items-center gap-2.5 rounded-ctl p-[7px] text-left",
            mini && "justify-center p-0 py-1.5",
          )}
        >
          <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#3C4855] to-[#2A323C] text-tiny font-semibold text-[#DDE3EA]">
            {initials || "—"}
          </span>
          {mini ? null : (
            <span className="min-w-0">
              <b className="block truncate text-[12.5px] font-medium text-white">{userName}</b>
              <span className="block truncate text-[10.5px] text-ink-rail-2">{roleLabel}</span>
            </span>
          )}
        </div>
        {mini ? (
          <button
            type="button"
            onClick={toggleMini}
            aria-label="Extinde navigația"
            className="mt-1 grid h-7 w-full place-items-center rounded-chip text-ink-rail-2 transition-colors hover:bg-white/10 hover:text-white"
          >
            <PanelLeft size={16} strokeWidth={1.7} />
          </button>
        ) : null}
      </div>
    </nav>
  );
}
