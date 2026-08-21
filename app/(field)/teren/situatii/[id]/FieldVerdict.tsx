"use client";

import { useState } from "react";

import { verifySlLine } from "@/app/actions/deviz";
import { Icon } from "@/components/domain/FieldIcons";

/**
 * T8 — verdictul pe o linie, cu degetul.
 *
 * Două butoane mari, cât o falangă. „Nu e așa" deschide câmpul de comentariu în
 * aceeași apăsare — nu într-un ecran nou, pentru că omul e pe schelă și nu vrea să
 * navigheze. Fără comentariu nu se trimite: o linie contestată fără explicație nu
 * ajută pe nimeni.
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
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <form action={verifySlLine}>
          <input type="hidden" name="lineId" value={lineId} />
          <input type="hidden" name="verdict" value="ok" />
          <button
            type="submit"
            onClick={() => setOpen(false)}
            className={verdict === "ok" ? "f-bt f-grn f-s" : "f-bt f-out f-s"}
          >
            <Icon name="check" />
            Corect
          </button>
        </form>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={verdict === "suspect" && !open ? "f-bt f-red f-s" : "f-bt f-out f-s"}
        >
          <Icon name="pen" />
          Nu e așa
        </button>
      </div>

      {verdict === "suspect" && comment && !open ? (
        <p
          style={{
            margin: "12px 0 0",
            background: "var(--f-rd-l)",
            color: "var(--f-rd)",
            borderRadius: 12,
            padding: "11px 13px",
            fontSize: 13.5,
            lineHeight: 1.45,
            fontWeight: 600,
          }}
        >
          {comment}
        </p>
      ) : null}

      {open ? (
        <form action={verifySlLine} style={{ marginTop: 12 }}>
          <input type="hidden" name="lineId" value={lineId} />
          <input type="hidden" name="verdict" value="suspect" />
          <textarea
            name="verdictComment"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Cât s-a făcut de fapt și ce e diferit"
            style={{
              width: "100%",
              border: "2px solid var(--f-line)",
              borderRadius: 14,
              padding: "12px 14px",
              fontSize: 16,
              fontFamily: "inherit",
              lineHeight: 1.5,
              resize: "none",
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={text.trim() === ""}
            className="f-bt f-red f-s"
            style={{ marginTop: 10 }}
          >
            <Icon name="check" />
            Trimite observația
          </button>
        </form>
      ) : null}
    </div>
  );
}
