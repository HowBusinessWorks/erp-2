"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql as raw } from "drizzle-orm";

import { db } from "@/lib/db";
import { handoverProtocols, mediaSlots, pvDocuments, tools } from "@/lib/db/schema";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { pickedFiles, uploadToStorage } from "@/lib/storage";

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

  const files = pickedFiles(formData);
  if (files.length > 0) {
    const rows: (typeof mediaSlots.$inferInsert)[] = [];
    for (const [i, file] of files.entries()) {
      const video = file.type.startsWith("video/");
      rows.push({
        ownerType: "pv",
        ownerId: doc.id,
        workUnitId,
        slot: "pv",
        kind: video ? "video" : "foto",
        label: video ? "film" : String(i + 1),
        storageKey: await uploadToStorage(file, "teren/pv"),
        createdBy: session.id,
      });
    }
    await db.insert(mediaSlots).values(rows);
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

  const files = pickedFiles(formData);
  if (files.length > 0) {
    const rows: (typeof mediaSlots.$inferInsert)[] = [];
    for (const [i, file] of files.entries()) {
      rows.push({
        ownerType: "tool_protocol",
        ownerId: id,
        slot: "unealta",
        kind: file.type.startsWith("video/") ? "video" : "foto",
        label: `${phase} ${i + 1}`,
        storageKey: await uploadToStorage(file, "teren/unealta"),
        createdBy: session.id,
      });
    }
    await db.insert(mediaSlots).values(rows);
  }

  revalidatePath(`/teren/pv/unelte/${id}`);
  revalidatePath("/unelte");
  redirect("/teren/comenzi");
}

/**
 * Pozele pentru seturile Înainte / După ale unei lucrări.
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
  const files = pickedFiles(formData);
  if (!workUnitId || files.length === 0) return;

  const labels = formData.getAll("label").map(String);

  const rows: (typeof mediaSlots.$inferInsert)[] = [];
  let photos = 0;
  for (const file of files) {
    const video = file.type.startsWith("video/");
    const storageKey = await uploadToStorage(file, `teren/${slot}`);
    if (!video) photos += 1;
    rows.push({
      ownerType: "work_unit",
      ownerId: workUnitId,
      workUnitId,
      slot,
      kind: video ? "video" : "foto",
      label: video ? "film" : (labels[photos - 1] ?? String(photos)),
      storageKey,
      createdBy: session.id,
    });
  }
  await db.insert(mediaSlots).values(rows);

  revalidatePath(`/teren/lucrare/${workUnitId}/inainte-dupa`);
}

/** Ștergerea unei poze puse greșit. Rândul dispare; fișierul rămâne în bucket, nefolosit. */
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
