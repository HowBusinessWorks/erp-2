"use client";

import Link from "next/link";
import { useState } from "react";

import { submitInspectionSheet } from "@/app/actions/mentenanta";
import { Icon } from "./FieldIcons";
import { SubmitBar } from "./FieldKit";
import { BigChoice, ChipPick, PhotoDeck, QtyStepper } from "./FieldParts";
import { Alert, Block, Label, Note } from "./FieldUI";

/**
 * Fișa de inspecție, în trei pași: Unde · Ce ai găsit · Trimite.
 *
 * Un singur formular de la primul pas până la ultimul — pașii doar ascund câmpurile
 * care nu se completează acum. Așa „Înapoi" nu pierde nimic, iar la Trimite pleacă
 * tot deodată, într-un singur apel, inclusiv orele și materialele de la „rezolvat pe loc".
 *
 * Pasul 2 e locul unde se decide totul. „Nu am găsit probleme" închide fișa; „am rezolvat"
 * cere ore și materiale; „nu încă" cere titlul intervenției care se naște automat. De asta
 * întrebarea despre probleme e a doua, nu ultima: de ea atârnă restul ecranului.
 */

const STEPS = ["Unde", "Ce ai găsit", "Trimite"];

export function InspectionWizard({
  objectives,
  subcontractors,
  disciplines,
  stockLines,
  today,
  tomorrow,
  backHref,
  presetObjectiveId,
}: {
  objectives: { id: string; name: string; code: string }[];
  subcontractors: { id: string; name: string }[];
  disciplines: string[];
  stockLines: { id: string; name: string; unit: string; quantity: number }[];
  today: string;
  tomorrow: string;
  backHref: string;
  presetObjectiveId?: string;
}) {
  const [step, setStep] = useState(0);
  const [discipline, setDiscipline] = useState(disciplines[0] ?? "HVAC");
  const [objectiveId, setObjectiveId] = useState(presetObjectiveId ?? objectives[0]?.id ?? "");
  const [foundProblem, setFoundProblem] = useState("nu");
  const [resolved, setResolved] = useState("");
  const [description, setDescription] = useState("");

  const problem = foundProblem === "da";
  const objective = objectives.find((o) => o.id === objectiveId);
  const canContinue = step !== 1 || !problem || (description.trim().length > 0 && resolved !== "");

  return (
    <form action={submitInspectionSheet}>
      <div className="f-wtop">
        <div className="f-r1">
          {step === 0 ? (
            <Link href={backHref} className="f-ib" aria-label="Înapoi">
              <Icon name="left" />
            </Link>
          ) : (
            <button type="button" className="f-ib" onClick={() => setStep(step - 1)} aria-label="Înapoi">
              <Icon name="left" />
            </button>
          )}
          <span className="f-step">
            Pasul <b>{step + 1}</b> din 3
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
          <i style={{ width: `${((step + 1) / 3) * 100}%` }} />
        </div>
      </div>

      {/* ─────────── 1. unde și ce verifici ─────────── */}
      <div hidden={step !== 0}>
        <h2 className="f-q">Ce verifici azi?</h2>
        <p className="f-qs">Alege obiectivul și disciplina. Restul se completează singur.</p>

        <Label>Unde</Label>
        <Block>
          <div className="f-fld">
            <label htmlFor="objectiveId">Obiectiv</label>
            <select
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
            </select>
          </div>
          <div className="f-fld">
            <label htmlFor="day">Data</label>
            <input id="day" name="day" type="date" defaultValue={today} />
          </div>
          <div className="f-fld">
            <label htmlFor="subcontractorId">Subcontractant</label>
            <select id="subcontractorId" name="subcontractorId" defaultValue="">
              <option value="">— fără —</option>
              {subcontractors.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
            </select>
          </div>
        </Block>

        <Label>Ce verifici</Label>
        <div className="f-pad" style={{ paddingTop: 0 }}>
          <ChipPick
            name="discipline"
            value={discipline}
            onChange={setDiscipline}
            options={disciplines.map((d) => ({ value: d, label: d }))}
          />
        </div>

        <Label>Ce fel de inspecție</Label>
        <div className="f-pad" style={{ paddingTop: 0 }}>
          <ChipPick
            name="inspectionType"
            value="lunara"
            options={[
              { value: "lunara", label: "Lunară" },
              { value: "trimestriala", label: "Trimestrială" },
              { value: "anuala", label: "Anuală" },
              { value: "la_cerere", label: "La cerere" },
            ]}
          />
        </div>

        <div className="f-bts">
          <button type="button" className="f-bt f-pri" onClick={() => setStep(1)}>
            Continuă
            <Icon name="arrow" />
          </button>
        </div>
      </div>

      {/* ─────────── 2. ce ai găsit ─────────── */}
      <div hidden={step !== 1}>
        <h2 className="f-q">Ai găsit probleme?</h2>
        <p className="f-qs">De răspunsul ăsta atârnă tot ce urmează.</p>

        <Label>Poze de la inspecție</Label>
        <PhotoDeck />

        <div style={{ height: 14 }} />
        <BigChoice
          name="foundProblem"
          value={foundProblem}
          onChange={setFoundProblem}
          no={{ value: "nu", title: "Nu, e totul în regulă", hint: "Fișa se închide fără alți pași" }}
          yes={{ value: "da", title: "Da, am găsit probleme", hint: "Îți cer detalii mai jos" }}
        />

        {problem ? (
          <>
            <Label>Ce ai găsit</Label>
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

            <Label>Ai rezolvat-o pe loc?</Label>
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
                <select id="qualification" name="qualification" defaultValue="muncitor">
                  <option value="muncitor">Muncitor</option>
                  <option value="electrician">Electrician</option>
                  <option value="instalator">Instalator</option>
                </select>
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
                  defaultValue={`Remediere — ${discipline}`}
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
          <button type="button" className="f-bt f-gho" onClick={() => setStep(0)}>
            Înapoi
          </button>
          <button
            type="button"
            className="f-bt f-pri"
            disabled={!canContinue}
            onClick={() => setStep(2)}
          >
            Continuă
            <Icon name="arrow" />
          </button>
        </div>
        {!canContinue ? (
          <Note>Scrie ce ai găsit și spune dacă ai rezolvat-o, altfel constatarea se pierde.</Note>
        ) : null}
      </div>

      {/* ─────────── 3. verifică și trimite ─────────── */}
      <div hidden={step !== 2}>
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
              <b>Ce ai verificat</b>
            </div>
            <span className="f-num">{discipline}</span>
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
          <button type="button" className="f-bt f-gho" onClick={() => setStep(1)}>
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
