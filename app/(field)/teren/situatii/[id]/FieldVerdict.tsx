"use client";

import { useState } from "react";

import { verifySlLine } from "@/app/actions/deviz";

/**
 * T8 — verdictul pe o linie, cu degetul.
 *
 * Două butoane mari, cât o falangă. „Suspect" deschide câmpul de comentariu în
 * aceeași apăsare — nu într-un ecran nou, pentru că omul e pe schelă și nu vrea să
 * navigheze. Fără comentariu nu se trimite: o linie marcată suspect fără explicație
 * nu ajută pe nimeni.
 */
export function FieldVerdict({
  lineId,
  verdict,
  comment,
}: {
  lineId: string;
  verdict: string;
  comment: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(comment ?? "");

  return (
    <div className="mt-2.5 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <form action={verifySlLine}>
          <input type="hidden" name="lineId" value={lineId} />
          <input type="hidden" name="verdict" value="ok" />
          <button
            type="submit"
            onClick={() => setOpen(false)}
            className={`h-12 w-full rounded-[4px] border text-[0.9375rem] font-semibold ${
              verdict === "ok"
                ? "border-fill bg-fill text-white"
                : "border-rule-strong bg-sheet text-ink active:bg-sunk"
            }`}
          >
            Corect
          </button>
        </form>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`h-12 w-full rounded-[4px] border text-[0.9375rem] font-semibold ${
            verdict === "suspect"
              ? "border-over bg-over text-white"
              : "border-rule-strong bg-sheet text-ink active:bg-sunk"
          }`}
        >
          Nu e așa
        </button>
      </div>

      {verdict === "suspect" && comment && !open ? (
        <p className="border-l-2 border-over bg-over-soft px-3 py-1.5 text-tiny text-over">
          {comment}
        </p>
      ) : null}

      {open ? (
        <form action={verifySlLine} className="space-y-2">
          <input type="hidden" name="lineId" value={lineId} />
          <input type="hidden" name="verdict" value="suspect" />
          <textarea
            name="verdictComment"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Cât s-a făcut de fapt și ce e diferit"
            className="w-full rounded-[4px] border border-rule-strong bg-sheet px-3 py-2 text-[0.9375rem] leading-relaxed text-ink"
          />
          <button
            type="submit"
            disabled={text.trim() === ""}
            className="h-11 w-full rounded-[4px] bg-over text-[0.9375rem] font-semibold text-white disabled:opacity-40"
          >
            Trimite observația
          </button>
        </form>
      ) : null}
    </div>
  );
}
