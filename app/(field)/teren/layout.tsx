import { redirect } from "next/navigation";

import { FieldIconSprite } from "@/components/domain/FieldIcons";
import { FieldTabs } from "@/components/domain/FieldTabs";
import { FieldViewportFit } from "@/components/domain/FieldViewportFit";
import { getSession } from "@/lib/session";

import "./field.css";

/**
 * Interfața de teren. NU e biroul cu mai puține butoane (§18.1.1) — e un decupaj
 * separat, mobil-first, în care nu apar lei nicăieri.
 *
 * Patru tab-uri, nu șase intrări: **Azi · Lucrări · Mentenanță · Eu**. Azi e ce am de
 * făcut, Lucrări e unde lucrez, Mentenanță e inspecțiile și intervențiile, Eu e ce mă
 * privește pe mine. Orice ecran se așază sub unul din cele patru, iar bara de sus
 * spune de unde a venit — deci nu există niciodată întrebarea „unde sunt și cum mă
 * întorc".
 */
export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="f-app">
      <FieldIconSprite />
      <FieldViewportFit />
      <div className="f-main">{children}</div>
      <FieldTabs />
    </div>
  );
}
