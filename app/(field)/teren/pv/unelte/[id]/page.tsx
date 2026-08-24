import { notFound } from "next/navigation";

import { saveToolProtocol } from "@/app/actions/teren-acte";
import { ActionButton } from "@/components/domain/FieldKit";
import { ChipPick, PhotoDeck, SignaturePad } from "@/components/domain/FieldParts";
import {
  Alert,
  Block,
  FieldBar,
  Label,
  Note,
  Pill,
  StaticRow,
  shortDate,
} from "@/components/domain/FieldUI";
import { toolProtocol } from "@/lib/field-data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Procesul verbal de unelte, în două etape care nu se pot amesteca.
 *
 * La PRIMIRE se consemnează starea și se BLOCHEAZĂ. Fără blocare, cel care a stricat o
 * unealtă ar putea, la predare, să corecteze starea de la început — și atunci PV-ul nu mai
 * dovedește nimic. La PREDARE se compară cu starea blocată, iar ce e diferit intră în
 * evidența depozitului.
 */

const CONDITIONS = [
  { value: "buna", label: "Bună" },
  { value: "uzata", label: "Uzată" },
  { value: "defecta", label: "Defectă" },
];

const RETURN_CONDITIONS = [
  { value: "la_fel", label: "La fel" },
  { value: "uzata", label: "Uzată în plus" },
  { value: "defecta", label: "Defectă" },
  { value: "lipsa", label: "Lipsă" },
];

const LABEL: Record<string, string> = {
  buna: "Bună",
  uzata: "Uzată",
  defecta: "Defectă",
  la_fel: "La fel",
  lipsa: "Lipsă",
};

export default async function PvUneltePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  const row = await toolProtocol(id);
  if (!row) notFound();

  const { protocol, tool } = row;
  // etapa 1 blocată ⇒ suntem la predare
  const phase = protocol.handoverLocked ? "predare" : "primire";
  const closed = protocol.status === "inchis";

  return (
    <form action={saveToolProtocol}>
      <input type="hidden" name="protocolId" value={id} />
      <input type="hidden" name="phase" value={phase} />

      <FieldBar
        title="Proces verbal unelte"
        sub={`${protocol.code} · ${tool?.name ?? "—"}`}
        back={protocol.workUnitId ? `/teren/lucrare/${protocol.workUnitId}?f=depozit` : "/teren/comenzi"}
      >
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Pill tone={closed ? "g" : "am-solid"}>{closed ? "Închis" : phase === "primire" ? "La primire" : "La predare"}</Pill>
          {tool?.code ? <Pill tone="on-dark">{tool.code}</Pill> : null}
        </div>
      </FieldBar>

      <div style={{ height: 16 }} />

      <Block>
        <StaticRow icon="tool" title={tool?.name ?? "—"} meta={tool?.category ?? "unealtă"} />
        <StaticRow
          icon="cal"
          title="Primită la"
          right={<Pill tone="n">{shortDate(protocol.handoverDate)}</Pill>}
        />
        <StaticRow icon="user" title="Predată de" meta={protocol.handoverByName} />
      </Block>

      {closed ? (
        <Alert tone="g" icon="check" title="Procesul verbal e închis">
          Unealta s-a întors în depozit pe {shortDate(protocol.returnDate)}.
        </Alert>
      ) : null}

      {phase === "predare" && !closed ? (
        <Alert tone="b" icon="info" title="Se compară cu starea de la primire">
          La primire era <b>{LABEL[protocol.handoverCondition ?? ""] ?? "neconsemnată"}</b>. Ce e
          diferit acum intră în evidența depozitului.
        </Alert>
      ) : null}

      {!closed ? (
        <>
          <Label>{phase === "primire" ? "Starea la primire" : "Starea la predare"}</Label>
          <div className="f-pad" style={{ paddingTop: 0 }}>
            <ChipPick
              name="condition"
              value={phase === "primire" ? "buna" : "la_fel"}
              options={phase === "primire" ? CONDITIONS : RETURN_CONDITIONS}
            />
          </div>

          <Block>
            <div className="f-fld">
              <label htmlFor="notes">Observații</label>
              <textarea
                id="notes"
                name="notes"
                placeholder={
                  phase === "primire"
                    ? "Ex: fierăstrăul are cablul roase la mufă"
                    : "Ex: s-a defectat pe 2 septembrie"
                }
              />
            </div>
          </Block>

          <Label>Poze</Label>
          <PhotoDeck />

          <Label>Semnătura mea</Label>
          <div className="f-blk f-p">
            <SignaturePad />
          </div>

          <Note>
            {phase === "primire"
              ? "După ce salvezi, starea de la primire se blochează și nu se mai poate schimba."
              : "La salvare, unealta se întoarce în depozit. Dacă e defectă, pleacă la reparații."}
          </Note>

          <div className="f-submit">
            <ActionButton
              label={phase === "primire" ? "Salvează recepția" : "Salvează predarea"}
              variant={phase === "primire" ? "pri" : "grn"}
              small={false}
              icon="check"
            />
          </div>
        </>
      ) : (
        <>
          <Label>Ce s-a consemnat</Label>
          <Block>
            <StaticRow
              icon="clip"
              title="La primire"
              meta={protocol.handoverNotes ?? "—"}
              right={<Pill tone="n">{LABEL[protocol.handoverCondition ?? ""] ?? "—"}</Pill>}
            />
            <StaticRow
              icon="check"
              title="La predare"
              meta={protocol.returnIssues ?? "—"}
              right={<Pill tone="g">{LABEL[protocol.returnCondition ?? ""] ?? "—"}</Pill>}
            />
          </Block>
        </>
      )}
    </form>
  );
}
