import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/domain/FieldIcons";
import {
  Alert,
  Block,
  ButtonLink,
  Buttons,
  Label,
  Pill,
  Progress,
  Row,
} from "@/components/domain/FieldUI";
import { dayState, placeById, placeUnits } from "@/lib/field";
import { requireSession } from "@/lib/session";
import { KIND_LABEL } from "@/lib/work-units";

export const dynamic = "force-dynamic";

/**
 * Meniul unui loc.
 *
 * Ecranul ăsta e motivul pentru care tabul „Locuri" există: alegi locul o dată și
 * tot ce ține de el intră aici. Un șantier de construcții și un obiectiv de mentenanță
 * au meniuri diferite, pentru că se lucrează diferit — la unul ții un jurnal și un
 * inventar, la celălalt faci inspecții și intervenții.
 */
export default async function TerenLocPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const place = await placeById(id, session.id);
  if (!place) notFound();

  const [units, day] = await Promise.all([placeUnits(id, session.id), dayState(session.id)]);
  const open = units.filter((u) => u.status !== "finalizata");
  const notStarted = open.filter((u) => u.status !== "in_lucru");

  const isSite = place.type === "santier";
  const ul = place.workUnitId ?? open[0]?.id ?? "";
  const suffix = ul ? `?ul=${ul}` : "";

  return (
    <>
      <div className="f-bar">
        <div className="f-line1">
          <Link href="/teren/locuri" className="f-ib" aria-label="Înapoi">
            <Icon name="left" />
          </Link>
          <h1 className="f-sm-title">
            {place.name}
            <span className="f-sub">
              {place.address ?? place.code}
              {place.contractLabel ? ` · contract ${place.contractLabel}` : ""}
            </span>
          </h1>
        </div>

        {isSite && place.stageLabel ? (
          <>
            <div
              style={{
                marginTop: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700 }}>{place.stageLabel}</span>
              <Pill tone="am-solid">{place.percent}%</Pill>
            </div>
            <div style={{ marginTop: 9 }}>
              <Progress percent={place.percent} onDark />
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <Pill tone="on-dark">{place.code}</Pill>
            <Pill tone="on-dark">
              {open.length} {open.length === 1 ? "fișă deschisă" : "fișe deschise"}
            </Pill>
          </div>
        )}
      </div>

      <div style={{ height: 16 }} />

      {notStarted.length > 0 ? (
        <Alert
          tone="r"
          icon="alert"
          title={`${notStarted.length} ${notStarted.length === 1 ? "lucru neînceput aici" : "lucruri neîncepute aici"}`}
          action={
            <ButtonLink href={`/teren/${notStarted[0].id}`} icon="arrow" variant="pri" small>
              Vezi ce e de făcut
            </ButtonLink>
          }
        >
          {notStarted
            .slice(0, 2)
            .map((u) => u.title)
            .join(" · ")}
        </Alert>
      ) : null}

      {/* Ce e deschis aici — fișele propriu-zise, apăsabile. */}
      {open.length > 0 ? (
        <>
          <Label>Fișe deschise aici</Label>
          <Block>
            {open.map((unit) => (
              <Row
                key={unit.id}
                href={`/teren/${unit.id}`}
                icon={unit.kind === "inspectie" ? "clip" : unit.kind === "lucrare" ? "build" : "tool"}
                tone={unit.status === "in_lucru" ? "a" : "n"}
                title={unit.title}
                meta={`${KIND_LABEL[unit.kind as keyof typeof KIND_LABEL]} · ${unit.code}`}
                right={
                  <Pill tone={unit.status === "in_lucru" ? "a" : "n"}>
                    {unit.status === "in_lucru" ? "În lucru" : "Neînceput"}
                  </Pill>
                }
              />
            ))}
          </Block>
        </>
      ) : null}

      <Label>Azi</Label>
      <Block>
        <Row
          href={`/teren/jurnal${suffix}`}
          icon="file"
          tone={day.journalToday ? "g" : "r"}
          title="Jurnal de șantier"
          meta={day.journalToday ? "Scris azi" : "Nu ai scris nimic azi"}
          right={<Pill tone={day.journalToday ? "g" : "r"}>{day.journalToday ? "Gata" : "De făcut"}</Pill>}
        />
        <Row
          href="/teren/pontaj"
          icon="clock"
          tone={day.hoursToday > 0 ? "g" : "r"}
          title="Pontaj"
          meta={day.hoursToday > 0 ? `${day.hoursToday} ore pontate azi` : "Nu ai pontat azi"}
          right={<Pill tone={day.hoursToday > 0 ? "g" : "r"}>{day.hoursToday > 0 ? "Trimis" : "De făcut"}</Pill>}
        />
      </Block>

      <Label>Materiale și scule</Label>
      <Block>
        <Row
          href={`/teren/necesar${suffix}`}
          icon="plus"
          tone="a"
          title="Cere materiale"
          meta="Merge la magazie, care are 24 de ore să acopere din stoc"
        />
        <Row
          href={`/teren/inventar?loc=${place.objectiveId}`}
          icon="box"
          title="Inventar"
          meta="Ce ai în gestiunea echipei"
        />
        <Row
          href={`/teren/consum${suffix}`}
          icon="clip"
          title="Bon de consum"
          meta="Scade ce ai folosit din gestiune"
        />
        <Row href="/teren/utilaje" icon="crane" title="Utilaje" meta="Ce ai pe șantier, contor și PV-uri" />
        <Row href="/teren/cereri" icon="list" title="Cererile mele" meta="Vezi unde au ajuns" />
      </Block>

      <Label>Acte</Label>
      <Block>
        <Row
          href="/teren/situatii"
          icon="clip"
          tone={day.slPending > 0 ? "r" : "n"}
          title="Situații de lucrări"
          meta="Ce a raportat subcontractantul"
          right={
            day.slPending > 0 ? (
              <Pill tone="r">{day.slPending} de verificat</Pill>
            ) : (
              <Pill tone="g">La zi</Pill>
            )
          }
        />
        <Row
          href={`/teren/constatare${suffix}`}
          icon="pen"
          title="Constatare"
          meta="Am văzut ceva, trebuie rezolvat"
        />
      </Block>

      <Buttons>
        <ButtonLink href="/teren/locuri" icon="swap">
          Schimbă locul
        </ButtonLink>
      </Buttons>
    </>
  );
}
