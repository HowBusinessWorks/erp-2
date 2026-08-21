import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { Block, FieldBar, Label, Pill } from "@/components/domain/FieldUI";
import { db } from "@/lib/db";
import { objectives, packages, partners, situatiiLucrari, slLines, workUnits } from "@/lib/db/schema";
import { checkCumulative } from "@/lib/deviz";
import { requireSession } from "@/lib/session";
import { FieldVerdict } from "./FieldVerdict";

export const dynamic = "force-dynamic";

const MONTHS = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

/**
 * T8 — verificarea unei situații, linie cu linie.
 *
 * **Zero prețuri.** Se văd cantitățile: cât s-a contractat, cât s-a aprobat până
 * acum, cât se declară luna asta. Atât îi trebuie omului care a fost acolo.
 */
export default async function TerenSituatiePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  const [row] = await db
    .select({ sl: situatiiLucrari, subcontractor: partners, objective: objectives })
    .from(situatiiLucrari)
    .leftJoin(packages, eq(situatiiLucrari.packageId, packages.id))
    .leftJoin(partners, eq(packages.subcontractorId, partners.id))
    .leftJoin(workUnits, eq(packages.workUnitId, workUnits.id))
    .leftJoin(objectives, eq(workUnits.objectiveId, objectives.id))
    .where(eq(situatiiLucrari.id, id))
    .limit(1);
  if (!row) notFound();

  const lines = await db
    .select()
    .from(slLines)
    .where(eq(slLines.situatieId, id))
    .orderBy(asc(slLines.createdAt));

  const todo = lines.filter((l) => l.verdict === "neverificat").length;
  const done = lines.length - todo;
  const percent = lines.length ? Math.round((done / lines.length) * 100) : 100;

  return (
    <>
      <FieldBar
        title={row.subcontractor?.name ?? "Situație"}
        sub={`${row.objective?.name ?? "—"} · ${MONTHS[row.sl.month - 1]} ${row.sl.year}`}
        back="/teren/situatii"
      >
        <div
          style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <span style={{ fontSize: 13.5, color: "#9AA5B6", fontWeight: 700 }}>
            {done} din {lines.length} verificate
          </span>
          <Pill tone={todo > 0 ? "am-solid" : "on-dark"}>
            {todo > 0 ? `${todo} rămase` : "gata"}
          </Pill>
        </div>
        <div className="f-prg f-on-dark" style={{ marginTop: 9 }}>
          <i style={{ width: `${percent}%` }} />
        </div>
      </FieldBar>

      <Label>Articolele declarate</Label>

      {lines.map((line) => {
        const check = checkCumulative(line);
        const approved = Number(line.approvedCumulative ?? 0);
        return (
          <div
            key={line.id}
            className="f-jc"
            style={
              line.verdict === "suspect"
                ? { borderLeft: "4px solid var(--f-rd)" }
                : line.verdict === "ok"
                  ? { borderLeft: "4px solid var(--f-gr)" }
                  : undefined
            }
          >
            <div className="f-h">
              <b style={{ fontSize: 16.5, lineHeight: 1.25 }}>{line.name}</b>
              {line.verdict !== "neverificat" ? (
                <Pill tone={line.verdict === "ok" ? "g" : "r"}>
                  {line.verdict === "ok" ? "Confirmat" : "Contestat"}
                </Pill>
              ) : null}
            </div>

            {/* Cantități, atât. Niciun leu. */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <Qty label="Contractat" value={Number(line.contractedQty ?? 0)} unit={line.unit} />
              <Qty label="Aprobat până acum" value={approved} unit={line.unit} />
              <Qty
                label="Declarat acum"
                value={Number(line.declaredQty ?? 0)}
                unit={line.unit}
                strong
                alarming={check.blocked}
              />
            </div>

            {check.blocked ? (
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
                Cu ce se declară acum s-ar depăși contractatul cu{" "}
                {check.over.toFixed(2).replace(/\.?0+$/, "")} {line.unit}. Dacă s-a lucrat
                într-adevăr atât, spune aici — biroul face suplimentare.
              </p>
            ) : null}

            <FieldVerdict lineId={line.id} verdict={line.verdict} comment={line.verdictComment} />
          </div>
        );
      })}
    </>
  );
}

function Qty({
  label,
  value,
  unit,
  strong,
  alarming,
}: {
  label: string;
  value: number;
  unit: string;
  strong?: boolean;
  alarming?: boolean;
}) {
  return (
    <div style={{ background: "#F4F5F7", borderRadius: 13, padding: "10px 8px", textAlign: "center" }}>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: ".06em",
          color: "var(--f-mut)",
          fontWeight: 800,
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: strong ? 22 : 18,
          fontWeight: 800,
          marginTop: 4,
          color: alarming ? "var(--f-rd)" : "var(--f-ink)",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--f-mut)" }}>{unit}</div>
    </div>
  );
}
