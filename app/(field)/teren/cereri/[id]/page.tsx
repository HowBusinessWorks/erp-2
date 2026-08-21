import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { Block, FieldBar, Note, Pill } from "@/components/domain/FieldUI";
import { db } from "@/lib/db";
import {
  objectives,
  poLines,
  products,
  purchaseOrders,
  requests,
  workUnits,
} from "@/lib/db/schema";
import { ROUTING_LABELS } from "@/lib/routing-types";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type Step = { title: string; meta: string; state: "gata" | "acum" | "urmeaza" };

/**
 * Unde a ajuns cererea mea.
 *
 * Firul cronologic e singurul lucru de pe ecran: omul care întreabă „unde e cimentul"
 * nu vrea o fișă, vrea un răspuns. **Zero lei** — nici prețul unitar, nici valoarea
 * comenzii. Cantități și stări, atât.
 */
export default async function TerenCererePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  if (id.startsWith("po-")) return <OrderView id={id.slice(3)} />;
  if (id.startsWith("req-")) return <RequestView id={id.slice(4)} />;
  notFound();
}

/* ─────────────────────── necesar de material ─────────────────────── */

async function OrderView({ id }: { id: string }) {
  const [row] = await db
    .select({ po: purchaseOrders })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    .limit(1);
  if (!row) notFound();
  const po = row.po;

  const lines = await db
    .select({ line: poLines, product: products, objective: objectives })
    .from(poLines)
    .innerJoin(products, eq(poLines.productId, products.id))
    .leftJoin(workUnits, eq(poLines.workUnitId, workUnits.id))
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(eq(poLines.poId, id))
    .orderBy(asc(products.name));

  const reached = ["draft", "lansata", "confirmata", "receptionata_partial", "receptionata"].indexOf(
    po.status,
  );

  const steps: Step[] = [
    { title: "Ai trimis necesarul", meta: formatMoment(po.createdAt), state: "gata" },
    {
      title: "Magazia verifică stocul",
      meta: po.warehouseCheckUntil
        ? `Are timp până pe ${formatMoment(po.warehouseCheckUntil)}`
        : "Filtrul de 24 de ore",
      state: reached > 0 ? "gata" : "acum",
    },
    {
      title: po.warehouseCoveredFromStock ? "Acoperit din stoc" : "Comandat la furnizor",
      meta: po.orderedAt ?? "—",
      state: reached > 1 ? "gata" : reached === 1 ? "acum" : "urmeaza",
    },
    {
      title: "Ajunge la tine",
      meta: po.confirmedDeliveryAt ?? "Se confirmă la lansare",
      state: po.status === "receptionata" ? "gata" : reached >= 2 ? "acum" : "urmeaza",
    },
  ];

  return (
    <>
      <FieldBar
        title={`Necesar ${po.code}`}
        sub={`${lines[0]?.objective?.name ?? "—"} · trimis ${formatMoment(po.createdAt)}`}
        back="/teren/cereri"
      >
        <div style={{ marginTop: 12 }}>
          <Pill tone={po.status === "receptionata" ? "g" : "am-solid"}>
            {po.status === "draft" ? "La magazie" : po.status === "receptionata" ? "Primit" : "Pe drum"}
          </Pill>
        </div>
      </FieldBar>

      <div style={{ height: 16 }} />
      <Block padded>
        <Timeline steps={steps} />
      </Block>

      <div className="f-lbl">Ce ai cerut</div>
      <Block>
        {lines.map(({ line, product }) => (
          <div key={line.id} className="f-li">
            <div className="f-tx">
              <b>{product.name}</b>
              <span>{product.unit}</span>
            </div>
            {/* cantitate, nu valoare */}
            <span className="f-qv">{Number(line.quantity)}</span>
          </div>
        ))}
      </Block>

      {po.status === "draft" ? (
        <Note>
          Magazia are 24 de ore să acopere necesarul din stocul existent. Abia dacă nu poate,
          se comandă la furnizor.
        </Note>
      ) : null}
    </>
  );
}

/* ─────────────────────── solicitare / constatare ─────────────────────── */

async function RequestView({ id }: { id: string }) {
  const [row] = await db
    .select({ request: requests, objective: objectives })
    .from(requests)
    .leftJoin(objectives, eq(requests.objectiveId, objectives.id))
    .where(eq(requests.id, id))
    .limit(1);
  if (!row) notFound();
  const { request, objective } = row;

  const decided = Boolean(request.decidedAt);
  const steps: Step[] = [
    { title: "Ai trimis cererea", meta: formatMoment(request.createdAt), state: "gata" },
    {
      title: "Biroul o evaluează",
      meta: decided ? "Făcut" : "Ajunge în inboxul de cereri",
      state: decided ? "gata" : "acum",
    },
    {
      title: decided
        ? request.decision
          ? `Decis: ${ROUTING_LABELS[request.decision as keyof typeof ROUTING_LABELS] ?? request.decision}`
          : "Decis"
        : "Se decide ce se face",
      meta: request.decidedAt ? formatMoment(request.decidedAt) : "—",
      state: decided ? "gata" : "urmeaza",
    },
    {
      title: "Se deschide lucrarea",
      meta: request.workUnitId ? "Deschisă" : "După decizie",
      state: request.workUnitId ? "gata" : "urmeaza",
    },
  ];

  return (
    <>
      <FieldBar
        title={request.title}
        sub={`${request.code} · ${objective?.name ?? "—"}`}
        back="/teren/cereri"
      >
        <div style={{ marginTop: 12 }}>
          <Pill tone={request.status === "respinsa" ? "r" : decided ? "g" : "am-solid"}>
            {request.status === "respinsa" ? "Respinsă" : decided ? "Rezolvată" : "Așteaptă răspuns"}
          </Pill>
        </div>
      </FieldBar>

      <div style={{ height: 16 }} />
      <Block padded>
        <Timeline steps={steps} />
      </Block>

      {request.description ? (
        <>
          <div className="f-lbl">Ce ai scris</div>
          <Block padded>
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.5 }}>{request.description}</p>
          </Block>
        </>
      ) : null}

      {request.decisionNote ? (
        <>
          <div className="f-lbl">Răspunsul biroului</div>
          <Block padded>
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.5 }}>{request.decisionNote}</p>
          </Block>
        </>
      ) : null}
    </>
  );
}

/* ─────────────────────── piese comune ─────────────────────── */

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <div className="f-tl">
      {steps.map((step, i) => (
        <div
          key={step.title}
          className={`f-s ${step.state === "gata" ? "f-dn" : step.state === "acum" ? "f-nw" : ""}`}
        >
          <span className="f-d">
            <i />
            {i < steps.length - 1 ? <u /> : null}
          </span>
          <span className="f-b">
            <b>{step.title}</b>
            <span>{step.meta}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function formatMoment(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long" }).format(date);
}
