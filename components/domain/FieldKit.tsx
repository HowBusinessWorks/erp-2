"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Piesele comune ale interfeței de teren.
 *
 * Toate sunt proiectate în jurul aceleiași reguli: ＋ costă o atingere, alegerea
 * acțiunii încă una, deci ecranul de dedesubt are voie la UNA singură — Trimite.
 * Nimic de aici nu afișează lei.
 */

/** Butonul ＋ și cele patru acțiuni. A doua atingere din cele trei. */
export function FieldAddButton({ workUnitId }: { workUnitId?: string }) {
  const [open, setOpen] = useState(false);
  const suffix = workUnitId ? `?ul=${workUnitId}` : "";

  const actions = [
    { href: `/teren/necesar${suffix}`, label: "Necesar material", hint: "trei atingeri cap-coadă" },
    { href: "/teren/pontaj", label: "Pontaj", hint: "ziua împărțită pe lucrări" },
    { href: `/teren/jurnal${suffix}`, label: "Jurnal de șantier", hint: "se deschide gata de scris" },
    { href: `/teren/constatare${suffix}`, label: "Constatare", hint: "am văzut ceva, trebuie rezolvat" },
  ];

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-ink/40">
          {/* Fundalul închide DOAR meniul de acțiuni, care nu conține date scrise.
              Formularele cu date nu se închid așa — vezi regula modală. */}
          <button
            type="button"
            aria-label="Închide"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 mb-20 border-t border-rule bg-sheet">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="block border-b border-rule px-5 py-4 active:bg-sunk"
                onClick={() => setOpen(false)}
              >
                <span className="block font-narrow text-[1rem] font-semibold text-ink">
                  {action.label}
                </span>
                <span className="block text-tiny text-ink-2">{action.hint}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-16 right-4 z-30">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blueprint text-2xl font-light text-white shadow-[0_6px_20px_-6px_rgba(24,20,16,0.5)] active:brightness-95"
          aria-label={open ? "Închide" : "Adaugă"}
        >
          {open ? "✕" : "＋"}
        </button>
      </div>
    </>
  );
}

/** Singura atingere permisă pe ecranul de dedesubt. Se blochează cât timp trimite. */
export function SubmitBar({ label = "Trimite", hint }: { label?: string; hint?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-16 z-10 -mx-4 mt-6 border-t border-rule bg-sheet/95 px-4 py-3 backdrop-blur">
      {hint ? <p className="mb-2 text-tiny text-ink-2">{hint}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-[4px] bg-blueprint text-[0.9375rem] font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Se trimite…" : label}
      </button>
    </div>
  );
}

/** Antet de ecran de teren: unde ești, la ce lucrezi. */
export function FieldHeader({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: string;
  title: string;
  meta?: ReactNode;
}) {
  return (
    <header className="border-b border-rule pb-3">
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="mt-1 font-narrow text-xl font-semibold leading-tight tracking-tight text-ink">
        {title}
      </h1>
      {meta ? <div className="mt-1 text-tiny text-ink-2">{meta}</div> : null}
    </header>
  );
}

/**
 * Punctul de checklist. La NOK apare imediat ieșirea impusă — nu se poate trimite
 * o constatare fără să spui ce se întâmplă cu ea.
 */
export function ChecklistPoint({
  id,
  text,
  section,
}: {
  id: string;
  text: string;
  section?: string | null;
}) {
  const [verdict, setVerdict] = useState<"" | "ok" | "nok">("");

  return (
    <li className="border-b border-rule py-3">
      <input type="hidden" name="itemId" value={id} />
      <input type="hidden" name={`text_${id}`} value={text} />
      {section ? <div className="eyebrow mb-1">{section}</div> : null}
      <div className="flex items-start justify-between gap-3">
        <span className="text-[0.9375rem] leading-snug text-ink">{text}</span>
        <span className="flex shrink-0 gap-1">
          {(["ok", "nok"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setVerdict(value)}
              className={`h-10 w-12 rounded-[4px] border text-tiny font-semibold uppercase ${
                verdict === value
                  ? value === "ok"
                    ? "border-fill bg-fill text-white"
                    : "border-over bg-over text-white"
                  : "border-rule-strong bg-sheet text-ink-2"
              }`}
            >
              {value === "ok" ? "OK" : "NOK"}
            </button>
          ))}
        </span>
      </div>
      <input type="hidden" name={`ok_${id}`} value={verdict} />

      {verdict === "nok" ? (
        <div className="mt-2 space-y-2 border-l-2 border-over pl-3">
          <input
            name={`note_${id}`}
            placeholder="Ce ai găsit"
            className="h-10 w-full rounded-[3px] border border-rule-strong bg-sheet px-2.5 text-[0.875rem] text-ink"
          />
          {/* Ieșirea e OBLIGATORIE. Fără ea, constatarea moare aici. */}
          <div className="flex gap-1.5">
            {[
              { value: "rezolvat", label: "Rezolvat pe loc" },
              { value: "interventie", label: "Intervenție" },
              { value: "propunere", label: "Propunere" },
            ].map((option, i) => (
              <label key={option.value} className="grow">
                <input
                  type="radio"
                  name={`outcome_${id}`}
                  value={option.value}
                  defaultChecked={i === 0}
                  className="peer sr-only"
                  required
                />
                <span className="block cursor-pointer rounded-[3px] border border-rule-strong bg-sheet px-2 py-2 text-center text-micro font-medium text-ink-2 peer-checked:border-blueprint peer-checked:bg-blueprint peer-checked:text-white">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}
