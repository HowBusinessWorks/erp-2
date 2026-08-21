"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "./FieldIcons";

/**
 * Bara de jos, sub degetul mare. Trei tab-uri, nu șase: tot ce se poate ajunge din
 * „Azi" sau din meniul unui loc nu merită un buton propriu.
 *
 * Un ecran aparține tab-ului sub care a fost deschis — de asta apartenența se decide
 * pe prefixul căii, nu pe potrivire exactă.
 */

const TABS: { href: string; icon: IconName; label: string; owns: (path: string) => boolean }[] = [
  {
    href: "/teren",
    icon: "sun",
    label: "Azi",
    owns: (p) => p === "/teren" || p.startsWith("/teren/notificari") || p.startsWith("/teren/cereri"),
  },
  {
    href: "/teren/locuri",
    icon: "pin",
    label: "Locuri",
    owns: (p) =>
      p.startsWith("/teren/locuri") ||
      p.startsWith("/teren/jurnal") ||
      p.startsWith("/teren/necesar") ||
      p.startsWith("/teren/constatare") ||
      p.startsWith("/teren/inventar") ||
      p.startsWith("/teren/consum") ||
      p.startsWith("/teren/situatii") ||
      p.startsWith("/teren/utilaje") ||
      /^\/teren\/[0-9a-f-]{36}$/.test(p),
  },
  {
    href: "/teren/eu",
    icon: "user",
    label: "Eu",
    owns: (p) => p.startsWith("/teren/eu") || p.startsWith("/teren/concediu") || p.startsWith("/teren/pontaj"),
  },
];

export function FieldTabs() {
  const pathname = usePathname() ?? "/teren";

  return (
    <nav className="f-tabs">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={tab.owns(pathname) ? "f-tab f-on" : "f-tab"}
          aria-current={tab.owns(pathname) ? "page" : undefined}
        >
          <Icon name={tab.icon} />
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
