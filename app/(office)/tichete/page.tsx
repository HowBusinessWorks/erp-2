import { asc, eq, sql as raw } from "drizzle-orm";

import { TicketContracts, type ContractCard } from "@/components/domain/TicketContracts";
import { TicketTypesModal, type TypeRow } from "@/components/domain/TicketForms";
import { PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { contracts, partners, requests, ticketStages, ticketTypes } from "@/lib/db/schema";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function TichetePage() {
  const session = await requireSession();
  const isAdmin = can(session.role, "tichete.configureaza");

  const [rows, types] = await Promise.all([
    db
      .select({
        id: contracts.id,
        code: contracts.code,
        name: contracts.name,
        type: contracts.kind,
        clientName: partners.name,
        // Un singur query: agregatele stau pe subinterogări corelate, nu pe cinci join-uri.
        open: raw<string>`(
          select count(*) from ${requests} r
          left join ${ticketStages} st on st.id = r.stage_id
          where r.kind = 'tichet' and r.contract_id = ${contracts.id}
            and coalesce(st.is_final, false) = false
        )`,
        urgent: raw<string>`(
          select count(*) from ${requests} r
          left join ${ticketStages} st on st.id = r.stage_id
          where r.kind = 'tichet' and r.contract_id = ${contracts.id}
            and coalesce(st.is_final, false) = false
            and r.urgency in ('ridicata', 'critica')
        )`,
        total: raw<string>`(
          select count(*) from ${requests} r
          where r.kind = 'tichet' and r.contract_id = ${contracts.id}
        )`,
        stages: raw<string>`(
          select count(*) from ${ticketStages} st where st.contract_id = ${contracts.id}
        )`,
        lastAt: raw<Date | null>`(
          select max(r.created_at) from ${requests} r
          where r.kind = 'tichet' and r.contract_id = ${contracts.id}
        )`,
      })
      .from(contracts)
      .leftJoin(partners, eq(contracts.clientId, partners.id))
      .orderBy(asc(contracts.code)),
    isAdmin
      ? db.select().from(ticketTypes).orderBy(asc(ticketTypes.position), asc(ticketTypes.name))
      : Promise.resolve([]),
  ]);

  const cards: ContractCard[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    clientName: r.clientName,
    open: Number(r.open),
    urgent: Number(r.urgent),
    total: Number(r.total),
    stages: Number(r.stages),
    lastAt: r.lastAt ? new Date(r.lastAt).toISOString() : null,
  }));

  const typeRows: TypeRow[] = types.map((t) => ({
    id: t.id,
    name: t.name,
    tone: t.tone,
    icon: t.icon,
    active: t.active,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operațional"
        title="Tichete"
        meta="Fiecare contract are propriul flux. Alege contractul ca să intri pe board."
        actions={isAdmin ? <TicketTypesModal types={typeRows} label="Tipuri de tichet" /> : null}
      />

      <TicketContracts contracts={cards} />
    </div>
  );
}
