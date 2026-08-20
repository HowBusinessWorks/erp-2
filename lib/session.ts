import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "./db";
import { users } from "./db/schema";
import type { Role } from "./permissions";

const SESSION_COOKIE = "damina_session";
const PERSPECTIVE_COOKIE = "damina_perspective";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  /** rolul EFECTIV — cel prin care se filtrează ecranele */
  role: Role;
  /** rolul real al contului; diferă de `role` doar când adminul a comutat perspectiva */
  actualRole: Role;
  firmId: string | null;
  impersonating: boolean;
};

/**
 * Prototip: sesiunea e id-ul utilizatorului într-un cookie. Fără JWT, fără refresh,
 * fără revocare. Vezi PLAN.md §0 — la producție intră auth real.
 */
export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const userId = jar.get(SESSION_COOKIE)?.value;
  if (!userId) return null;

  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row || !row.active) return null;

  const actualRole = row.role as Role;
  const perspective = jar.get(PERSPECTIVE_COOKIE)?.value as Role | undefined;
  // Doar adminul poate comuta perspectiva.
  const effective = actualRole === "admin" && perspective ? perspective : actualRole;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: effective,
    actualRole,
    firmId: row.firmId,
    impersonating: effective !== actualRole,
  };
}

/** Pentru pagini care nu au sens fără utilizator. Aruncă — layout-ul redirectează. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}

export async function setSession(userId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  jar.delete(PERSPECTIVE_COOKIE);
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(PERSPECTIVE_COOKIE);
}

export async function setPerspective(role: Role | null) {
  const jar = await cookies();
  if (!role) jar.delete(PERSPECTIVE_COOKIE);
  else jar.set(PERSPECTIVE_COOKIE, role, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
}
