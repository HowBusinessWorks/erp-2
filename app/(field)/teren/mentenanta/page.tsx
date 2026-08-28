import { FilterSelect } from "@/components/domain/FieldKit";
import { Block, ButtonLink, Buttons, Empty, FieldBar, Filters, Label, Pill, Row } from "@/components/domain/FieldUI";
import { SOURCE_LABEL, maintenanceRows } from "@/lib/field-data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Mentenanța — lista de lucru a obiectivelor de mentenanță.
 *
 * Filele nu sunt „inspecții" și „intervenții", ci stări: de făcut, în lucru, gata.
 * Omul de teren nu se gândește la tipul fișei, ci la ce mai are de rezolvat azi;
 * inspecțiile își primesc fila lor la capăt, pentru că ele se citesc ca istoric,
 * nu ca sarcini.
 */

const TABS = [
  { value: "nou", label: "De făcut" },
  { value: "lucru", label: "În lucru" },
  { value: "gata", label: "Gata" },
  { value: "insp", label: "Inspecții" },
];

const VERDICT: Record<string, { label: string; tone: "g" | "r" | "a" }> = {
  fara_probleme: { label: "Fără probleme", tone: "g" },
  cu_probleme: { label: "Cu probleme", tone: "r" },
  rezolvate: { label: "Rezolvate", tone: "g" },
};

export default async function MentenantaPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; loc?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === sp.f) ? sp.f! : "nou";
  const place = sp.loc ?? "toate";

  const all = await maintenanceRows(session.id);

  const places = [...new Map(all.map((r) => [r.objectiveId, r.objectiveName])).entries()];

  const byPlace = place === "toate" ? all : all.filter((r) => r.objectiveId === place);

  const rows = byPlace.filter((row) => {
    if (tab === "insp") return row.kind === "inspectie";
    if (row.kind !== "interventie") return false;
    if (tab === "nou") return row.status === "propusa" || row.status === "planificata";
    if (tab === "lucru") return row.status === "in_lucru";
    return row.status === "finalizata" || row.status === "anulata";
  });

  const todo = byPlace.filter(
    (r) => r.kind === "interventie" && (r.status === "propusa" || r.status === "planificata"),
  ).length;

  const query = (next: { f?: string; loc?: string }) =>
    `/teren/mentenanta?f=${next.f ?? tab}&loc=${next.loc ?? place}`;

  return (
    <>
      <FieldBar title="Mentenanță" sub="Inspecțiile și intervențiile mele" back="/teren">
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Pill tone={todo > 0 ? "r" : "g"}>
            {todo > 0 ? `${todo} de făcut` : "Nimic neînceput"}
          </Pill>
          <Pill tone="on-dark">{byPlace.length} fișe</Pill>
        </div>
      </FieldBar>

      <Filters options={TABS} current={tab} hrefFor={(value) => query({ f: value })} />

      {places.length > 1 ? (
        <FilterSelect
          options={[{ value: "toate", label: "Toate obiectivele" }, ...places.map(([id, name]) => ({ value: id, label: name }))]}
          current={place}
          basePath="/teren/mentenanta"
          param="loc"
          query={{ f: tab }}
        />
      ) : null}

      {rows.length === 0 ? (
        <Empty icon={tab === "insp" ? "clip" : "tool"} title="Nicio fișă aici">
          Schimbă filtrul sau deschide una nouă.
        </Empty>
      ) : (
        <>
          <Label>{tab === "insp" ? "Fișe de inspecție" : "Fișe de intervenție"}</Label>
          <Block>
            {rows.map((row) => {
              const verdict = row.verdict ? VERDICT[row.verdict] : null;
              const href =
                row.kind === "inspectie" ? `/teren/inspectii/${row.id}` : `/teren/interventii/${row.id}`;
              const tone =
                row.kind === "inspectie"
                  ? (verdict?.tone ?? "n")
                  : row.status === "finalizata"
                    ? "g"
                    : row.status === "in_lucru"
                      ? "a"
                      : "r";
              return (
                <Row
                  key={row.id}
                  href={href}
                  icon={row.kind === "inspectie" ? "clip" : "tool"}
                  tone={tone}
                  title={row.title}
                  meta={[row.code, row.objectiveName, row.sourceTag ? SOURCE_LABEL[row.sourceTag] : null]
                    .filter(Boolean)
                    .join(" · ")}
                  right={
                    <Pill tone={tone}>
                      {row.kind === "inspectie"
                        ? (verdict?.label ?? "Fișă")
                        : row.status === "finalizata"
                          ? "Finalizată"
                          : row.status === "in_lucru"
                            ? "În lucru"
                            : "Neîncepută"}
                    </Pill>
                  }
                />
              );
            })}
          </Block>
        </>
      )}

      <Buttons>
        <ButtonLink href="/teren/inspectii/noua" icon="clip" variant="pri">
          Fișă de inspecție nouă
        </ButtonLink>
        <ButtonLink href="/teren/interventii/noua" icon="tool" variant="out">
          Fișă de intervenție nouă
        </ButtonLink>
      </Buttons>
    </>
  );
}
