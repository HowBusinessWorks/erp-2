import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { FieldHeader } from "@/components/domain/FieldKit";
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
export default async function TerenSituatiePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;

  const [row] = await db
    .select({
      sl: situatiiLucrari,
      pkg: packages,
      subcontractor: partners,
      objective: objectives,
    })
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

  return (
    <div className="px-4 py-4">
      <FieldHeader
        eyebrow={row.subcontractor?.name ?? "Situație"}
        title={row.objective?.name ?? "—"}
        meta={
          <span>
            {MONTHS[row.sl.month - 1]} {row.sl.year} ·{" "}
            {todo === 0 ? (
              <span className="text-fill">tot verificat</span>
            ) : (
              <span className="text-warn">{todo} de verificat</span>
            )}
          </span>
        }
      />

      <div className="mt-4 space-y-3">
        {lines.map((l) => {
          const check = checkCumulative(l);
          const approved = Number(l.approvedCumulative ?? 0);
          return (
            <div
              key={l.id}
              className={`border px-4 py-3 ${
                l.verdict === "suspect"
                  ? "border-over bg-over-soft"
                  : l.verdict === "ok"
                    ? "border-fill bg-sheet"
                    : "border-rule-strong bg-sheet"
              }`}
            >
              <div className="font-narrow text-[1rem] font-semibold leading-tight text-ink">
                {l.name}
              </div>

              {/* Cantități, atât. Niciun leu. */}
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <Qty label="Contractat" value={Number(l.contractedQty ?? 0)} unit={l.unit} />
                <Qty label="Aprobat până acum" value={approved} unit={l.unit} />
                <Qty
                  label="Declarat acum"
                  value={Number(l.declaredQty ?? 0)}
                  unit={l.unit}
                  strong
                  alarming={check.blocked}
                />
              </div>

              {check.blocked ? (
                <p className="mt-2 border-l-2 border-over bg-over-soft px-3 py-1.5 text-tiny text-over">
                  Cu ce se declară acum s-ar depăși contractatul cu{" "}
                  <span className="font-medium">
                    {check.over.toFixed(2).replace(/\.?0+$/, "")} {l.unit}
                  </span>
                  . Dacă s-a lucrat într-adevăr atât, spune aici — biroul face suplimentare.
                </p>
              ) : null}

              <FieldVerdict lineId={l.id} verdict={l.verdict} comment={l.verdictComment} />
            </div>
          );
        })}
      </div>

      <Link
        href="/teren/situatii"
        className="mt-4 block text-center text-tiny text-ink-2"
      >
        ← Înapoi la situații
      </Link>
    </div>
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
    <div className="border border-rule bg-sunk px-2 py-1.5">
      <div className="text-[0.5625rem] uppercase leading-tight tracking-wider text-ink-3">
        {label}
      </div>
      <div
        className={`tabular font-narrow leading-none ${
          strong ? "text-[1.125rem] font-semibold" : "text-[1rem]"
        } ${alarming ? "text-over" : "text-ink"}`}
      >
        {value}
      </div>
      <div className="text-[0.5625rem] text-ink-3">{unit}</div>
    </div>
  );
}
