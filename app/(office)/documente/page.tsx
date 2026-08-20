import Link from "next/link";
import { asc, eq, isNull, sql as raw } from "drizzle-orm";

import { Badge, Button, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import { contracts, fileNodes, fileVersions, objectives, users, workUnits } from "@/lib/db/schema";
import { formatDay } from "@/lib/equipment";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function DocumentePage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  await requireSession();
  const sp = await searchParams;
  const folderId = sp.folder ?? null;

  const [children, current, counts] = await Promise.all([
    db
      .select({
        node: fileNodes,
        version: fileVersions,
        unit: workUnits,
        contract: contracts,
        objective: objectives,
        author: users,
      })
      .from(fileNodes)
      .leftJoin(fileVersions, eq(fileNodes.currentVersionId, fileVersions.id))
      .leftJoin(workUnits, eq(fileNodes.workUnitId, workUnits.id))
      .leftJoin(contracts, eq(fileNodes.contractId, contracts.id))
      .leftJoin(objectives, eq(fileNodes.objectiveId, objectives.id))
      .leftJoin(users, eq(fileNodes.createdBy, users.id))
      .where(
        folderId
          ? raw`${fileNodes.parentId} = ${folderId} and ${fileNodes.deletedAt} is null`
          : raw`${fileNodes.parentId} is null and ${fileNodes.deletedAt} is null`,
      )
      // folderele înaintea fișierelor, apoi alfabetic
      .orderBy(asc(fileNodes.kind), asc(fileNodes.name)),
    folderId
      ? db.select().from(fileNodes).where(eq(fileNodes.id, folderId)).limit(1)
      : Promise.resolve([]),
    db
      .select({ kind: fileNodes.kind, n: raw<string>`count(*)` })
      .from(fileNodes)
      .where(isNull(fileNodes.deletedAt))
      .groupBy(fileNodes.kind),
  ]);

  const folder = current[0] ?? null;

  // Firul Ariadnei: urcăm din părinte în părinte până la rădăcină.
  const trail: { id: string; name: string }[] = [];
  let cursor = folder?.parentId ?? null;
  while (cursor) {
    const [parent] = await db.select().from(fileNodes).where(eq(fileNodes.id, cursor)).limit(1);
    if (!parent) break;
    trail.unshift({ id: parent.id, name: parent.name });
    cursor = parent.parentId;
  }

  const folders = children.filter((c) => c.node.kind === "folder");
  const files = children.filter((c) => c.node.kind === "file");
  const count = (k: string) => counts.find((c) => c.kind === k)?.n ?? "0";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Evidență"
        title="Documente"
        meta="Fiecare unitate de lucru primește un folder propriu, generat automat. Nimeni nu-l creează de mână și nimeni nu uită să-l creeze — de asta pozele de pe teren au unde să ajungă."
        actions={
          <Link href="/documente/sabloane">
            <Button size="sm">Șabloane de PV</Button>
          </Link>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Foldere" value={count("folder")} />
        <Stat label="Fișiere" value={count("file")} />
        <Stat
          label="Foldere de unitate"
          value={String(folders.filter((f) => f.node.workUnitId).length)}
          hint="generate automat în folderul curent"
        />
      </div>

      {/* firul de navigație */}
      <nav className="flex flex-wrap items-center gap-1 text-tiny">
        <Link href="/documente" className="text-blueprint hover:underline">
          Rădăcină
        </Link>
        {trail.map((t) => (
          <span key={t.id} className="flex items-center gap-1">
            <span className="text-ink-3">/</span>
            <Link href={`/documente?folder=${t.id}`} className="text-blueprint hover:underline">
              {t.name}
            </Link>
          </span>
        ))}
        {folder ? (
          <span className="flex items-center gap-1">
            <span className="text-ink-3">/</span>
            <span className="font-medium text-ink">{folder.name}</span>
          </span>
        ) : null}
      </nav>

      {children.length === 0 ? (
        <EmptyState
          title="Folder gol"
          hint="În producție, fișierele intră direct din browser în storage, cu retry pe bucăți și thumbnail generat la încărcare. Aici e doar arborele — vezi cusăturile din PLAN.md §7."
        />
      ) : (
        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Nume</TH>
                <TH>Legat de</TH>
                <TH>Tip</TH>
                <TH numeric>Mărime</TH>
                <TH>Încărcat de</TH>
                <TH>Data</TH>
              </TR>
            </THead>
            <TBody>
              {folders.map(({ node, unit, contract, objective }) => (
                <TR key={node.id}>
                  <TD>
                    <Link
                      href={`/documente?folder=${node.id}`}
                      className="font-medium hover:text-blueprint"
                    >
                      {node.name}
                    </Link>
                    {node.workUnitId ? (
                      <Badge className="ml-2">auto</Badge>
                    ) : null}
                  </TD>
                  <TD muted className="max-w-56 truncate">
                    {unit?.title ?? contract?.code ?? objective?.name ?? "—"}
                  </TD>
                  <TD muted>folder</TD>
                  <TD numeric muted>
                    —
                  </TD>
                  <TD muted>—</TD>
                  <TD muted>{formatDay(String(node.createdAt).slice(0, 10))}</TD>
                </TR>
              ))}
              {files.map(({ node, version, unit, contract, objective, author }) => (
                <TR key={node.id}>
                  <TD>
                    {node.name}
                    {version?.phase ? (
                      <Badge className="ml-2" tone="blueprint">
                        {version.phase}
                      </Badge>
                    ) : null}
                    {version?.lat ? (
                      <span className="ml-2 text-micro text-ink-3" title="poză cu geotag">
                        geotag
                      </span>
                    ) : null}
                  </TD>
                  <TD muted className="max-w-56 truncate">
                    {unit?.title ?? contract?.code ?? objective?.name ?? "—"}
                  </TD>
                  <TD muted>{version?.mimeType ?? "fișier"}</TD>
                  <TD numeric muted>
                    {formatSize(version?.sizeBytes ?? null)}
                  </TD>
                  <TD muted>{author?.name ?? "—"}</TD>
                  <TD muted>{formatDay(String(node.createdAt).slice(0, 10))}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Sheet>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-rule-strong bg-sheet px-4 py-3">
      <div className="eyebrow mb-1">{label}</div>
      <div className="tabular font-narrow text-[1.5rem] font-semibold leading-none text-ink">
        {value}
      </div>
      {hint ? <div className="mt-1 text-micro text-ink-3">{hint}</div> : null}
    </div>
  );
}
