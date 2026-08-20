"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { pvTemplates } from "@/lib/db/schema";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import type { TemplateField } from "@/lib/pv-templates";

/**
 * Ecranul 33 — șabloanele de PV.
 *
 * Câmpurile se așază PROCENTUAL față de pagină, nu în puncte fixe. Un PDF scanat la
 * 200 dpi și unul la 300 dpi au același câmp în același loc procentual și în locuri
 * complet diferite în puncte. Cu procente, șablonul supraviețuiește rescanării.
 */
export async function saveTemplateFields(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "nomenclatoare.editeaza")) return;

  const templateId = String(formData.get("templateId") ?? "");
  const payload = String(formData.get("fields") ?? "");
  if (!templateId || !payload) return;

  let fields: TemplateField[];
  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) return;
    fields = parsed
      .filter((f) => f && typeof f.key === "string" && f.key.trim() !== "")
      .map((f) => ({
        key: String(f.key).trim(),
        label: String(f.label ?? f.key).trim(),
        // procente, prinse între 0 și 100 — un câmp în afara paginii nu se tipărește
        x: Math.min(100, Math.max(0, Number(f.x) || 0)),
        y: Math.min(100, Math.max(0, Number(f.y) || 0)),
        width: Math.min(100, Math.max(2, Number(f.width) || 20)),
        kind: ["text", "data", "numar", "semnatura"].includes(f.kind) ? f.kind : "text",
      }));
  } catch {
    return;
  }

  await db.update(pvTemplates).set({ fields }).where(eq(pvTemplates.id, templateId));

  revalidatePath("/documente/sabloane");
}
