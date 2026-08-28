"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { submitInspectionSheet } from "@/app/actions/mentenanta";
import { Select } from "@/components/ui/select";
import { Icon } from "./FieldIcons";
import { SubmitBar } from "./FieldKit";
import { CheckRow, type WizardPoint } from "./InspectionChecklist";
import { BigChoice, ChipPick, PhotoDeck, QtyStepper } from "./FieldParts";
import { Alert, Block, Label, Note } from "./FieldUI";

/**
 * Fișa de inspecție, în patru pași: Unde · Ce verifici · Ce ai găsit · Trimite.
 *
 * Un singur formular de la primul pas până la ultimul — pașii doar ascund câmpurile
 * care nu se completează acum. Așa „Înapoi" nu pierde nimic, iar la Trimite pleacă
 * tot deodată, într-un singur apel, inclusiv orele și materialele de la „rezolvat pe loc".
 *
 * Pasul 2 e nou și e cel care schimbă fișa dintr-un text liber într-un act măsurabil:
 * alegi tipul de inspecție (același nomenclator ca la tichete), iar din el ies listele
 * care se aplică pe obiectivul ăsta — moștenite de la contract sau proprii. Bifezi ce ai
 * verificat efectiv; pasul 3 randează doar ce ai bifat.
 *
 * Verdictul nu se mai declară global. Iese din puncte: dacă vreun punct e „Problemă",
 * fișa are probleme. Întrebarea „ai rezolvat-o pe loc?" apare abia atunci.
 */

export type WizardList = {
  templateId: string;
  templateName: string;
  ticketTypeId: string | null;
  discipline: string;
  frequencyMonths: number;
  inherited: boolean;
  points: WizardPoint[];
};

const STEPS = ["Unde", "Ce verifici", "Ce ai găsit", "Trimite"];

function inspectionKindOf(frequencyMonths: number): string {
  if (frequencyMonths <= 1) return "lunara";
  if (frequencyMonths <= 3) return "trimestriala";
  if (frequencyMonths <= 12) return "anuala";
  return "la_cerere";
}

export function InspectionWizard({
  objectives,
  subcontractors,
  lists,
  disciplines,
  stockLines,
  today,
  tomorrow,
  reportPeriod,
  backHref,
  presetObjectiveId,
}: {
  objectives: { id: string; name: string; code: string }[];
  subcontractors: { id: string; name: string }[];
  /** listele efective per obiectiv — moștenite de la contract sau proprii */
  lists: Record<string, WizardList[]>;
  /** tipurile din nomenclator, pentru obiectivele fără nicio listă */
  disciplines: { id: string; name: string }[];
  stockLines: { id: string; name: string; unit: string; quantity: number }[];
  today: string;
  tomorrow: string;
  /** luna de raportare implicită, „2026-08" */
  reportPeriod: string;
  backHref: string;
  presetObjectiveId?: string;
}) {
  const [step, setStep] = useState(0);
  const [objectiveId, setObjectiveId] = useState(presetObjectiveId ?? objectives[0]?.id ?? "");

  const objectiveLists = useMemo(() => lists[objectiveId] ?? [], [lists, objectiveId]);
  const availableDisciplines = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const list of objectiveLists) {
      if (seen.has(list.discipline)) continue;
      seen.add(list.discipline);
      out.push(list.discipline);
    }
    if (out.length === 0) for (const d of disciplines) out.push(d.name);
    return out;
  }, [objectiveLists, disciplines]);

  const [discipline, setDiscipline] = useState(availableDisciplines[0] ?? "General");
  const activeDiscipline = availableDisciplines.includes(discipline)
    ? discipline
    : (availableDisciplines[0] ?? "General");

  const disciplineLists = objectiveLists.filter((l) => l.discipline === activeDiscipline);
  const allPoints = disciplineLists.flatMap((l) => l.points);

  // Implicit e bifat tot ce e în lista moștenită — omul debifează ce n-a apucat.
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const selected = allPoints.filter((p) => !skipped[p.id]);

  const [status, setStatus] = useState<Record<string, string>>({});
  const [freeVerdict, setFreeVerdict] = useState("nu");
  const problem =
    allPoints.length === 0 ? freeVerdict === "da" : selected.some((p) => status[p.id] === "nok");

  const [resolved, setResolved] = useState("");
  const [description, setDescription] = useState("");

  const objective = objectives.find((o) => o.id === objectiveId);
  const primaryList = disciplineLists[0];
  const ticketTypeId =
    primaryList?.ticketTypeId ?? disciplines.find((d) => d.name === activeDiscipline)?.id ?? "";

  const canLeaveSelection = selected.length > 0 || allPoints.length === 0;
  const canLeaveFindings = !problem || (description.trim().length > 0 && resolved !== "");

  /**
   * Pasul nou incepe de sus. Derularea o face `.f-main`, nu fereastra: shell-ul de
   * teren e `position: fixed`, deci `window.scrollTo` nu are ce misca — pasul 3, mai
   * lung decat ecranul, ramanea derulat la jumatate cand veneai inapoi la el.
   */
  function goto(next: number) {
    setStep(next);
    if (typeof document === "undefined") return;
    document.querySelector(".f-main")?.scrollTo({ top: 0 });
  }

  return (
    <form action={submitInspectionSheet}>
      <input type="hidden" name="ticketTypeId" value={ticketTypeId} />
      <input type="hidden" name="templateId" value={primaryList?.templateId ?? ""} />
      <input type="hidden" name="discipline" value={activeDiscipline} />
      <input
        type="hidden"
        name="inspectionType"
        value={inspectionKindOf(primaryList?.frequencyMonths ?? 1)}
      />

      <div className="f-wtop">
        <div className="f-r1">
          {step === 0 ? (
            <Link href={backHref} className="f-ib" aria-label="Înapoi">
              <Icon name="left" />
            </Link>
          ) : (
            <button type="button" className="f-ib" onClick={() => goto(step - 1)} aria-label="Înapoi">
              <Icon name="left" />
            </button>
          )}
          <span className="f-step">
            Pasul <b>{step + 1}</b> din 4
          </span>
          <Link href={backHref} className="f-ib" aria-label="Renunță">
            <Icon name="x" />
          </Link>
        </div>
        <div className="f-stp">
          {STEPS.map((name, i) => (
            <span key={name} style={{ display: "contents" }}>
              <span className={i <= step ? "f-s f-on" : "f-s"}>
                <span className="f-n">{i + 1}</span>
                <span>{name}</span>
              </span>
              {i < STEPS.length - 1 ? <span className="f-ln" /> : null}
            </span>
          ))}
        </div>
        <div className="f-wbar">
          <i style={{ width: `${((step + 1) / 4) * 100}%` }} />
        </div>
      </div>

      {/* ─────────── 1. unde și când ─────────── */}
      <div hidden={step !== 0}>
        <h2 className="f-q">Unde ai fost?</h2>
        <p className="f-qs">Obiectivul și datele. Contractul se deduce singur din ele.</p>

        <Label>Unde</Label>
        <Block>
          <div className="f-fld">
            <label htmlFor="objectiveId">Obiectiv</label>
            <Select
              tone="field"
              id="objectiveId"
              name="objectiveId"
              value={objectiveId}
              onChange={(event) => setObjectiveId(event.target.value)}
            >
              {objectives.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} — {option.code}
                </option>
              ))}
            </Select>
          </div>
          <div className="f-fld">
            <label htmlFor="day">Data inspecției</label>
            <input id="day" name="day" type="date" defaultValue={today} />
          </div>
          <div className="f-fld">
            <label htmlFor="reportPeriod">Luna de raportare</label>
            <input id="reportPeriod" name="reportPeriod" type="month" defaultValue={reportPeriod} />
          </div>
          <div className="f-fld">
            <label htmlFor="subcontractorId">Subcontractant</label>
            <Select tone="field" id="subcontractorId" name="subcontractorId" defaultValue="">
              <option value="">— fără —</option>
              {subcontractors.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
            </Select>
          </div>
        </Block>
        <Note>
          Luna de raportare decide în ce raport lunar pleacă fișa la client. Nu trebuie să fie luna
          în care ai fost pe teren.
        </Note>

        <div className="f-bts">
          <button type="button" className="f-bt f-pri" onClick={() => goto(1)}>
            Continuă
            <Icon name="arrow" />
          </button>
        </div>
      </div>

      {/* ─────────── 2. ce verifici ─────────── */}
      <div hidden={step !== 1}>
        <h2 className="f-q">Ce inspecție ai făcut?</h2>
        <p className="f-qs">Alege tipul, apoi bifează punctele pe care le-ai verificat efectiv.</p>

        <Label>Tipul de inspecție</Label>
        <div className="f-pad" style={{ paddingTop: 0 }}>
          <ChipPick
            name="disciplinePick"
            value={activeDiscipline}
            onChange={setDiscipline}
            options={availableDisciplines.map((d) => ({ value: d, label: d }))}
          />
        </div>

        {allPoints.length === 0 ? (
          <Alert tone="a" icon="clip" title="Nicio listă pe obiectivul ăsta">
            Listele de inspecție se leagă de contract la birou, iar obiectivul le moștenește. Poți
            trimite fișa și așa — rămâne o constatare liberă, fără acoperire măsurabilă.
          </Alert>
        ) : (
          <>
            <Label>
              Puncte de verificat — {selected.length} din {allPoints.length}
            </Label>
            {disciplineLists.map((list) => (
              <div key={list.templateId}>
                <Note>
                  {list.templateName} · {list.inherited ? "moștenită de la contract" : "listă proprie"}
                </Note>
                <Block>
                  {list.points.map((point) => (
                    <label key={point.id} className="f-li" style={{ cursor: "pointer" }}>
                      <div className="f-tx">
                        <b>{point.text}</b>
                        {point.section ? <span>{point.section}</span> : null}
                      </div>
                      <input
                        type="checkbox"
                        checked={!skipped[point.id]}
                        onChange={(event) =>
                          setSkipped((prev) => ({ ...prev, [point.id]: !event.target.checked }))
                        }
                        aria-label={point.text}
                      />
                    </label>
                  ))}
                </Block>
              </div>
            ))}
          </>
        )}

        <div className="f-bts">
          <button type="button" className="f-bt f-gho" onClick={() => goto(0)}>
            Înapoi
          </button>
          <button
            type="button"
            className="f-bt f-pri"
            disabled={!canLeaveSelection}
            onClick={() => goto(2)}
          >
            Continuă
            <Icon name="arrow" />
          </button>
        </div>
        {!canLeaveSelection ? (
          <Note>Bifează măcar un punct — altfel fișa nu spune nimic.</Note>
        ) : null}
      </div>

      {/* ─────────── 3. ce ai găsit ─────────── */}
      <div hidden={step !== 2}>
        <h2 className="f-q">Cum a ieșit?</h2>
        <p className="f-qs">Bifează fiecare punct. Un punct cu problemă trebuie să aibă o ieșire.</p>

        <Label>Poze de la inspecție</Label>
        <PhotoDeck />

        {selected.length > 0 ? (
          <>
            <Label>Punctele verificate</Label>
            <Block>
              {selected.map((point) => (
                <CheckRow
                  key={point.id}
                  point={point}
                  onStatus={(id, next) => setStatus((prev) => ({ ...prev, [id]: next }))}
                />
              ))}
            </Block>
          </>
        ) : (
          <>
            <div style={{ height: 14 }} />
            <BigChoice
              name="freeVerdict"
              value={freeVerdict}
              onChange={setFreeVerdict}
              no={{ value: "nu", title: "Nu, e totul în regulă", hint: "Fișa se închide fără alți pași" }}
              yes={{ value: "da", title: "Da, am găsit probleme", hint: "Îți cer detalii mai jos" }}
            />
          </>
        )}

        {problem ? (
          <>
            <Label>Ce ai găsit, pe scurt</Label>
            <Block>
              <div className="f-fld">
                <textarea
                  name="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Ex: ventilator obturat pe circuitul 3, vibrații puternice la pornire"
                />
              </div>
            </Block>

            <Label>Ai rezolvat pe loc?</Label>
            <BigChoice
              name="resolvedOnSite"
              value={resolved}
              onChange={setResolved}
              yes={{ value: "da", title: "Da, am rezolvat", hint: "Trec orele și materialele acum" }}
              no={{ value: "nu", title: "Nu încă", hint: "Planific o intervenție pentru mai târziu" }}
            />
          </>
        ) : null}

        {problem && resolved === "da" ? (
          <>
            <Alert tone="g" icon="check" title="Se generează automat fișa de intervenție">
              O fișă de intervenție, marcată explicit „provine din inspecția {objective?.code ?? ""}"
              , cu datele de mai jos preluate direct de aici.
            </Alert>

            <Label>Cât a durat</Label>
            <Block>
              <div className="f-li">
                <div className="f-tx">
                  <b>Ore</b>
                </div>
                <QtyStepper name="hours" defaultValue={2} ariaLabel="Ore" />
              </div>
              <div className="f-li">
                <div className="f-tx">
                  <b>Minute</b>
                </div>
                <QtyStepper name="minutes" defaultValue={30} step={15} max={45} ariaLabel="Minute" />
              </div>
              <div className="f-fld">
                <label htmlFor="qualification">Calificare</label>
                <Select tone="field" id="qualification" name="qualification" defaultValue="muncitor">
                  <option value="muncitor">Muncitor</option>
                  <option value="electrician">Electrician</option>
                  <option value="instalator">Instalator</option>
                </Select>
              </div>
              <div className="f-fld">
                <label htmlFor="interventionMaterialsNote">Ce ai folosit</label>
                <input
                  id="interventionMaterialsNote"
                  name="interventionMaterialsNote"
                  placeholder="Ex: piesă cumpărată, manoperă externă etc."
                />
              </div>
              <div className="f-fld">
                <label htmlFor="interventionCost">Cât a costat intervenția (lei)</label>
                <input
                  id="interventionCost"
                  name="interventionCost"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="0"
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.value = el.value.replace(/[^0-9]/g, "");
                  }}
                />
              </div>
            </Block>

            <Label>Ce materiale ai folosit</Label>
            {stockLines.length === 0 ? (
              <Alert tone="a" icon="box" title="Gestiunea echipei e goală">
                Poți trimite fișa și fără materiale. Le adaugi cu un bon de consum.
              </Alert>
            ) : (
              <Block>
                {stockLines.map((line) => (
                  <div key={line.id} className="f-li">
                    <input type="hidden" name="productId" value={line.id} />
                    <div className="f-tx">
                      <b>{line.name}</b>
                      <span>
                        în gestiune {line.quantity} {line.unit}
                      </span>
                    </div>
                    <QtyStepper
                      name={`qty_${line.id}`}
                      defaultValue={0}
                      max={line.quantity}
                      ariaLabel={line.name}
                    />
                  </div>
                ))}
              </Block>
            )}
          </>
        ) : null}

        {problem && resolved === "nu" ? (
          <>
            <Alert tone="a" icon="cal" title="Atunci hai să planificăm o intervenție">
              Se creează automat o fișă legată de inspecția asta, cu eticheta „În urma
              inspecției". O completezi când te apuci de treabă.
            </Alert>
            <Block>
              <div className="f-fld">
                <label htmlFor="followUpTitle">Titlul intervenției</label>
                <input
                  id="followUpTitle"
                  name="followUpTitle"
                  defaultValue={`Remediere — ${activeDiscipline}`}
                />
              </div>
              <div className="f-fld">
                <label htmlFor="plannedDay">Când o faci</label>
                <input id="plannedDay" name="plannedDay" type="date" defaultValue={tomorrow} />
              </div>
            </Block>
          </>
        ) : null}

        <div className="f-bts">
          <button type="button" className="f-bt f-gho" onClick={() => goto(1)}>
            Înapoi
          </button>
          <button
            type="button"
            className="f-bt f-pri"
            disabled={!canLeaveFindings}
            onClick={() => goto(3)}
          >
            Continuă
            <Icon name="arrow" />
          </button>
        </div>
        {!canLeaveFindings ? (
          <Note>Scrie ce ai găsit și spune dacă ai rezolvat-o, altfel constatarea se pierde.</Note>
        ) : null}
      </div>

      {/* ─────────── 4. verifică și trimite ─────────── */}
      <div hidden={step !== 3}>
        <h2 className="f-q">Gata. Verifică și trimite.</h2>
        <p className="f-qs">Fișa pleacă la PM. Ce nu s-a rezolvat pleacă mai departe singur.</p>

        <Block>
          <div className="f-li">
            <div className="f-tx">
              <b>Loc</b>
            </div>
            <span className="f-num">{objective?.name ?? "—"}</span>
          </div>
          <div className="f-li">
            <div className="f-tx">
              <b>Tipul inspecției</b>
            </div>
            <span className="f-num">{activeDiscipline}</span>
          </div>
          <div className="f-li">
            <div className="f-tx">
              <b>Puncte verificate</b>
            </div>
            <span className="f-num">
              {selected.length > 0 ? `${selected.length} din ${allPoints.length}` : "listă liberă"}
            </span>
          </div>
          <div className="f-li">
            <div className="f-tx">
              <b>Rezultat</b>
            </div>
            <span className="f-num">
              {!problem ? "Fără probleme" : resolved === "da" ? "Rezolvată pe loc" : "Rămâne deschisă"}
            </span>
          </div>
          {problem && resolved === "nu" ? (
            <div className="f-li">
              <div className="f-tx">
                <b>Se creează intervenția</b>
                <span>eticheta „În urma inspecției"</span>
              </div>
              <span className="f-num">da</span>
            </div>
          ) : null}
        </Block>

        <div className="f-bts">
          <button type="button" className="f-bt f-gho" onClick={() => goto(2)}>
            Înapoi
          </button>
        </div>

        <SubmitBar
          label="Trimite fișa"
          hint={
            problem && resolved === "da"
              ? "Orele intră în pontaj, materialele ies din gestiune."
              : problem
                ? "Intervenția se naște odată cu fișa, legată de ea."
                : "Fișa se închide și rămâne ca dovadă."
          }
        />
      </div>
    </form>
  );
}
