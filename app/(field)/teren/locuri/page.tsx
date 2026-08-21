import Link from "next/link";

import { Icon } from "@/components/domain/FieldIcons";
import { Block, Empty, Label, Note, Pill, Progress } from "@/components/domain/FieldUI";
import { myPlaces } from "@/lib/field";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Locurile mele.
 *
 * Un loc e un OBIECTIV, nu o unitate de lucru: omul spune „sunt la Bloc A2", nu „sunt
 * pe UL-2411". Alegi locul o dată, și tot ce ține de el — jurnal, materiale, inventar,
 * fișe, acte — apare într-un singur meniu. Fără asta, aceleași ecrane s-ar cere de
 * cinci ori, cu alt filtru de fiecare dată.
 */
export default async function TerenLocuriPage() {
  const session = await requireSession();
  const places = await myPlaces(session.id);

  const santiere = places.filter((p) => p.type === "santier");
  const obiective = places.filter((p) => p.type === "mentenanta");
  const current = places[0] ?? null;

  return (
    <>
      <div className="f-bar">
        <div className="f-line1">
          <h1>
            Unde lucrezi
            <span className="f-sub">
              {places.length} {places.length === 1 ? "loc activ" : "locuri active"}
            </span>
          </h1>
        </div>
        {current ? (
          <Link href={`/teren/locuri/${current.objectiveId}`} className="f-place">
            <span className="f-pin">
              <Icon name="pin" />
            </span>
            <span className="f-t">
              <small>Cel mai recent</small>
              <b>{current.name}</b>
            </span>
            <span className="f-sw">Deschide</span>
          </Link>
        ) : null}
      </div>

      {places.length === 0 ? (
        <Empty icon="pin" title="Nu ai niciun loc deschis">
          Locurile apar aici când biroul îți atribuie o lucrare, o inspecție sau o
          intervenție.
        </Empty>
      ) : null}

      {santiere.length > 0 ? (
        <>
          <Label>Șantiere de construcții</Label>
          <Block>
            {santiere.map((place) => (
              <Link key={place.objectiveId} href={`/teren/locuri/${place.objectiveId}`} className="f-brow">
                <span className="f-sq f-a">
                  <Icon name="build" />
                </span>
                <span className="f-tx">
                  <b>{place.name}</b>
                  <span>{place.stageLabel ?? place.address ?? place.code}</span>
                  <span style={{ marginTop: 9 }}>
                    <Progress percent={place.percent} />
                  </span>
                </span>
                <Pill tone={place.open > 1 ? "a" : "g"}>
                  {place.open > 1 ? `${place.open} deschise` : "La zi"}
                </Pill>
              </Link>
            ))}
          </Block>
        </>
      ) : null}

      {obiective.length > 0 ? (
        <>
          <Label>Obiective de mentenanță</Label>
          <Block>
            {obiective.map((place) => (
              <Link key={place.objectiveId} href={`/teren/locuri/${place.objectiveId}`} className="f-brow">
                <span className="f-sq f-n">
                  <Icon name="tool" />
                </span>
                <span className="f-tx">
                  <b>{place.name}</b>
                  <span>
                    {place.contractLabel ? `Contract ${place.contractLabel} · ` : ""}
                    {place.address ?? place.code}
                  </span>
                </span>
                <Pill tone={place.open > 0 ? "r" : "g"}>
                  {place.open > 0 ? `${place.open} deschise` : "La zi"}
                </Pill>
              </Link>
            ))}
          </Block>
        </>
      ) : null}

      {places.length > 0 ? (
        <Note>
          Alege un loc și tot ce ține de el — jurnal, materiale, inventar, fișe, acte —
          apare într-un singur meniu.
        </Note>
      ) : null}
    </>
  );
}
