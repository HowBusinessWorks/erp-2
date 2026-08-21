"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { requestLeave } from "@/app/actions/leave";
import { Icon, type IconName } from "./FieldIcons";
import { SubmitBar } from "./FieldKit";
import {
  LEAVE_KIND_HINT,
  LEAVE_KIND_LABEL,
  consumesQuota,
  formatDayLong,
  nextWorkingDay,
  workingDaysBetween,
  type LeaveBalance,
  type LeaveKind,
} from "@/lib/leave";

/**
 * Cererea de concediu, în trei pași.
 *
 * O întrebare pe ecran. Formularul e unul singur, de la primul pas până la ultimul —
 * pașii doar ascund câmpurile care nu se completează acum. Așa nu se pierde nimic la
 * „Înapoi", iar la Trimite pleacă tot deodată, într-un singur apel.
 *
 * Zilele lucrătoare se calculează în timp ce omul mișcă datele, din `lib/leave.ts`,
 * care e pur — aceeași funcție rulează și pe server la depunere, deci cifra de pe
 * ecran și cea din baza de date nu pot să difere.
 */

const KINDS: { value: LeaveKind; icon: IconName }[] = [
  { value: "odihna", icon: "plane" },
  { value: "medical", icon: "alert" },
  { value: "fara_plata", icon: "cal" },
  { value: "eveniment_familial", icon: "users" },
];

export function LeaveWizard({
  balance,
  colleagues,
  minDate,
}: {
  balance: LeaveBalance;
  colleagues: { id: string; name: string }[];
  minDate: string;
}) {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<LeaveKind>("odihna");
  const [from, setFrom] = useState(minDate);
  const [to, setTo] = useState(minDate);

  const days = useMemo(() => workingDaysBetween(from, to), [from, to]);
  const returnDate = useMemo(() => (to ? nextWorkingDay(to) : ""), [to]);

  const counts = consumesQuota(kind);
  const left = counts ? balance.remaining - days : balance.remaining;
  const tooMany = counts && days > balance.remaining;
  const invalid = days <= 0 || to < from;

  return (
    <form action={requestLeave}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="returnDate" value={returnDate} />

      <div className="f-wtop">
        <div className="f-r1">
          {step === 0 ? (
            <Link href="/teren/concediu" className="f-ib" aria-label="Înapoi">
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
          <Link href="/teren/concediu" className="f-ib" aria-label="Renunță">
            <Icon name="x" />
          </Link>
        </div>
        <div className="f-wbar">
          <i style={{ width: `${((step + 1) / 3) * 100}%` }} />
        </div>
      </div>

      {/* ─────────── 1. felul concediului ─────────── */}
      <div hidden={step !== 0}>
        <h2 className="f-q">Ce fel de concediu?</h2>
        <p className="f-qs">Alege o variantă. Doar odihna scade din zilele pe an.</p>

        <div className="f-pad" style={{ paddingTop: 0 }}>
          {KINDS.map((option) => (
            <div key={option.value}>
              <input
                type="radio"
                id={`kind-${option.value}`}
                className="f-cc-input"
                name="kindPick"
                checked={kind === option.value}
                onChange={() => setKind(option.value)}
                style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
              />
              <label className="f-cc" htmlFor={`kind-${option.value}`}>
                <span className="f-sq">
                  <Icon name={option.icon} />
                </span>
                <span className="f-tx">
                  <b>{LEAVE_KIND_LABEL[option.value]}</b>
                  <span>{LEAVE_KIND_HINT[option.value]}</span>
                </span>
                <span className="f-tick">
                  <Icon name="check" />
                </span>
              </label>
            </div>
          ))}
        </div>

        <div className="f-wfoot">
          <button type="button" className="f-bt f-pri" onClick={() => setStep(1)}>
            Continuă
            <Icon name="arrow" />
          </button>
        </div>
      </div>

      {/* ─────────── 2. intervalul ─────────── */}
      <div hidden={step !== 1}>
        <h2 className="f-q">Când pleci și când te întorci?</h2>
        <p className="f-qs">Weekendul și sărbătorile legale nu se scad din concediu.</p>

        <div className="f-blk">
          <div className="f-fld">
            <label htmlFor="fromDate">Prima zi de concediu</label>
            <input
              id="fromDate"
              name="fromDate"
              type="date"
              value={from}
              min={minDate}
              onChange={(e) => {
                setFrom(e.target.value);
                if (e.target.value > to) setTo(e.target.value);
              }}
            />
          </div>
          <div className="f-fld">
            <label htmlFor="toDate">Ultima zi de concediu</label>
            <input
              id="toDate"
              name="toDate"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        <div className={`f-al f-${tooMany ? "r" : invalid ? "b" : "a"}`}>
          <Icon name={tooMany ? "alert" : "cal"} />
          <div style={{ flex: 1 }}>
            <b>
              {invalid
                ? "Alege un interval valid"
                : `${days} ${days === 1 ? "zi lucrătoare" : "zile lucrătoare"}`}
            </b>
            <p>
              {tooMany
                ? `Ai doar ${balance.remaining} zile disponibile. Scurtează intervalul sau alege „fără plată".`
                : !counts
                  ? "Nu scade din cele " + balance.entitled + " zile pe an."
                  : invalid
                    ? "Ultima zi trebuie să fie după prima."
                    : `Îți rămân ${left} zile din cele ${balance.entitled} pe an. Revii la lucru pe ${formatDayLong(returnDate)}.`}
            </p>
          </div>
        </div>

        <div className="f-blk">
          <div className="f-fld">
            <label htmlFor="replacementId">Cine te înlocuiește (opțional)</label>
            <select id="replacementId" name="replacementId" defaultValue="">
              <option value="">— nimeni —</option>
              {colleagues.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </div>
          <div className="f-fld">
            <label htmlFor="reason">Motiv (opțional)</label>
            <input id="reason" name="reason" placeholder="Ex: concediu planificat cu familia" />
          </div>
        </div>

        <div className="f-wfoot">
          <button type="button" className="f-bt f-gho f-back" onClick={() => setStep(0)}>
            Înapoi
          </button>
          <button
            type="button"
            className="f-bt f-pri"
            disabled={invalid || tooMany}
            onClick={() => setStep(2)}
          >
            Continuă
            <Icon name="arrow" />
          </button>
        </div>
      </div>

      {/* ─────────── 3. verifică și trimite ─────────── */}
      <div hidden={step !== 2}>
        <h2 className="f-q">Verifică și trimite</h2>
        <p className="f-qs">Cererea ajunge la managerul de proiect.</p>

        <div className="f-blk">
          <Line label="Fel" value={LEAVE_KIND_LABEL[kind]} />
          <Line label="De la" value={formatDayLong(from)} />
          <Line label="Până la" value={formatDayLong(to)} />
          <Line label="Zile lucrătoare" value={String(days)} />
          <Line label="Revin la lucru" value={returnDate ? formatDayLong(returnDate) : "—"} />
          <Line
            label="Rămân după"
            value={counts ? `${left} din ${balance.entitled}` : `${balance.remaining} din ${balance.entitled}`}
          />
        </div>

        <SubmitBar label="Trimite cererea" disabled={invalid || tooMany} />

        <div className="f-wfoot" style={{ paddingTop: 0 }}>
          <button type="button" className="f-bt f-gho" onClick={() => setStep(1)}>
            Înapoi la date
          </button>
        </div>
      </div>
    </form>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="f-li">
      <div className="f-tx">
        <b>{label}</b>
      </div>
      <span className="f-qv">{value}</span>
    </div>
  );
}
