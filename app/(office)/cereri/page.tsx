import Link from "next/link";
import { and, desc, eq, sql as raw, type SQL } from "drizzle-orm";

import { Badge, PageHeader } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import { contracts, objectives, requests, users } from "@/lib/db/schema";
import { formatShort, fromDb } from "@/lib/money";
import { canSeePrices } from "@/lib/permissions";
import { ROUTING_LABELS, type RoutingDecision } from "@/lib/routing";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  tichet: "Tichet",
  solicitare: "Solicitare",
  constatare: "Constatare",
  propunere: "Propunere",
  solicitare_utilaj: "Utilaj",
  observatie_utilaj: "Observație utilaj",
};

const SOURCE_LABEL: Record<string, string> = {
  email: "e-mail",
  manual: "manual",
  telefon: "telefon",
  fisa_inspectie: "fișă de inspecție",
  utilaj: "utilaj",
};

const STATUS_TONE: Record<string, "neutral" | "blueprint" | "warn" | "fill" | "over"> = {
  neprocesata: "warn",
  evaluata: "blueprint",
  aprobata: "fill",
  respinsa: "neutral",
  amanata: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  neprocesata: "Neprocesată",
  evaluata: "Evaluată",
  aprobata: "Aprobată",
  respinsa: "Respinsă",
  amanata: "Amânată",
};

export default async function CereriPage({
  searchParams,
}: {
  searchParams: Promise<{ stare?: string; tip?: string; contract?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const showPrices = canSeePrices(session.role);

  const filters: SQL[] = [];
  if (sp.stare) filters.push(raw`${requests.status} = ${sp.stare}`);
  if (sp.tip) filters.push(raw`${requests.kind} = ${sp.tip}`);
  if (sp.contract) filters.push(eq(requests.contractId, sp.contract));
  // Cererile de utilaj au inboxul lor (ecranul 28) — aici ar fi zgomot.
  filters.push(raw`${requests.kind} not in ('solicitare_utilaj', 'observatie_utilaj')`);

  const where = and(...filters);

  const [rows, counts] = await Promise.all([
    db
      .select({ request: requests, objective: objectives, contract: contracts, decider: users })
      .from(requests)
      .leftJoin(objectives, eq(requests.objectiveId, objectives.id))
      .leftJoin(contracts, eq(requests.contractId, contracts.id))
      .leftJoin(users, eq(requests.decidedBy, users.id))
      .where(where)
      .orderBy(desc(requests.createdAt))
      .limit(120),
    db
      .select({ status: requests.status, n: raw<string>`count(*)` })
      .from(requests)
      .where(raw`${requests.kind} not in ('solicitare_utilaj', 'observatie_utilaj')`)
      .groupBy(requests.status),
  ]);

  const countOf = (status: string) => Number(counts.find((c) => c.status === status)?.n ?? 0);
  const pending = countOf("neprocesata");

  const qs = (patch: Record<string, string | undefined>) => {
    const merged = { ...sp, ...patch };
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) s.set(k, v);
    const q = s.toString();
    return q ? `/cereri?${q}` : "/cereri";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operațional"
        title="Cereri și tichete"
        meta="O singură cutie pentru tot ce intră: sesizări de la client, constatări de la inspecții, propuneri interne. Tipul e o etichetă, nu o entitate separată."
        actions={
          pending > 0 ? (
            <Link href={qs({ stare: "neprocesata" })}>
              <Badge tone="warn">{pending} neprocesate</Badge>
            </Link>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip href={qs({ stare: undefined, tip: undefined })} active={!sp.stare && !sp.tip} label="Tot" />
        <span aria-hidden className="mx-1 h-4 w-px bg-rule" />
        {["neprocesata", "evaluata", "aprobata", "amanata", "respinsa"].map((status) => (
          <Chip
            key={status}
            href={qs({ stare: sp.stare === status ? undefined : status })}
            active={sp.stare === status}
            label={`${STATUS_LABEL[status]} · ${countOf(status)}`}
          />
        ))}
        <span aria-hidden className="mx-1 h-4 w-px bg-rule" />
        {["tichet", "constatare", "propunere", "solicitare"].map((kind) => (
          <Chip
            key={kind}
            href={qs({ tip: sp.tip === kind ? undefined : kind })}
            active={sp.tip === kind}
            label={KIND_LABEL[kind]}
          />
        ))}
      </div>

      <Sheet>
        <Table>
          <THead>
            <TR>
              <TH>Cod</TH>
              <TH>Tip</TH>
              <TH>Titlu</TH>
              <TH>Obiectiv</TH>
              <TH>Contract</TH>
              {showPrices ? <TH numeric>Estimat</TH> : null}
              <TH>Stare</TH>
              <TH>Decizie</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map(({ request, objective, contract, decider }) => (
              <TR key={request.id}>
                <TD>
                  <Link href={`/cereri/${request.id}`} className="font-medium hover:text-blueprint">
                    {request.code}
                  </Link>
                </TD>
                <TD muted>
                  {KIND_LABEL[request.kind]}
                  <span className="block text-micro text-ink-3">{SOURCE_LABEL[request.source]}</span>
                </TD>
                <TD className="max-w-72">
                  <Link href={`/cereri/${request.id}`} className="hover:text-blueprint">
                    {request.title}
                  </Link>
                </TD>
                <TD muted className="max-w-44 truncate">
                  {objective?.name ?? "—"}
                </TD>
                <TD muted>{contract?.code ?? "—"}</TD>
                {showPrices ? (
                  <TD numeric>{formatShort(fromDb(request.estimatedValue))}</TD>
                ) : null}
                <TD>
                  <Badge tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Badge>
                </TD>
                <TD muted className="max-w-56">
                  {request.decision ? (
                    <>
                      {ROUTING_LABELS[request.decision as RoutingDecision]}
                      {/* Decizia fără autor și dată e o părere, nu o decizie (§7). */}
                      <span className="block text-micro text-ink-3">
                        {decider?.name ?? "—"} ·{" "}
                        {request.decidedAt
                          ? new Intl.DateTimeFormat("ro-RO", { dateStyle: "short" }).format(
                              request.decidedAt,
                            )
                          : "—"}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Sheet>

      {rows.length === 0 ? (
        <p className="text-tiny text-ink-2">Nicio cerere cu filtrele astea.</p>
      ) : null}
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-[3px] border px-2 py-0.5 text-tiny transition-colors ${
        active
          ? "border-blueprint bg-blueprint text-white"
          : "border-rule-strong bg-sheet text-ink-2 hover:bg-sunk hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
