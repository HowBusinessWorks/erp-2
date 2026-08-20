"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { Role } from "@/lib/permissions";
import { clearSession, setPerspective, setSession } from "@/lib/session";

export async function login(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Completează emailul și parola." };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // Prototip: parola se compară în clar, din seed. Vezi PLAN.md §7.
  if (!user || user.password !== password || !user.active) {
    return { error: "Email sau parolă greșită." };
  }

  await setSession(user.id);
  redirect(user.role === "sef_santier" ? "/teren" : "/panou");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}

/** Comutatorul de perspectivă — doar pentru admin, verificat în getSession(). */
export async function switchPerspective(role: Role | null) {
  await setPerspective(role);
  revalidatePath("/", "layout");
}

/** Ieșirea din perspectiva de teren, înapoi la birou. Doar pentru admin. */
export async function backToOffice() {
  await setPerspective(null);
  redirect("/panou");
}
