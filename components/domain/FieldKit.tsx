"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Icon } from "./FieldIcons";

/**
 * Piesele de teren care au nevoie de stare.
 *
 * Regula de atingeri (CLAUDE.md, 6): ＋ costă una, alegerea acțiunii încă una, deci
 * ecranul de dedesubt are voie la UNA singură — Trimite. De asta bara de trimis e
 * lipită de degetul mare și e singurul buton de pe ecran.
 */

/* ───────────────────────── bara de Trimite ───────────────────────── */

export function SubmitBar({
  label = "Trimite",
  hint,
  variant = "pri",
  disabled,
}: {
  label?: string;
  hint?: ReactNode;
  variant?: "pri" | "grn" | "dark";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <div className="f-submit">
      {hint ? <p className="f-hint">{hint}</p> : null}
      <button type="submit" disabled={pending || disabled} className={`f-bt f-${variant}`}>
        {pending ? (
          "Se trimite…"
        ) : (
          <>
            <Icon name="check" />
            {label}
          </>
        )}
      </button>
    </div>
  );
}

/** Buton de acțiune într-un formular mic (anulare, decizie) — fără bara lipicioasă. */
export function ActionButton({
  label,
  variant = "gho",
  small = true,
  icon,
}: {
  label: string;
  variant?: "pri" | "out" | "gho" | "grn" | "red" | "dark";
  small?: boolean;
  icon?: "check" | "x" | "pen";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`f-bt f-${variant}${small ? " f-s" : ""}`}
    >
      {icon && !pending ? <Icon name={icon} /> : null}
      {pending ? "…" : label}
    </button>
  );
}

/* ───────────────────────── ＋ și cele patru acțiuni ───────────────────────── */

/**
 * A doua atingere din cele trei. Se deschide de sus, ca o foaie, și se închide
 * din buton — fundalul închide DOAR meniul ăsta, care nu conține date scrise.
 * Formularele cu date nu se închid la click în afară (regula 4).
 */
export function FieldQuickAdd({ workUnitId }: { workUnitId?: string }) {
  const [open, setOpen] = useState(false);
  const suffix = workUnitId ? `?ul=${workUnitId}` : "";

  const actions = [
    { href: `/teren/comenzi/nou${suffix}`, label: "Comand ceva", hint: "materiale, unelte, utilaj, transport", icon: "cart" as const },
    { href: "/teren/inspectii/noua", label: "Fișă de inspecție", hint: "trei pași, se închide singură", icon: "clip" as const },
    { href: `/teren/necesar${suffix}`, label: "Cer materiale", hint: "trei atingeri cap-coadă", icon: "box" as const },
    { href: "/teren/pontaj", label: "Pontaj", hint: "ziua împărțită pe lucrări", icon: "clock" as const },
    { href: `/teren/jurnal${suffix}`, label: "Jurnal de șantier", hint: "se deschide gata de scris", icon: "pen" as const },
    { href: `/teren/constatare${suffix}`, label: "Constatare", hint: "am văzut ceva, trebuie rezolvat", icon: "alert" as const },
  ];

  return (
    <>
      <button
        type="button"
        className="f-ib"
        onClick={() => setOpen(true)}
        aria-label="Adaugă"
      >
        <Icon name="plus" />
      </button>

      {open ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            bottom: "calc(-1 * var(--f-extra, 0px))",
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            background: "rgba(10,14,21,.55)",
          }}
        >
          <button
            type="button"
            aria-label="Închide"
            onClick={() => setOpen(false)}
            style={{ position: "absolute", inset: 0, border: 0, background: "transparent" }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              background: "#fff",
              borderRadius: "26px 26px 0 0",
              paddingBottom: "calc(20px + max(env(safe-area-inset-bottom), var(--f-extra, 0px)))",
            }}
          >
            <div
              style={{
                width: 44,
                height: 5,
                background: "#D3D8E0",
                borderRadius: 3,
                margin: "12px auto 0",
              }}
            />
            <div className="f-line1" style={{ padding: "10px 18px 4px", color: "#10151F" }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, flex: 1 }}>Ce vrei să faci?</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Închide"
                className="f-ib"
                style={{ background: "#EEF0F3", color: "#10151F" }}
              >
                <Icon name="x" />
              </button>
            </div>
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                onClick={() => setOpen(false)}
                className="f-brow"
              >
                <span className="f-sq f-a">
                  <Icon name={action.icon} />
                </span>
                <span className="f-tx">
                  <b>{action.label}</b>
                  <span>{action.hint}</span>
                </span>
                <span className="f-go">
                  <Icon name="right" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ───────────────────────── punctul de checklist ───────────────────────── */

/**
 * La NOK apare imediat ieșirea impusă — nu se poate trimite o constatare fără să
 * spui ce se întâmplă cu ea. Fără ieșire, constatarea moare în fișă și Delta rămâne
 * neumplută (§7).
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
    <div className="f-li" style={{ display: "block" }}>
      <input type="hidden" name="itemId" value={id} />
      <input type="hidden" name={`text_${id}`} value={text} />
      {section ? (
        <div className="f-xs f-mut" style={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>
          {section}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ flex: 1, fontSize: 15.5, lineHeight: 1.35, fontWeight: 600 }}>{text}</span>
        <span style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
          {(["ok", "nok"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setVerdict(value)}
              style={{
                width: 56,
                height: 48,
                borderRadius: 13,
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                border: "2px solid",
                borderColor:
                  verdict === value ? (value === "ok" ? "#0E9F6E" : "#E11D48") : "#E4E6EB",
                background:
                  verdict === value ? (value === "ok" ? "#0E9F6E" : "#E11D48") : "#fff",
                color: verdict === value ? "#fff" : "#6B7688",
              }}
            >
              {value === "ok" ? "OK" : "NOK"}
            </button>
          ))}
        </span>
      </div>
      <input type="hidden" name={`ok_${id}`} value={verdict} />

      {verdict === "nok" ? (
        <div style={{ marginTop: 12, borderLeft: "3px solid #E11D48", paddingLeft: 12 }}>
          <input
            name={`note_${id}`}
            placeholder="Ce ai găsit"
            style={{
              width: "100%",
              height: 46,
              borderRadius: 11,
              border: "2px solid #E4E6EB",
              padding: "0 12px",
              fontSize: 15,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          {/* Ieșirea e OBLIGATORIE. */}
          <div className="f-chz f-flat" style={{ marginTop: 10, gap: 7 }}>
            {[
              { value: "rezolvat", label: "Rezolvat pe loc" },
              { value: "interventie", label: "Intervenție" },
              { value: "propunere", label: "Propunere" },
            ].map((option, i) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name={`outcome_${id}`}
                  value={option.value}
                  defaultChecked={i === 0}
                  required
                />
                <span style={{ fontSize: 14, padding: "10px 13px" }}>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
