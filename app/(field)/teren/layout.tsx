import { redirect } from "next/navigation";

import { FieldIconSprite } from "@/components/domain/FieldIcons";
import { FieldTabs } from "@/components/domain/FieldTabs";
import { getSession } from "@/lib/session";

import "./field.css";

/**
 * Interfața de teren. NU e biroul cu mai puține butoane (§18.1.1) — e un decupaj
 * separat, mobil-first, în care nu apar lei nicăieri.
 *
 * Trei tab-uri, nu șase intrări: **Azi · Locuri · Eu**. Azi e ce am de făcut, Locuri
 * e unde lucrez, Eu e ce mă privește pe mine. Orice ecran se așază sub unul din cele
 * trei, iar bara de sus spune de unde a venit — deci nu există niciodată întrebarea
 * „unde sunt și cum mă întorc".
 */
export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="f-app">
      <FieldIconSprite />
      <div className="f-main">{children}</div>
      <FieldTabs />
    </div>
  );
}
