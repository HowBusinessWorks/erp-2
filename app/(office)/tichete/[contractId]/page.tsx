import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql as raw, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { TicketBoard, type BoardStage, type BoardTicket } from "@/components/domain/TicketBoard";
import {
  TicketDetail,
  type DetailDocument,
  type DetailEvent,
  type DetailTicket,
} from "@/components/domain/TicketDetail";
import { TicketFilters } from "@/components/domain/TicketFilters";
import {
  NewTicketForm,
  StageSetup,
  StagesModal,
  TicketTypesModal,
  type StageRow,
  type TypeRow,
} from "@/components/domain/TicketForms";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import {
  contracts,
  objectives,
  partners,
  requests,
  ticketDocuments,
  ticketEvents,
  ticketStages,
  ticketTypes,
  users,
} from "@/lib/db/schema";
import { can } from "@/lib/permissions";
import { objectiveOptions, partnerOptions, userOptions } from "@/lib/pickers";
import { requireSession } from "@/lib/session";
import { asUrgency, todayIso } from "@/lib/tickets";

export const dynamic = "force-dynamic";

const client = alias(partners, "client_partner");
const assignedPartner = alias(partners, "assigned_partner");
const assignee = alias(users, "assignee_user");
const requester = alias(users, "requester_user");
const fromStage = alias(ticketStages, "from_stage");
const toStage = alias(ticketStages, "to_stage");
const eventAuthor = alias(users, "event_author");
const docAuthor = alias(users, "doc_author");

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string }>;
  searchParams: Promise<{
    q?: string;
    tip?: string;
    urgenta?: string;
    subcontractant?: string;
    responsabil?: string;
    termen?: string;
    ale_mele?: string;
    finale?: string;
    tichet?: string;
  }>;
}) {
  const session = await requireSession();
  if (!can(session.role, "tichete.vezi")) notFound();

  const { contractId } = await params;
  const sp = await searchParams;
  const canOperate = can(session.role, "tichete.opereaza");
  const isAdmin = can(session.role, "tichete.configureaza");
  const today = todayIso();

  const filters: SQL[] = [eq(requests.kind, "tichet"), eq(requests.contractId, contractId)];
  if (sp.q) {
    const needle = `%${sp.q.toLowerCase()}%`;
    filters.push(
      raw`(lower(${requests.title}) like ${needle} or lower(${requests.code}) like ${needle}
        or lower(coalesce(${requests.description}, '')) like ${needle})`,
    );
  }
  if (sp.tip) filters.push(eq(requests.ticketTypeId, sp.tip));
  if (sp.urgenta) filters.push(raw`${requests.urgency} = ${sp.urgenta}`);
  if (sp.subcontractant === "none") filters.push(raw`${requests.assignedPartnerId} is null`);
  else if (sp.subcontractant) filters.push(eq(requests.assignedPartnerId, sp.subcontractant));
  if (sp.responsabil === "none") filters.push(raw`${requests.assigneeId} is null`);
  else if (sp.responsabil) filters.push(eq(requests.assigneeId, sp.responsabil));
  if (sp.termen === "depasit") filters.push(raw`${requests.dueDate} < ${today}`);
  if (sp.termen === "azi") filters.push(raw`${requests.dueDate} = ${today}`);
  if (sp.termen === "7")
    filters.push(raw`${requests.dueDate} between ${today} and (${today}::date + interval '7 days')`);
  if (sp.termen === "fara") filters.push(raw`${requests.dueDate} is null`);
  if (sp.ale_mele) filters.push(eq(requests.assigneeId, session.id));

  const [contract, stageRows, ticketRows, options, totalRow] = await Promise.all([
    db
      .select({ contract: contracts, clientName: client.name })
      .from(contracts)
      .leftJoin(client, eq(contracts.clientId, client.id))
      .where(eq(contracts.id, contractId))
      .limit(1),
    db
      .select({
        stage: ticketStages,
        // `raw.raw` calificat: fara join, Drizzle emite coloana fara prefix de tabel
        // si subinterogarea s-ar corela gresit cu `r.id`.
        tickets: raw<string>`(
          select count(*) from ${requests} r
          where r.stage_id = ${raw.raw('"ticket_stages"."id"')}
        )`,
      })
      .from(ticketStages)
      .where(eq(ticketStages.contractId, contractId))
      .orderBy(asc(ticketStages.position)),
    db
      .select({
        request: requests,
        typeName: ticketTypes.name,
        typeTone: ticketTypes.tone,
        partnerName: assignedPartner.name,
        assigneeName: assignee.name,
        objectiveName: objectives.name,
        requesterName: requester.name,
        documents: raw<string>`(
          select count(*) from ${ticketDocuments} d where d.ticket_id = ${requests.id}
        )`,
      })
      .from(requests)
      .leftJoin(ticketTypes, eq(requests.ticketTypeId, ticketTypes.id))
      .leftJoin(assignedPartner, eq(requests.assignedPartnerId, assignedPartner.id))
      .leftJoin(assignee, eq(requests.assigneeId, assignee.id))
      .leftJoin(objectives, eq(requests.objectiveId, objectives.id))
      .leftJoin(requester, eq(requests.requestedBy, requester.id))
      .where(and(...filters))
      .orderBy(asc(requests.boardOrder), asc(requests.createdAt)),
    Promise.all([
      db
        .select({ value: ticketTypes.id, label: ticketTypes.name })
        .from(ticketTypes)
        .where(eq(ticketTypes.active, true))
        .orderBy(asc(ticketTypes.position), asc(ticketTypes.name)),
      partnerOptions("subcontractant"),
      userOptions(),
      canOperate ? objectiveOptions() : Promise.resolve([]),
      isAdmin
        ? db.select().from(ticketTypes).orderBy(asc(ticketTypes.position), asc(ticketTypes.name))
        : Promise.resolve([]),
      isAdmin
        ? db
            .select({
              value: contracts.id,
              label: raw<string>`${contracts.code} || ' — ' || (
                select count(*) from ${ticketStages} st where st.contract_id = ${contracts.id}
              ) || ' etape'`,
            })
            .from(contracts)
            .where(
              raw`${contracts.id} <> ${contractId} and exists (
                select 1 from ${ticketStages} st where st.contract_id = ${contracts.id}
              )`,
            )
            .orderBy(asc(contracts.code))
        : Promise.resolve([]),
    ]),
    db
      .select({ n: raw<string>`count(*)` })
      .from(requests)
      .where(and(eq(requests.kind, "tichet"), eq(requests.contractId, contractId))),
  ]);

  if (contract.length === 0) notFound();
  const [{ contract: head, clientName }] = contract;
  const [typeOpts, partnerOpts, userOpts, objectiveOpts, allTypes, importable] = options;

  const stages: BoardStage[] = stageRows.map(({ stage }) => ({
    id: stage.id,
    name: stage.name,
    tone: stage.tone,
    isFinal: stage.isFinal,
    wipLimit: stage.wipLimit,
  }));

  // Etapele finale sunt ascunse implicit: board-ul e despre ce e în lucru, nu despre arhivă.
  const visibleStages = sp.finale ? stages : stages.filter((s) => !s.isFinal);
  const visibleIds = new Set(visibleStages.map((s) => s.id));

  const tickets: BoardTicket[] = ticketRows
    .filter((r) => r.request.stageId && visibleIds.has(r.request.stageId))
    .map((r) => ({
      id: r.request.id,
      code: r.request.code,
      title: r.request.title,
      urgency: asUrgency(r.request.urgency),
      stageId: r.request.stageId,
      boardOrder: r.request.boardOrder,
      typeName: r.typeName,
      typeTone: r.typeTone,
      partnerName: r.partnerName,
      assigneeName: r.assigneeName,
      dueDate: r.request.dueDate,
      stageEnteredAt: r.request.stageEnteredAt ? r.request.stageEnteredAt.toISOString() : null,
      documents: Number(r.documents),
    }));

  /* ── panoul de detaliu, doar dacă e cerut din URL ── */
  let detail: {
    ticket: DetailTicket;
    documents: DetailDocument[];
    events: DetailEvent[];
  } | null = null;

  // Tichetul cerut din URL poate fi ascuns de filtre sau de o etapă finală — se aduce oricum.
  let openRow = sp.tichet ? ticketRows.find((r) => r.request.id === sp.tichet) : undefined;
  if (sp.tichet && !openRow) {
    const [found] = await db
      .select({
        request: requests,
        typeName: ticketTypes.name,
        typeTone: ticketTypes.tone,
        partnerName: assignedPartner.name,
        assigneeName: assignee.name,
        objectiveName: objectives.name,
        requesterName: requester.name,
        documents: raw<string>`(
          select count(*) from ${ticketDocuments} d where d.ticket_id = ${requests.id}
        )`,
      })
      .from(requests)
      .leftJoin(ticketTypes, eq(requests.ticketTypeId, ticketTypes.id))
      .leftJoin(assignedPartner, eq(requests.assignedPartnerId, assignedPartner.id))
      .leftJoin(assignee, eq(requests.assigneeId, assignee.id))
      .leftJoin(objectives, eq(requests.objectiveId, objectives.id))
      .leftJoin(requester, eq(requests.requestedBy, requester.id))
      .where(and(eq(requests.id, sp.tichet), eq(requests.contractId, contractId)))
      .limit(1);
    openRow = found;
  }
  if (openRow) {
    const [docs, events] = await Promise.all([
      db
        .select({ doc: ticketDocuments, authorName: docAuthor.name })
        .from(ticketDocuments)
        .leftJoin(docAuthor, eq(ticketDocuments.uploadedBy, docAuthor.id))
        .where(eq(ticketDocuments.ticketId, openRow.request.id))
        .orderBy(desc(ticketDocuments.createdAt)),
      db
        .select({
          event: ticketEvents,
          fromStageName: fromStage.name,
          toStageName: toStage.name,
          authorName: eventAuthor.name,
        })
        .from(ticketEvents)
        .leftJoin(fromStage, eq(ticketEvents.fromStageId, fromStage.id))
        .leftJoin(toStage, eq(ticketEvents.toStageId, toStage.id))
        .leftJoin(eventAuthor, eq(ticketEvents.authorId, eventAuthor.id))
        .where(eq(ticketEvents.ticketId, openRow.request.id))
        .orderBy(desc(ticketEvents.createdAt)),
    ]);

    detail = {
      ticket: {
        id: openRow.request.id,
        code: openRow.request.code,
        title: openRow.request.title,
        description: openRow.request.description,
        urgency: asUrgency(openRow.request.urgency),
        stageId: openRow.request.stageId,
        typeName: openRow.typeName,
        typeTone: openRow.typeTone,
        objectiveName: openRow.objectiveName,
        partnerId: openRow.request.assignedPartnerId,
        assigneeId: openRow.request.assigneeId,
        dueDate: openRow.request.dueDate,
        contractCode: head.code,
        createdAt: openRow.request.createdAt.toISOString(),
        requestedByName: openRow.requesterName,
      },
      documents: docs.map(({ doc, authorName }) => ({
        id: doc.id,
        name: doc.name,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        authorName,
        createdAt: doc.createdAt.toISOString(),
      })),
      events: events.map(({ event, fromStageName, toStageName, authorName }) => ({
        id: event.id,
        kind: event.kind,
        note: event.note,
        fromStageName,
        toStageName,
        authorName,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  const stageConfig: StageRow[] = stageRows.map(({ stage, tickets: n }) => ({
    id: stage.id,
    name: stage.name,
    tone: stage.tone,
    isFinal: stage.isFinal,
    wipLimit: stage.wipLimit,
    position: stage.position,
    tickets: Number(n),
  }));

  const typeConfig: TypeRow[] = allTypes.map((t) => ({
    id: t.id,
    name: t.name,
    tone: t.tone,
    icon: t.icon,
    active: t.active,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <Link
            href="/tichete"
            className="inline-flex items-center gap-1 text-ink-3 transition-colors hover:text-blueprint"
          >
            <ChevronLeft aria-hidden className="size-3" />
            Toate contractele
          </Link>
        }
        title={head.code}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            {head.name}
            {clientName ? <Badge>{clientName}</Badge> : null}
          </span>
        }
        actions={
          <>
            {canOperate && stages.length > 0 ? (
              <NewTicketForm
                contractId={contractId}
                types={typeOpts}
                objectives={objectiveOpts}
                partners={partnerOpts}
                users={userOpts}
              />
            ) : null}
            {isAdmin ? (
              <StagesModal
                contractId={contractId}
                stages={stageConfig}
                importable={importable}
              />
            ) : null}
            {isAdmin ? <TicketTypesModal types={typeConfig} contractId={contractId} /> : null}
          </>
        }
      />

      {stages.length === 0 ? (
        <EmptyState
          title="Contractul nu are încă etape"
          hint={
            isAdmin
              ? "Board-ul are nevoie de coloane. Pornește de la setul implicit sau importă fluxul altui contract din butonul „Etape”."
              : "Cere-i administratorului să configureze etapele acestui contract."
          }
          action={isAdmin ? <StageSetup contractId={contractId} /> : null}
        />
      ) : (
        <>
          <TicketFilters
            types={typeOpts}
            partners={partnerOpts}
            users={userOpts}
            shown={tickets.length}
            total={Number(totalRow[0]?.n ?? 0)}
          />

          <TicketBoard
            stages={visibleStages}
            allStages={stages}
            tickets={tickets}
            canOperate={canOperate}
          />
        </>
      )}

      {detail ? (
        <TicketDetail
          ticket={detail.ticket}
          stages={stages}
          documents={detail.documents}
          events={detail.events}
          partners={partnerOpts}
          users={userOpts}
          canOperate={canOperate}
        />
      ) : null}
    </div>
  );
}
