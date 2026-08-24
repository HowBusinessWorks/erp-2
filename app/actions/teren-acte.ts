"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql as raw } from "drizzle-orm";

import { db } from "@/lib/db";
import { handoverProtocols, mediaSlots, pvDocuments, tools } from "@/lib/db/schema";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

/**
 * Actele făcute din teren: procesul verbal de lucrare și cel de unelte.
 *
 * Semnătura se desenează cu degetul și pleacă ca imagine `data:` în `signatureImage` —
 * același câmp pe care îl folosește și semnarea prin link tokenizat de la birou. Nu
 * inventăm un al doilea mecanism de semnat pentru că omul e pe telefon.
 *
 * GOL CUNOSCUT, moștenit: nu se calculează hash de conținut la semnare (PLAN.md §7).
 */

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * PV nou de pe șantier.
 *
 * Cine semnează și ce s-a constatat intră în `values`, jsonb — șablonul decide cum se
 * așază pe hârtie, prin câmpurile lui procentuale (ecranul 33). Ecranul de teren nu are
 * voie să știe unde cade fiecare câmp pe pagina A4.
 */
export async function createFieldPv(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const templateId = String(formData.get("templateId") ?? "");
  const workUnitId = String(formData.get("workUnitId") ?? "") || null;
  if (!templateId) return;

  const signature = String(formData.get("signature") ?? "");
  const signed = signature.startsWith("data:image");

  const [doc] = await db
    .insert(pvDocuments)
    .values({
      templateId,
      code: `PV-${Date.now().toString().slice(-6)}`,
      workUnitId,
      status: signed ? "trimis" : "draft",
      values: {
        day: String(formData.get("day") ?? today()),
        stage: String(formData.get("stageName") ?? ""),
        subject: String(formData.get("subject") ?? "").trim(),
        signers: formData.getAll("signer").map(String),
        author: session.name,
      },
      signerName: signed ? session.name : null,
      signatureImage: signed ? signature : null,
      signedAt: signed ? new Date() : null,
      activity: [{ at: new Date().toISOString(), what: signed ? "semnat pe teren" : "ciornă din teren" }],
    })
    .returning();

  const photos = Number(formData.get("photoCount") ?? 0);
  if (photos > 0) {
    await db.insert(mediaSlots).values(
      Array.from({ length: photos }, (_, i) => ({
        ownerType: "pv" as const,
        ownerId: doc.id,
        workUnitId,
        slot: "pv" as const,
        kind: "foto" as const,
        label: String(i + 1),
        createdBy: session.id,
      })),
    );
  }

  revalidatePath("/documente");
  if (workUnitId) revalidatePath(`/teren/lucrare/${workUnitId}`);
  redirect(workUnitId ? `/teren/lucrare/${workUnitId}?f=acte` : "/teren");
}

/**
 * PV-ul de unelte, în două etape care nu se pot amesteca.
 *
 * La PRIMIRE se consemnează starea fiecărei unelte și se blochează — altfel, la predare,
 * cel care a stricat ceva ar putea rescrie starea de la început. La PREDARE se compară
 * cu starea blocată; ce e diferit intră în evidența depozitului.
 */
export async function saveToolProtocol(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const id = String(formData.get("protocolId") ?? "");
  const phase = String(formData.get("phase") ?? "primire");
  if (!id) return;

  const signature = String(formData.get("signature") ?? "");
  const hasSignature = signature.startsWith("data:image");
  const condition = String(formData.get("condition") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (phase === "primire") {
    await db
      .update(handoverProtocols)
      .set({
        handoverCondition: condition,
        handoverNotes: notes,
        handoverSignature: hasSignature ? signature : null,
        handoverLocked: true,
      })
      .where(eq(handoverProtocols.id, id));
  } else {
    const [protocol] = await db
      .update(handoverProtocols)
      .set({
        returnDate: today(),
        returnByName: session.name,
        returnCondition: condition,
        returnIssues: notes,
        returnSignature: hasSignature ? signature : null,
        status: "inchis",
      })
      .where(eq(handoverProtocols.id, id))
      .returning();

    // unealta se întoarce în depozit: nu mai e la nimeni
    if (protocol?.toolId) {
      await db
        .update(tools)
        .set({
          holderUserId: null,
          status: condition === "defecta" ? "la_reparatii" : "activ",
        })
        .where(eq(tools.id, protocol.toolId));
    }
  }

  const photos = Number(formData.get("photoCount") ?? 0);
  if (photos > 0) {
    await db.insert(mediaSlots).values(
      Array.from({ length: photos }, (_, i) => ({
        ownerType: "tool_protocol" as const,
        ownerId: id,
        slot: "unealta" as const,
        kind: "foto" as const,
        label: `${phase} ${i + 1}`,
        createdBy: session.id,
      })),
    );
  }

  revalidatePath(`/teren/pv/unelte/${id}`);
  revalidatePath("/unelte");
  redirect("/teren/comenzi");
}

/**
 * Poze declarate pentru seturile Înainte / După ale unei lucrări.
 *
 * Prima și ultima „etapă" nu sunt etape de lucru — sunt două seturi de poze din aceleași
 * unghiuri. Se folosesc la recepție și la oferte, deci merită să existe ca rânduri, nu ca
 * niște fișiere pierdute în folderul lucrării.
 */
export async function declareWorkPhotos(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const workUnitId = String(formData.get("workUnitId") ?? "");
  const slot = String(formData.get("slot") ?? "inainte") as "inainte" | "dupa";
  const count = Number(formData.get("photoCount") ?? 0);
  const videos = Number(formData.get("videoCount") ?? 0);
  if (!workUnitId || count + videos <= 0) return;

  const labels = formData.getAll("label").map(String);

  await db.insert(mediaSlots).values([
    ...Array.from({ length: count }, (_, i) => ({
      ownerType: "work_unit" as const,
      ownerId: workUnitId,
      workUnitId,
      slot,
      kind: "foto" as const,
      label: labels[i] ?? String(i + 1),
      createdBy: session.id,
    })),
    ...Array.from({ length: videos }, () => ({
      ownerType: "work_unit" as const,
      ownerId: workUnitId,
      workUnitId,
      slot,
      kind: "video" as const,
      label: "film",
      createdBy: session.id,
    })),
  ]);

  revalidatePath(`/teren/lucrare/${workUnitId}/inainte-dupa`);
}

/** Ștergerea unui slot declarat greșit — până se leagă R2, e singura corecție posibilă. */
export async function removeMediaSlot(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "teren.opereaza")) return;

  const id = String(formData.get("mediaId") ?? "");
  if (!id) return;

  const [row] = await db
    .delete(mediaSlots)
    .where(raw`${mediaSlots.id} = ${id} and ${mediaSlots.createdBy} = ${session.id}`)
    .returning();

  if (row?.workUnitId) revalidatePath(`/teren/lucrare/${row.workUnitId}/inainte-dupa`);
}
