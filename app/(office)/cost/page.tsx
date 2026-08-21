import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNotNull, sql as raw, type SQL } from "drizzle-orm";

import { MonthNav } from "@/components/domain/MonthNav";
import { Badge, PageHeader, SectionRule } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TFootRow, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import {
  contractComponents,
  contracts,
  costEntries,
  objectives,
  partners,
  workUnits,
} from "@/lib/db/schema";
import { formatShort, fromDb } from "@/lib/money";
import { labelPeriod, periodFromParams } from "@/lib/period";
import { canSeePrices } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

import { ManualCostForm } from "@/components/domain/OperabilityForms";
import {
  componentOptions,
  contractOptions,
  firmOptions,
  objectiveOptions,
  openWorkUnitOptions,
  partnerOptions,
} from "@/lib/pickers";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const COST_LABEL: Record<string, string> = {
  material: "Material",
  manopera: "Manoperă",
  servicii_subc: "Subcontractant",
  utilaj: "Utilaj",
  motorina: "Motorină",
  transport: "Transport",
  reparatii: "Reparații",
  alte: "Alte",
};

const STAGE_TONE: Record<string, "neutral" | "blueprint" | "warn" | "fill"> = {
  angajat: "warn",
  receptionat: "blueprint",
  consumat: "neutral",
  facturat: "fill",
};

const LIMIT = 150;

export default async function CostPage({
  searchParams,
}: {
  searchParams: Promise<{
    an?: string;
    luna?: string;
    analitica?: string;
    contract?: string;
    tip?: string;
    stadiu?: string;
    diferite?: string;
  }>;
}) {
  const session = await requireSession();
  if (!canSeePrices(session.role)) notFound();

  const sp = await searchParams;
  const period = periodFromParams(sp);

  // §9.10 — factura care nu vine printr-o recepție. Intră tot prin `recordCost`.
  const canAdd = can(session.role, "cost.realoca");
  const [firmOpts, contractOpts, componentOpts, objectiveOpts, unitOpts, supplierOpts] = canAdd
    ? await Promise.all([
        firmOptions(),
        contractOptions(),
        componentOptions(),
        objectiveOptions(),
        openWorkUnitOptions(),
        partnerOptions("furnizor"),
      ])
    : [[], [], [], [], [], []];

  /**
   * §12 — dubla analitică. Trebuie să fie limpede, pe fiecare ecran, pe care
   * dintre cele două e construit. Aici e un comutator explicit, nu o presupunere.
   *
   *   descărcat = pe ce buget se duce banul  → plafoane, marjă, control financiar
   *   folosit   = unde s-a întâmplat munca   → istoric obiectiv, raport către client
   */
  const analytic = sp.analitica === "folosit" ? "folosit" : "descarcat";
  const contractCol =
    analytic === "descarcat" ? costEntries.chargedContractId : costEntries.usedContractId;
  const componentCol =
    analytic === "descarcat" ? costEntries.chargedComponentId : costEntries.usedComponentId;

  const filters: SQL[] = [
    raw`extract(year from ${costEntries.effectDate}) = ${period.year}`,
    raw`extract(month from ${costEntries.effectDate}) = ${period.month}`,
  ];
  if (sp.contract) filters.push(eq(contractCol, sp.contract));
  if (sp.tip) filters.push(raw`${costEntries.costType} = ${sp.tip}`);
  if (sp.stadiu) filters.push(raw`${costEntries.stage} = ${sp.stadiu}`);
  // raportul de reconciliere: liniile unde cele două analitice diferă
  if (sp.diferite) filters.push(isNotNull(costEntries.splitReason));

  const where = and(...filters);

  const [rows, totals, byType, contractRows] = await Promise.all([
    db
      .select({
        entry: costEntries,
        contract: contracts,
        component: contractComponents,
        objective: objectives,
        unit: workUnits,
        supplier: partners,
      })
      .from(costEntries)
      .leftJoin(contracts, eq(contractCol, contracts.id))
      .leftJoin(contractComponents, eq(componentCol, contractComponents.id))
      .leftJoin(objectives, eq(costEntries.objectiveId, objectives.id))
      .leftJoin(workUnits, eq(costEntries.workUnitId, workUnits.id))
      .leftJoin(partners, eq(costEntries.supplierId, partners.id))
      .where(where)
      .orderBy(desc(costEntries.effectDate))
      .limit(LIMIT),
    db
      .select({
        n: raw<string>`count(*)`,
        total: raw<string>`coalesce(sum(${costEntries.value}), 0)`,
      })
      .from(costEntries)
      .where(where),
    db
      .select({
        costType: costEntries.costType,
        total: raw<string>`sum(${costEntries.value})`,
      })
      .from(costEntries)
      .where(where)
      .groupBy(costEntries.costType),
    db.select().from(contracts),
  ]);

  const count = Number(totals[0]?.n ?? 0);
  const grandTotal = fromDb(totals[0]?.total ?? "0");

  const qs = (patch: Record<string, string | undefined>) => {
    const s = new URLSearchParams({ an: String(period.year), luna: String(period.month) });
    const merged = { analitica: analytic, ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (v && k !== "an" && k !== "luna") s.set(k, v);
    }
    return `/cost?${s.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operațional"
        title="Registrul de cost"
        meta={`Fiecare leu cheltuit produce o linie aici, indiferent de sursă. Toate rapoartele sunt filtre pe tabela asta.`}
        actions={
          <>
            <MonthNav
              period={period}
              basePath="/cost"
              extraParams={{ analitica: analytic, contract: sp.contract }}
            />
            {canAdd ? (
              <ManualCostForm
                firms={firmOpts}
                contracts={contractOpts}
                components={componentOpts}
                objectives={objectiveOpts}
                workUnits={unitOpts}
                suppliers={supplierOpts}
              />
            ) : null}
          </>
        }
      />

      {/* Comutatorul de analitică — cel mai important control de pe ecran. */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-3">
        <div>
          <div className="eyebrow mb-1.5">Analitica</div>
          <div className="inline-flex rounded-[3px] border border-rule-strong">
            <Link
              href={qs({ analitica: "descarcat" })}
              className={`px-3 py-1 text-tiny transition-colors ${
                analytic === "descarcat" ? "bg-blueprint text-white" : "bg-sheet text-ink-2 hover:bg-sunk"
              }`}
            >
              Descărcat
            </Link>
            <Link
              href={qs({ analitica: "folosit" })}
              className={`border-l border-rule-strong px-3 py-1 text-tiny transition-colors ${
                analytic === "folosit" ? "bg-blueprint text-white" : "bg-sheet text-ink-2 hover:bg-sunk"
              }`}
            >
              Folosit
            </Link>
          </div>
          <p className="mt-1.5 max-w-md text-micro text-ink-3">
            {analytic === "descarcat"
              ? "Pe ce buget se duce banul. Alimentează plafoanele, marja și controlul financiar."
              : "Unde s-a întâmplat fizic munca. Alimentează istoricul obiectivului și raportul către client."}
          </p>
        </div>

        <div className="text-right">
          <div className="eyebrow">Total {labelPeriod(period)}</div>
          <div className="tabular text-xl font-semibold text-ink">{formatShort(grandTotal)}</div>
          <div className="text-micro text-ink-3">{count} linii</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip href={qs({ tip: undefined, stadiu: undefined, diferite: undefined, contract: undefined })} active={!sp.tip && !sp.stadiu && !sp.diferite && !sp.contract} label="Tot" />
        {byType.map((t) => (
          <Chip
            key={t.costType}
            href={qs({ tip: t.costType })}
            active={sp.tip === t.costType}
            label={`${COST_LABEL[t.costType]} · ${formatShort(fromDb(t.total))}`}
          />
        ))}
        <span aria-hidden className="mx-1 h-4 w-px bg-rule" />
        <Chip href={qs({ stadiu: "angajat" })} active={sp.stadiu === "angajat"} label="Doar angajat" />
        {/* Raportul de reconciliere din §12: dacă lista asta crește necontrolat,
            problema e în firmă, nu în software. */}
        <Chip href={qs({ diferite: "1" })} active={Boolean(sp.diferite)} label="Folosit ≠ descărcat" />
        <span aria-hidden className="mx-1 h-4 w-px bg-rule" />
        {contractRows
          .filter((c) => c.kind === "mentenanta")
          .map((c) => (
            <Chip key={c.id} href={qs({ contract: c.id })} active={sp.contract === c.id} label={c.code} />
          ))}
      </div>

      <Sheet>
        <Table>
          <THead>
            <TR>
              <TH>Data</TH>
              <TH>Document</TH>
              <TH>Contract</TH>
              <TH>Componentă</TH>
              <TH>Obiectiv</TH>
              <TH>Unitate</TH>
              <TH>Tip</TH>
              <TH>Stadiu</TH>
              <TH numeric>Valoare</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map(({ entry, contract, component, objective, unit, supplier }) => (
              <TR key={entry.id} className={entry.splitReason ? "bg-warn-soft/40" : undefined}>
                <TD muted className="whitespace-nowrap">
                  {entry.effectDate}
                  {entry.effectDate !== entry.documentDate ? (
                    <span
                      className="ml-1 text-micro text-warn"
                      title={`Document datat ${entry.documentDate}, raportat în luna aleasă`}
                    >
                      ≠
                    </span>
                  ) : null}
                </TD>
                <TD muted>
                  {entry.documentType}
                  {supplier ? <span className="block text-micro">{supplier.name}</span> : null}
                </TD>
                <TD>{contract?.code ?? "—"}</TD>
                <TD muted>{component?.name ?? "—"}</TD>
                <TD muted className="max-w-48 truncate">
                  {objective?.name ?? "—"}
                </TD>
                <TD>
                  {unit ? (
                    <Link href={`/lucrari/${unit.id}`} className="hover:text-blueprint">
                      {unit.code}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD muted>{COST_LABEL[entry.costType]}</TD>
                <TD>
                  <Badge tone={STAGE_TONE[entry.stage]}>{entry.stage}</Badge>
                </TD>
                <TD numeric strong>
                  {formatShort(fromDb(entry.value))}
                </TD>
              </TR>
            ))}
          </TBody>
          <tfoot>
            <TFootRow>
              <TD colSpan={8}>
                {count > LIMIT ? `Primele ${LIMIT} din ${count} linii` : `${count} linii`}
              </TD>
              <TD numeric>{formatShort(grandTotal)}</TD>
            </TFootRow>
          </tfoot>
        </Table>
      </Sheet>

      {sp.diferite ? (
        <p className="border-l-2 border-warn bg-warn-soft px-3 py-2 text-tiny text-warn">
          Liniile unde analitica „folosit” diferă de „descărcat” — munca s-a făcut într-un loc,
          banul s-a dus pe alt buget. Fiecare are motiv obligatoriu. Dacă lista crește de la lună
          la lună, decizia de rutare se ia prost, iar problema e în proces, nu în software.
        </p>
      ) : null}
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-[3px] border px-2 py-0.5 text-tiny transition-colors ${
        active
          ? "border-blueprint bg-blueprint text-white"
          : "border-rule-strong bg-sheet text-ink-2 hover:bg-sunk hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
