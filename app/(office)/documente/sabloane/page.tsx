import Link from "next/link";
import { asc, eq } from "drizzle-orm";

import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { pvDocuments, pvTemplates } from "@/lib/db/schema";
import { TEMPLATE_KIND_LABEL, type TemplateField } from "@/lib/pv-templates";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { TemplateEditor } from "./TemplateEditor";

export const dynamic = "force-dynamic";

export default async function SabloanePage({
  searchParams,
}: {
  searchParams: Promise<{ sablon?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const canEdit = can(session.role, "nomenclatoare.editeaza");

  const templates = await db.select().from(pvTemplates).orderBy(asc(pvTemplates.name));
  const active = templates.find((t) => t.id === sp.sablon) ?? templates[0] ?? null;

  const used = active
    ? await db.select({ id: pvDocuments.id }).from(pvDocuments).where(eq(pvDocuments.templateId, active.id))
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/documente" className="hover:text-blueprint">
            ‹ Documente
          </Link>
        }
        title="Șabloane de PV"
        meta="Firma are deja PV-urile ei tipărite, cu antet și numere. Nu le rescriem — punem câmpurile peste ele, procentual, ca să se completeze singure."
      />

      {templates.length === 0 ? (
        <EmptyState title="Niciun șablon" hint="Un șablon e un PDF existent plus lista de câmpuri poziționate pe el." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {templates.map((t) => {
              const fields = (t.fields as TemplateField[]) ?? [];
              return (
                <Link
                  key={t.id}
                  href={`/documente/sabloane?sablon=${t.id}`}
                  className={`rounded-[3px] border px-2 py-0.5 text-tiny transition-colors ${
                    active?.id === t.id
                      ? "border-blueprint bg-blueprint text-white"
                      : "border-rule-strong bg-sheet text-ink-2 hover:bg-sunk hover:text-ink"
                  }`}
                >
                  {t.name}
                  <span className="ml-1.5 opacity-70">{fields.length}</span>
                </Link>
              );
            })}
          </div>

          {active ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 border-b border-rule pb-3">
                <h2 className="font-narrow text-[1.0625rem] font-semibold text-ink">
                  {active.name}
                </h2>
                <Badge>{TEMPLATE_KIND_LABEL[active.kind] ?? active.kind}</Badge>
                <span className="text-tiny text-ink-3">
                  {used.length === 0
                    ? "neutilizat încă"
                    : `${used.length} ${used.length === 1 ? "document emis" : "documente emise"}`}
                </span>
                {active.storageKey ? null : (
                  <span className="text-micro text-ink-3">
                    fără PDF încărcat — câmpurile se așază pe o foaie goală
                  </span>
                )}
              </div>

              <TemplateEditor
                key={active.id}
                templateId={active.id}
                templateKind={active.kind}
                initialFields={(active.fields as TemplateField[]) ?? []}
                canEdit={canEdit}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
