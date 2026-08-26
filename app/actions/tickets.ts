"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql as raw } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  requests,
  ticketDocuments,
  ticketEvents,
  ticketStages,
  ticketTypes,
} from "@/lib/db/schema";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { DEFAULT_STAGES, asTone, asUrgency, ticketCode } from "@/lib/tickets";

const str = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
const opt = (d: FormData, k: string) => str(d, k) || null;

function touch(contractId: string | null) {
  revalidatePath("/tichete");
  revalidatePath("/cereri");
  if (contractId) revalidatePath(`/tichete/${contractId}`);
}

/* ═══════════════════════════ tichete ═══════════════════════════ */

export async function createTicket(data: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.opereaza")) return;

  const contractId = str(data, "contractId");
  const title = str(data, "title");
  if (!contractId || title.length < 3) return;

  const [firstStage] = await db
    .select()
    .from(ticketStages)
    .where(eq(ticketStages.contractId, contractId))
    .orderBy(asc(ticketStages.position))
    .limit(1);
  if (!firstStage) return;

  const [{ n }] = await db
    .select({ n: raw<string>`count(*)` })
    .from(requests)
    .where(eq(requests.kind, "tichet"));

  // Cardul nou intră sus: restul coloanei coboară cu o poziție.
  await db
    .update(requests)
    .set({ boardOrder: raw`${requests.boardOrder} + 1` })
    .where(eq(requests.stageId, firstStage.id));

  const [ticket] = await db
    .insert(requests)
    .values({
      code: ticketCode(Number(n) + 1),
      kind: "tichet",
      source: "manual",
      title,
      description: opt(data, "description"),
      contractId,
      objectiveId: opt(data, "objectiveId"),
      stageId: firstStage.id,
      ticketTypeId: opt(data, "ticketTypeId"),
      urgency: asUrgency(str(data, "urgency")),
      assignedPartnerId: opt(data, "assignedPartnerId"),
      assigneeId: opt(data, "assigneeId"),
      dueDate: opt(data, "dueDate"),
      boardOrder: 0,
      stageEnteredAt: new Date(),
      requestedBy: session.id,
    })
    .returning();

  await db.insert(ticketEvents).values({
    ticketId: ticket.id,
    kind: "creat",
    toStageId: firstStage.id,
    authorId: session.id,
  });

  touch(contractId);
}

export async function updateTicket(data: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.opereaza")) return;

  const ticketId = str(data, "ticketId");
  const [ticket] = await db.select().from(requests).where(eq(requests.id, ticketId)).limit(1);
  if (!ticket) return;

  await db
    .update(requests)
    .set({
      title: str(data, "title") || ticket.title,
      description: opt(data, "description"),
      ticketTypeId: opt(data, "ticketTypeId"),
      urgency: asUrgency(str(data, "urgency")),
      dueDate: opt(data, "dueDate"),
      objectiveId: opt(data, "objectiveId"),
    })
    .where(eq(requests.id, ticketId));

  await db.insert(ticketEvents).values({
    ticketId,
    kind: "camp",
    note: "Detaliile tichetului au fost modificate.",
    authorId: session.id,
  });

  touch(ticket.contractId);
}

/** Salvarea descrierii din panoul de detaliu, fără să treacă prin formularul mare. */
export async function updateTicketDescription(input: {
  ticketId: string;
  description: string;
}): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.opereaza")) return;

  const [ticket] = await db
    .select()
    .from(requests)
    .where(eq(requests.id, input.ticketId))
    .limit(1);
  if (!ticket) return;

  await db
    .update(requests)
    .set({ description: input.description.trim() || null })
    .where(eq(requests.id, input.ticketId));
  touch(ticket.contractId);
}

export async function deleteTicket(ticketId: string): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.configureaza")) return;

  const [ticket] = await db.select().from(requests).where(eq(requests.id, ticketId)).limit(1);
  if (!ticket) return;

  await db.delete(requests).where(eq(requests.id, ticketId));
  touch(ticket.contractId);
}

/* ═══════════════════════════ mutare ═══════════════════════════ */

export async function moveTicket(input: {
  ticketId: string;
  toStageId: string;
  /** id-ul cardului înaintea căruia se așază; null = la coadă */
  beforeTicketId: string | null;
}): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.opereaza")) return;

  const [ticket] = await db
    .select()
    .from(requests)
    .where(eq(requests.id, input.ticketId))
    .limit(1);
  if (!ticket) return;

  const [stage] = await db
    .select()
    .from(ticketStages)
    .where(eq(ticketStages.id, input.toStageId))
    .limit(1);
  // Etapa țintă trebuie să fie a aceluiași contract — altfel tichetul ar sări fluxul.
  if (!stage || stage.contractId !== ticket.contractId) return;

  const changedStage = ticket.stageId !== stage.id;

  const siblings = await db
    .select({ id: requests.id })
    .from(requests)
    .where(and(eq(requests.kind, "tichet"), eq(requests.stageId, stage.id)))
    .orderBy(asc(requests.boardOrder), asc(requests.createdAt));

  const order = siblings.map((s) => s.id).filter((rowId) => rowId !== input.ticketId);
  const at = input.beforeTicketId ? order.indexOf(input.beforeTicketId) : -1;
  if (at >= 0) order.splice(at, 0, input.ticketId);
  else order.push(input.ticketId);

  // Coloanele sunt mici — se rescrie poziția întreagă, e mai simplu decât aritmetica de rang.
  for (const [i, rowId] of order.entries()) {
    await db
      .update(requests)
      .set(
        rowId === input.ticketId
          ? {
              boardOrder: i,
              stageId: stage.id,
              ...(changedStage ? { stageEnteredAt: new Date() } : {}),
            }
          : { boardOrder: i },
      )
      .where(eq(requests.id, rowId));
  }

  if (changedStage) {
    await db.insert(ticketEvents).values({
      ticketId: input.ticketId,
      kind: "mutat",
      fromStageId: ticket.stageId,
      toStageId: stage.id,
      authorId: session.id,
    });
  }

  touch(ticket.contractId);
}

export async function assignTicket(input: {
  ticketId: string;
  partnerId?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
}): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.opereaza")) return;

  const [ticket] = await db
    .select()
    .from(requests)
    .where(eq(requests.id, input.ticketId))
    .limit(1);
  if (!ticket) return;

  const patch: Partial<typeof requests.$inferInsert> = {};
  if (input.partnerId !== undefined) patch.assignedPartnerId = input.partnerId || null;
  if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId || null;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate || null;
  if (Object.keys(patch).length === 0) return;

  await db.update(requests).set(patch).where(eq(requests.id, input.ticketId));
  await db.insert(ticketEvents).values({
    ticketId: input.ticketId,
    kind: "atribuit",
    note: input.dueDate !== undefined ? "Termen actualizat" : null,
    authorId: session.id,
  });

  touch(ticket.contractId);
}

export async function addTicketComment(data: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.opereaza")) return;

  const ticketId = str(data, "ticketId");
  const note = str(data, "note");
  if (!ticketId || !note) return;

  const [ticket] = await db.select().from(requests).where(eq(requests.id, ticketId)).limit(1);
  if (!ticket) return;

  await db.insert(ticketEvents).values({ ticketId, kind: "comentariu", note, authorId: session.id });
  touch(ticket.contractId);
}

/* ═══════════════════ documente (doar metadate) ═══════════════════ */

export async function addTicketDocument(data: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.opereaza")) return;

  const ticketId = str(data, "ticketId");
  const name = str(data, "name");
  if (!ticketId || !name) return;

  const [ticket] = await db.select().from(requests).where(eq(requests.id, ticketId)).limit(1);
  if (!ticket) return;

  await db.insert(ticketDocuments).values({
    ticketId,
    name,
    mimeType: opt(data, "mimeType"),
    sizeBytes: Number(str(data, "sizeBytes")) || null,
    note: opt(data, "note"),
    uploadedBy: session.id,
  });
  await db.insert(ticketEvents).values({
    ticketId,
    kind: "document",
    note: name,
    authorId: session.id,
  });

  touch(ticket.contractId);
}

export async function removeTicketDocument(documentId: string): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.opereaza")) return;

  const [doc] = await db
    .select({ ticketId: ticketDocuments.ticketId })
    .from(ticketDocuments)
    .where(eq(ticketDocuments.id, documentId))
    .limit(1);
  if (!doc) return;

  await db.delete(ticketDocuments).where(eq(ticketDocuments.id, documentId));
  const [ticket] = await db
    .select({ contractId: requests.contractId })
    .from(requests)
    .where(eq(requests.id, doc.ticketId))
    .limit(1);
  touch(ticket?.contractId ?? null);
}

/* ═══════════ configurare — doar tichete.configureaza (admin) ═══════════ */

export async function createStage(data: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.configureaza")) return;

  const contractId = str(data, "contractId");
  const name = str(data, "name");
  if (!contractId || name.length < 2) return;

  const [{ n }] = await db
    .select({ n: raw<string>`coalesce(max(${ticketStages.position}) + 1, 0)` })
    .from(ticketStages)
    .where(eq(ticketStages.contractId, contractId));

  await db
    .insert(ticketStages)
    .values({
      contractId,
      name,
      tone: asTone(str(data, "tone")),
      isFinal: str(data, "isFinal") === "1",
      wipLimit: Number(str(data, "wipLimit")) || null,
      position: Number(n),
    })
    .onConflictDoNothing();

  touch(contractId);
}

export async function updateStage(data: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.configureaza")) return;

  const stageId = str(data, "stageId");
  const [stage] = await db
    .select()
    .from(ticketStages)
    .where(eq(ticketStages.id, stageId))
    .limit(1);
  if (!stage) return;

  await db
    .update(ticketStages)
    .set({
      name: str(data, "name") || stage.name,
      tone: asTone(str(data, "tone")),
      isFinal: str(data, "isFinal") === "1",
      wipLimit: Number(str(data, "wipLimit")) || null,
    })
    .where(eq(ticketStages.id, stageId));

  touch(stage.contractId);
}

export async function reorderStages(input: {
  contractId: string;
  stageIds: string[];
}): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.configureaza")) return;

  for (const [i, stageId] of input.stageIds.entries()) {
    await db
      .update(ticketStages)
      .set({ position: i })
      .where(and(eq(ticketStages.id, stageId), eq(ticketStages.contractId, input.contractId)));
  }
  touch(input.contractId);
}

export async function deleteStage(input: {
  stageId: string;
  moveToStageId: string | null;
}): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.configureaza")) return;

  const [stage] = await db
    .select()
    .from(ticketStages)
    .where(eq(ticketStages.id, input.stageId))
    .limit(1);
  if (!stage) return;

  const [{ n }] = await db
    .select({ n: raw<string>`count(*)` })
    .from(requests)
    .where(eq(requests.stageId, input.stageId));

  // O etapă cu tichete nu se șterge orb: UI-ul cere destinația înainte de a confirma.
  if (Number(n) > 0) {
    if (!input.moveToStageId) return;
    const [target] = await db
      .select()
      .from(ticketStages)
      .where(eq(ticketStages.id, input.moveToStageId))
      .limit(1);
    if (!target || target.contractId !== stage.contractId) return;
    await db
      .update(requests)
      .set({ stageId: target.id, stageEnteredAt: new Date() })
      .where(eq(requests.stageId, input.stageId));
  }

  await db.delete(ticketStages).where(eq(ticketStages.id, input.stageId));
  touch(stage.contractId);
}

export async function importStages(input: {
  toContractId: string;
  fromContractId: string;
}): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.configureaza")) return;
  if (!input.fromContractId || input.toContractId === input.fromContractId) return;

  const [source, existing] = await Promise.all([
    db
      .select()
      .from(ticketStages)
      .where(eq(ticketStages.contractId, input.fromContractId))
      .orderBy(asc(ticketStages.position)),
    db.select().from(ticketStages).where(eq(ticketStages.contractId, input.toContractId)),
  ]);

  const taken = new Set(existing.map((s) => s.name.toLowerCase()));
  let position = existing.reduce((max, s) => Math.max(max, s.position + 1), 0);

  const rows = source
    .filter((s) => !taken.has(s.name.toLowerCase()))
    .map((s) => ({
      contractId: input.toContractId,
      name: s.name,
      tone: s.tone,
      isFinal: s.isFinal,
      wipLimit: s.wipLimit,
      position: position++,
    }));

  if (rows.length > 0) await db.insert(ticketStages).values(rows).onConflictDoNothing();
  touch(input.toContractId);
}

export async function seedDefaultStages(contractId: string): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.configureaza")) return;

  const existing = await db
    .select({ id: ticketStages.id })
    .from(ticketStages)
    .where(eq(ticketStages.contractId, contractId));
  if (existing.length > 0) return;

  await db
    .insert(ticketStages)
    .values(DEFAULT_STAGES.map((s, i) => ({ contractId, ...s, position: i })))
    .onConflictDoNothing();

  touch(contractId);
}

/* ─────────────────── tipuri de tichet ─────────────────── */

export async function createTicketType(data: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.configureaza")) return;

  const name = str(data, "name");
  if (name.length < 2) return;

  const [{ n }] = await db
    .select({ n: raw<string>`coalesce(max(${ticketTypes.position}) + 1, 0)` })
    .from(ticketTypes);

  await db
    .insert(ticketTypes)
    .values({
      name,
      tone: asTone(str(data, "tone")),
      icon: opt(data, "icon"),
      position: Number(n),
    })
    .onConflictDoNothing();

  touch(opt(data, "contractId"));
}

export async function updateTicketType(data: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.configureaza")) return;

  const typeId = str(data, "typeId");
  const [type] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, typeId)).limit(1);
  if (!type) return;

  await db
    .update(ticketTypes)
    .set({
      name: str(data, "name") || type.name,
      tone: asTone(str(data, "tone")),
      icon: opt(data, "icon"),
    })
    .where(eq(ticketTypes.id, typeId));

  touch(opt(data, "contractId"));
}

/** Tipul nu se șterge — tichetele vechi îl referă. Se arhivează. */
export async function archiveTicketType(input: {
  typeId: string;
  active: boolean;
  contractId?: string | null;
}): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "tichete.configureaza")) return;

  await db
    .update(ticketTypes)
    .set({ active: input.active })
    .where(eq(ticketTypes.id, input.typeId));
  touch(input.contractId ?? null);
}
