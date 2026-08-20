"use client";

import { useState } from "react";

import { verifySlLine } from "@/app/actions/deviz";
import { Badge, Button, Input } from "@/components/ui/primitives";
import { VERDICT_LABEL, VERDICT_TONE } from "@/lib/deviz";

/**
 * Verdictul pe o linie de situație (§10.3).
 *
 * „Suspect" cere motiv. O linie marcată suspect fără explicație e o acuzație pe care
 * nimeni nu o poate rezolva: subcontractantul nu știe ce să corecteze, iar PM-ul nu
 * știe ce să decidă. De asta câmpul de comentariu apare imediat ce apeși, iar butonul
 * de trimis rămâne blocat până scrii ceva.
 */
export function VerdictForm({
  lineId,
  verdict,
  comment,
}: {
  lineId: string;
  verdict: string;
  comment: string | null;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [text, setText] = useState(comment ?? "");

  if (pending === "suspect") {
    return (
      <form action={verifySlLine} className="flex items-center gap-1.5">
        <input type="hidden" name="lineId" value={lineId} />
        <input type="hidden" name="verdict" value="suspect" />
        <Input
          name="verdictComment"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="De ce e suspectă"
          className="h-7 w-44 text-micro"
          autoFocus
        />
        <Button type="submit" size="sm" variant="danger" disabled={text.trim() === ""}>
          trimite
        </Button>
        <button
          type="button"
          onClick={() => setPending(null)}
          className="text-micro text-ink-3 hover:text-ink"
        >
          renunț
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <form action={verifySlLine}>
        <input type="hidden" name="lineId" value={lineId} />
        <input type="hidden" name="verdict" value="ok" />
        <button
          type="submit"
          className={`rounded-[2px] border px-1.5 py-0.5 text-micro ${
            verdict === "ok"
              ? "border-fill bg-fill-soft font-medium text-fill"
              : "border-rule-strong bg-sheet text-ink-2 hover:bg-sunk"
          }`}
        >
          OK
        </button>
      </form>

      <button
        type="button"
        onClick={() => setPending("suspect")}
        className={`rounded-[2px] border px-1.5 py-0.5 text-micro ${
          verdict === "suspect"
            ? "border-over bg-over-soft font-medium text-over"
            : "border-rule-strong bg-sheet text-ink-2 hover:bg-sunk"
        }`}
        title={verdict === "suspect" ? (comment ?? "") : "Marchează suspect"}
      >
        Suspect
      </button>

      {verdict === "suspect" && comment ? (
        <span className="max-w-32 truncate text-micro text-over" title={comment}>
          {comment}
        </span>
      ) : verdict === "neverificat" ? (
        <Badge tone={VERDICT_TONE[verdict]}>{VERDICT_LABEL[verdict]}</Badge>
      ) : null}
    </div>
  );
}
