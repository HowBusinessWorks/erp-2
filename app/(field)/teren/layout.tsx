import Link from "next/link";
import { redirect } from "next/navigation";

import { backToOffice, logout } from "@/app/actions/session";
import { FIELD_NAVIGATION } from "@/lib/navigation";
import { getSession } from "@/lib/session";

/**
 * Interfața de teren. NU e biroul cu mai puține butoane (§18.1.1) — e un decupaj
 * separat, mobil-first, în care nu apar lei nicăieri.
 */
export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-20 bg-rail px-4 py-3 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-narrow text-[0.9375rem] font-bold uppercase tracking-[0.14em]">
              Damina · Teren
            </div>
            <div className="text-micro text-ink-rail-2">{session.name}</div>
          </div>
          <div className="flex items-center gap-3">
            {/* Adminul care s-a uitat „ca șef de șantier" trebuie să se poată întoarce.
                Fără asta rămâne blocat pe teren până expiră cookie-ul de perspectivă. */}
            {session.impersonating ? (
              <form action={backToOffice}>
                <button
                  type="submit"
                  className="rounded-[3px] border border-white/25 px-2 py-1 text-micro uppercase tracking-wider text-white"
                >
                  ← Înapoi la birou
                </button>
              </form>
            ) : null}
            <form action={logout}>
              <button type="submit" className="text-micro uppercase tracking-wider text-ink-rail-2">
                Ieși
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="grow pb-20">{children}</main>

      {/* Bara de jos, la degete. Maximum 3 atingeri de la aici până la trimis. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-rule bg-sheet">
        {FIELD_NAVIGATION.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 px-1 py-2.5 text-center font-narrow text-micro font-semibold uppercase tracking-wide text-ink-2 hover:bg-sunk hover:text-ink"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
