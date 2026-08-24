import { notFound } from "next/navigation";

import { Icon } from "@/components/domain/FieldIcons";
import {
  Block,
  ButtonLink,
  Buttons,
  Empty,
  FieldBar,
  Label,
  Pill,
  Row,
  StaticRow,
  shortDate,
} from "@/components/domain/FieldUI";
import { INSPECTION_TYPE_LABEL, inspectionDetail } from "@/lib/field-data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Fișa unei inspecții, citită după ce s-a închis.
 *
 * Ecranul se termină cu „ce s-a întâmplat mai departe" — intervențiile născute din
 * fișa asta. Fără secțiunea aia, o inspecție cu probleme e o listă de reproșuri fără
 * urmare; cu ea, se vede pe loc dacă cineva chiar a rezolvat ce s-a constatat.
 */
export default async function InspectieDetaliuPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  const data = await inspectionDetail(id);
  if (!data || data.unit.kind !== "inspectie") notFound();

  const nok = data.answers.filter((a) => a.ok === false);
  const open = nok.filter((a) => a.outcome !== "rezolvat");
  const tone = nok.length === 0 ? "g" : open.length > 0 ? "r" : "g";
  const verdict = nok.length === 0 ? "Fără probleme" : open.length > 0 ? "Cu probleme" : "Rezolvate";

  return (
    <>
      <FieldBar
        title={`Inspecția ${data.unit.code}`}
        sub={`${data.objective?.name ?? "—"} · ${shortDate(data.unit.endDate ?? data.unit.startDate)}`}
        back="/teren/mentenanta?f=insp"
      >
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Pill tone={tone}>{verdict}</Pill>
          {data.unit.discipline ? <Pill tone="on-dark">{data.unit.discipline}</Pill> : null}
          {data.unit.inspectionType ? (
            <Pill tone="on-dark">{INSPECTION_TYPE_LABEL[data.unit.inspectionType]}</Pill>
          ) : null}
        </div>
      </FieldBar>

      <div style={{ height: 16 }} />

      <Block>
        <StaticRow icon="file" title="Contract" right={<Pill tone="n">{data.contractLabel ?? "—"}</Pill>} />
        <StaticRow icon="pin" title="Obiectiv" meta={data.objective?.name ?? "—"} />
        <StaticRow icon="user" title="Persoana" meta={data.responsibleName ?? "—"} />
        {data.subcontractorName ? (
          <StaticRow icon="users" title="Subcontractant" meta={data.subcontractorName} />
        ) : null}
      </Block>

      <Label>Ce s-a constatat</Label>
      {data.answers.length === 0 ? (
        <Empty icon="clip" title="Fișa nu are puncte">
          S-a închis fără să se bifeze nimic.
        </Empty>
      ) : (
        <Block>
          {data.answers.map((answer) => (
            <div key={answer.id} className="f-li" style={{ display: "block" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  className={answer.ok === false ? "f-sq f-r" : "f-sq f-g"}
                  style={{ width: 30, height: 30, flex: "0 0 30px", borderRadius: 9 }}
                >
                  <Icon name={answer.ok === false ? "alert" : "check"} />
                </span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>
                  {answer.itemText}
                </span>
              </div>
              {answer.note ? (
                <p style={{ margin: "8px 0 0 40px", fontSize: 14.5, lineHeight: 1.5 }}>{answer.note}</p>
              ) : null}
              {answer.ok === false ? (
                <div style={{ marginLeft: 40, marginTop: 8 }}>
                  <Pill tone={answer.outcome === "rezolvat" ? "g" : "a"}>
                    {answer.outcome === "rezolvat"
                      ? "Rezolvat pe loc"
                      : answer.outcome === "interventie"
                        ? "Intervenție"
                        : "Propunere la birou"}
                  </Pill>
                </div>
              ) : null}
            </div>
          ))}
        </Block>
      )}

      {data.media.length > 0 ? (
        <>
          <Label>Poze</Label>
          <div className="f-blk f-p">
            <div className="f-phs">
              {data.media.map((item) => (
                <div key={item.id} className="f-ph">
                  <Icon name={item.kind === "video" ? "video" : "img"} />
                  <span className="f-tg">{item.label}</span>
                </div>
              ))}
            </div>
            <p className="f-xs f-mut" style={{ margin: "10px 2px 0" }}>
              {data.media.length} fișiere · conținutul se încarcă la sincronizare.
            </p>
          </div>
        </>
      ) : null}

      <Label>Ce s-a întâmplat mai departe</Label>
      {data.followUps.length === 0 ? (
        <Block>
          <StaticRow
            icon="check"
            tone="g"
            title="Nimic de urmărit"
            meta="Fișa s-a închis fără să lase ceva în urmă"
          />
        </Block>
      ) : (
        <Block>
          {data.followUps.map((unit) => (
            <Row
              key={unit.id}
              href={`/teren/interventii/${unit.id}`}
              icon="tool"
              tone={unit.status === "finalizata" ? "g" : unit.status === "in_lucru" ? "a" : "r"}
              title={`Intervenția ${unit.code}`}
              meta={`${unit.title} · ${shortDate(unit.startDate)}`}
              right={
                <Pill tone={unit.status === "finalizata" ? "g" : unit.status === "in_lucru" ? "a" : "r"}>
                  {unit.status === "finalizata"
                    ? "Finalizată"
                    : unit.status === "in_lucru"
                      ? "În lucru"
                      : "Planificată"}
                </Pill>
              }
            />
          ))}
        </Block>
      )}

      <Buttons>
        <ButtonLink
          href={`/teren/interventii/noua?loc=${data.unit.objectiveId}&src=${data.unit.id}`}
          icon="plus"
          variant="out"
        >
          Deschide o intervenție din fișa asta
        </ButtonLink>
      </Buttons>
    </>
  );
}
