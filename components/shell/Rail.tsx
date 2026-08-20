"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavGroup } from "@/lib/navigation";

/**
 * Bara de navigație — coloană închisă la culoare, lipită de marginea stângă.
 * Contrastul cu hârtia caldă a conținutului e ce dă aplicației identitatea;
 * tot ea ține navigația vizibilă permanent, fără hamburger, fără colaps.
 */
export function Rail({ groups, firmName }: { groups: NavGroup[]; firmName: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full w-56 shrink-0 flex-col bg-rail text-ink-rail">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="font-narrow text-[1.0625rem] font-bold uppercase tracking-[0.14em] text-white">
          Damina
        </div>
        <div className="mt-0.5 text-micro uppercase tracking-wider text-ink-rail-2">{firmName}</div>
      </div>

      <div className="grow overflow-y-auto py-3">
        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="px-4 pb-1.5 font-narrow text-micro font-semibold uppercase tracking-[0.11em] text-ink-rail-2">
              {group.label}
            </div>
            <ul>
              {group.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={clsx(
                        "relative block px-4 py-[0.3125rem] text-[0.8125rem] transition-colors",
                        active
                          ? "bg-white/10 font-medium text-white"
                          : "text-ink-rail hover:bg-white/5 hover:text-white",
                      )}
                    >
                      {active ? (
                        <span
                          aria-hidden
                          className="absolute inset-y-0 left-0 w-[2px] bg-white"
                        />
                      ) : null}
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
