/**
 * Partea a doua a seed-ului: munca propriu-zisă.
 *
 * Aici se generează unitățile de lucru, alocările de finanțare și liniile din
 * registrul de cost — astfel încât gauge-urile de pe panou să arate cifrele-țintă.
 * Fără partea asta, aplicația e corectă și goală, adică neconvingătoare.
 */

import { and, eq } from "drizzle-orm";

import { db } from "../lib/db";
import * as s from "../lib/db/schema";
import { nextWorkingDay, workingDaysBetween } from "../lib/leave";
import { toDb } from "../lib/money";
import { chance, dayIn, int, lastMonths, MONTH, pick, rnd, YEAR, type SeedContext } from "./index";

/**
 * Cât de plin să iasă fiecare gauge, per contract.
 *
 * ATENȚIE la aritmetică, e ușor de greșit: plafonul de cost e calculat ca
 * `venit × (1 − marjă țintă)`, adică 75% din venit. Deci un gauge la 70% înseamnă
 * cost = 0,52 × venit, adică **marjă de 48%** — o cifră care nu există în construcții
 * și care face demo-ul necredibil instantaneu.
 *
 * Ca marja să iasă în banda reală de 15–32%, consumul trebuie să stea la 85–105%
 * din plafon. Varietatea interesantă e pe Delta (23%–88%), nu pe marjă.
 */
const TARGETS: Record<string, { mentenanta: number; lucrari: number; delta: number }> = {
  "4700": { mentenanta: 0.89, lucrari: 0.85, delta: 0.67 },
  "4712": { mentenanta: 0.88, lucrari: 0.86, delta: 0.41 },
  "4718": { mentenanta: 0.94, lucrari: 0.92, delta: 0.23 },
  "4725": { mentenanta: 0.95, lucrari: 1.06, delta: 0.88 },
  "4731": { mentenanta: 0.86, lucrari: 0.79, delta: 0.35 },
  "4740": { mentenanta: 0.97, lucrari: 0.91, delta: 0.52 },
};

const COST_TYPES = ["material", "manopera", "servicii_subc", "utilaj", "transport"] as const;

export async function seedOperations(ctx: SeedContext) {
  const {
    firmRows, userRows, admin, pm, sefSantier, fleetManager,
    clients, suppliers, subcontractors, objectiveRows, contractRows,
    componentsByContract, objectivesByContract, checklistTemplates,
    productRows, warehouseRows, centralWarehouse, operationRows, mainFirm,
  } = ctx;

  const months = lastMonths(8);
  const maintenanceContracts = contractRows.filter((c) => c.kind === "mentenanta");

  /* ───────────────── perioade: lunile vechi se închid ───────────────── */
  console.log("→ perioade");
  const periodValues = [];
  for (const firm of firmRows) {
    for (const [i, m] of months.entries()) {
      // ultimele două luni rămân deschise — altfel nu se poate demonstra §13.1
      const closed = i < months.length - 2;
      periodValues.push({
        firmId: firm.id, year: m.year, month: m.month,
        closedAt: closed ? new Date(m.year, m.month, 5) : null,
        closedBy: closed ? admin.id : null,
      });
    }
  }
  await db.insert(s.periods).values(periodValues);

  /* ───────────────── unități de lucru + cost ───────────────── */
  console.log("→ unități de lucru, alocări, registru de cost");

  let unitCounter = 1000;
  const workUnitRows: (typeof s.workUnits.$inferSelect)[] = [];
  const costValues: (typeof s.costEntries.$inferInsert)[] = [];
  const allocationValues: (typeof s.fundingAllocations.$inferInsert)[] = [];

  /** împarte o sumă în n bucăți inegale, dar care se adună exact la total */
  function split(total: number, n: number): number[] {
    const weights = Array.from({ length: n }, () => 0.5 + rnd());
    const sumW = weights.reduce((a, b) => a + b, 0);
    const parts = weights.map((w) => Math.round((total * w) / sumW));
    const drift = total - parts.reduce((a, b) => a + b, 0);
    parts[0] += drift;
    return parts;
  }

  for (const contract of maintenanceContracts) {
    const comps = componentsByContract.get(contract.id)!;
    const objectives = objectivesByContract.get(contract.id)!;
    const target = TARGETS[contract.code] ?? { mentenanta: 0.7, lucrari: 0.7, delta: 0.5 };
    const owner = contract.ownerId ?? pm.id;

    for (const { year, month } of months) {
      for (const comp of comps) {
        const [budget] = await db
          .select()
          .from(s.componentBudgets)
          .where(
            and(
              eq(s.componentBudgets.componentId, comp.id),
              eq(s.componentBudgets.year, year),
              eq(s.componentBudgets.month, month),
            ),
          )
          .limit(1);
        if (!budget) continue;

        const cap = Number(budget.manualCap ?? budget.plan) * 100;
        const ratio = target[comp.kind as keyof typeof target] ?? 0.7;
        // puțină variație lunară, ca să nu iasă o linie dreaptă pe grafic
        const amount = Math.round(cap * ratio * (0.86 + rnd() * 0.28));
        if (amount <= 0) continue;

        if (comp.kind === "delta") {
          // Delta se umple cu lucrări mici, fiecare cu alocarea ei pe luna respectivă
          const count = int(1, 4);
          for (const piece of split(amount, count)) {
            const objective = pick(objectives);
            const [unit] = await db
              .insert(s.workUnits)
              .values({
                code: `L-${++unitCounter}`,
                kind: "lucrare",
                title: `${pick(operationRows).name} — ${objective.name}`,
                firmId: contract.firmId,
                objectiveId: objective.id,
                status: "finalizata",
                responsibleId: owner,
                executant: chance(0.45) ? "subcontractant" : "propriu",
                subcontractorId: chance(0.45) ? pick(subcontractors).id : null,
                startDate: dayIn(year, month, int(2, 12)),
                endDate: dayIn(year, month, int(14, 27)),
                estimatedValue: toDb(piece),
                budgetCost: toDb(Math.round(piece * 0.72)),
                createdBy: owner,
              })
              .returning();
            workUnitRows.push(unit);

            allocationValues.push({
              workUnitId: unit.id, contractId: contract.id, componentId: comp.id,
              year, month, allocatedValue: toDb(piece), status: "activ",
              reason: "Rutare din backlog Delta", createdBy: owner,
            });

            // costul real, sub valoarea alocată — de acolo iese marja
            for (const part of split(Math.round(piece * (0.6 + rnd() * 0.2)), int(2, 4))) {
              costValues.push(costLine(part, unit, contract, comp, objective, year, month, owner));
            }
          }
        } else {
          // Mentenanță și Lucrări: inspecții și intervenții care CONSUMĂ plafonul
          const count = comp.kind === "mentenanta" ? int(6, 14) : int(2, 5);
          for (const piece of split(amount, count)) {
            const objective = pick(objectives);
            const isInspection = comp.kind === "mentenanta" && chance(0.45);
            const [unit] = await db
              .insert(s.workUnits)
              .values({
                code: isInspection ? `I-${++unitCounter}` : `T-${++unitCounter}`,
                kind: isInspection ? "inspectie" : comp.kind === "lucrari" ? "lucrare" : "interventie",
                title: isInspection
                  ? `${pick(checklistTemplates).tpl.name} — ${objective.name}`
                  : `${pick(operationRows).name} — ${objective.name}`,
                firmId: contract.firmId,
                objectiveId: objective.id,
                status: "finalizata",
                responsibleId: owner,
                executant: chance(0.3) ? "subcontractant" : "propriu",
                subcontractorId: chance(0.3) ? pick(subcontractors).id : null,
                startDate: dayIn(year, month, int(1, 20)),
                endDate: dayIn(year, month, int(2, 27)),
                estimatedValue: toDb(Math.round(piece * 1.2)),
                budgetCost: toDb(piece),
                createdBy: owner,
              })
              .returning();
            workUnitRows.push(unit);

            allocationValues.push({
              workUnitId: unit.id, contractId: contract.id, componentId: comp.id,
              year, month, allocatedValue: toDb(piece), status: "activ",
              createdBy: owner,
            });

            for (const part of split(piece, int(1, 3))) {
              costValues.push(costLine(part, unit, contract, comp, objective, year, month, owner));
            }
          }
        }
      }
    }
  }

  function costLine(
    value: number,
    unit: typeof s.workUnits.$inferSelect,
    contract: typeof s.contracts.$inferSelect,
    comp: typeof s.contractComponents.$inferSelect,
    objective: typeof objectiveRows[number],
    year: number,
    month: number,
    actor: string,
  ): typeof s.costEntries.$inferInsert {
    const type = unit.executant === "subcontractant" ? "servicii_subc" : pick(COST_TYPES);
    const day = dayIn(year, month, int(3, 26));
    return {
      firmId: contract.firmId,
      documentDate: day,
      effectDate: day,
      objectiveId: objective.id,
      workUnitId: unit.id,
      usedContractId: contract.id,
      usedComponentId: comp.id,
      chargedContractId: contract.id,
      chargedComponentId: comp.id,
      costType: type,
      stage: "consumat",
      value: toDb(value),
      quantity: type === "manopera" ? String(int(2, 40)) : String(int(1, 60)),
      unit: type === "manopera" ? "ore" : "buc",
      qualification: type === "manopera" ? pick(["muncitor", "electrician", "instalator"]) : null,
      productId: type === "material" ? pick(productRows).id : null,
      documentType:
        type === "servicii_subc" ? "situatie_lucrari"
        : type === "manopera" ? "pontaj"
        : type === "material" ? "bon_consum"
        : "fisa",
      supplierId: type === "servicii_subc" ? unit.subcontractorId : type === "material" ? pick(suppliers).id : null,
      createdBy: actor,
    };
  }

  /**
   * Stratul „angajat" (P6): comenzi lansate și pachete semnate — bani cheltuiți
   * care încă n-au factură. Fără el, controlul de buget te anunță cu 3 săptămâni
   * întârziere. Se pune doar pe luna curentă; în lunile trecute totul e deja consumat.
   */
  const current = months[months.length - 1];
  for (const contract of maintenanceContracts) {
    const comps = componentsByContract.get(contract.id)!;
    const objectives = objectivesByContract.get(contract.id)!;
    for (const comp of comps.filter((c) => c.kind !== "delta")) {
      const [budget] = await db
        .select()
        .from(s.componentBudgets)
        .where(
          and(
            eq(s.componentBudgets.componentId, comp.id),
            eq(s.componentBudgets.year, current.year),
            eq(s.componentBudgets.month, current.month),
          ),
        )
        .limit(1);
      if (!budget) continue;

      const cap = Number(budget.plan) * 100;
      for (const part of split(Math.round(cap * (0.04 + rnd() * 0.09)), int(1, 3))) {
        const objective = pick(objectives);
        const day = dayIn(current.year, current.month, int(2, 20));
        costValues.push({
          firmId: contract.firmId,
          documentDate: day,
          effectDate: day,
          objectiveId: objective.id,
          usedContractId: contract.id,
          usedComponentId: comp.id,
          chargedContractId: contract.id,
          chargedComponentId: comp.id,
          costType: chance(0.6) ? "material" : "servicii_subc",
          stage: "angajat",
          value: toDb(part),
          quantity: String(int(1, 40)),
          unit: "buc",
          documentType: chance(0.6) ? "comanda" : "pachet_subc",
          supplierId: pick(suppliers).id,
          note: chance(0.5) ? "Comandă lansată, livrare în 14 zile" : null,
          createdBy: contract.ownerId ?? pm.id,
        });
      }
    }
  }

  // inserare în loturi — sunt câteva mii de linii
  for (let i = 0; i < allocationValues.length; i += 500) {
    await db.insert(s.fundingAllocations).values(allocationValues.slice(i, i + 500));
  }
  for (let i = 0; i < costValues.length; i += 500) {
    await db.insert(s.costEntries).values(costValues.slice(i, i + 500));
  }
  console.log(`   ${workUnitRows.length} unități de lucru · ${costValues.length} linii de cost`);

  /* ───────── câteva linii cu analitica despărțită (§12) ───────── */
  const splitCandidates = costValues.slice(0, 6);
  for (const [i, line] of splitCandidates.entries()) {
    const otherContract = maintenanceContracts[(i + 1) % maintenanceContracts.length];
    const otherComp = componentsByContract.get(otherContract.id)!.find((c) => c.kind === "mentenanta")!;
    await db
      .update(s.costEntries)
      .set({
        chargedContractId: otherContract.id,
        chargedComponentId: otherComp.id,
        splitReason: pick([
          "Material folosit pe alt obiectiv, decontat pe contractul de origine",
          "Echipă împrumutată între contracte",
          "Corecție de rutare acceptată de PM",
        ]),
      })
      .where(eq(s.costEntries.workUnitId, line.workUnitId!));
  }

  /* ───────────────── lucrări individuale, cu etape și deviz ───────────────── */
  console.log("→ lucrări individuale, devize, pachete, situații");

  const individualContracts = contractRows.filter((c) => c.kind !== "mentenanta");
  for (const contract of individualContracts) {
    const comp = componentsByContract.get(contract.id)![0];
    const objective = pick(objectiveRows);
    const total = Number(contract.totalValue) * 100;

    const [unit] = await db
      .insert(s.workUnits)
      .values({
        code: contract.code,
        kind: "lucrare",
        title: contract.name,
        firmId: contract.firmId,
        objectiveId: objective.id,
        status: "in_lucru",
        responsibleId: contract.ownerId ?? pm.id,
        executant: "propriu",
        startDate: dayIn(months[2].year, months[2].month, 5),
        endDate: dayIn(months[7].year, months[7].month, 25),
        estimatedValue: toDb(total),
        budgetCost: toDb(Math.round(total * 0.78)),
        createdBy: pm.id,
      })
      .returning();
    workUnitRows.push(unit);

    await db.insert(s.fundingAllocations).values({
      workUnitId: unit.id, contractId: contract.id, componentId: comp.id,
      year: months[2].year, month: months[2].month,
      allocatedValue: toDb(total), status: "activ", createdBy: pm.id,
    });

    // etape
    const stageNames = ["Organizare de șantier", "Demolări și pregătire", "Execuție structură", "Finisaje", "Recepție"];
    const stageBudgets = split(Math.round(total * 0.78), stageNames.length);
    const stageRows = await db
      .insert(s.workUnitStages)
      .values(
        stageNames.map((name, i) => ({
          workUnitId: unit.id,
          position: i + 1,
          name,
          startDate: dayIn(months[Math.min(2 + i, 7)].year, months[Math.min(2 + i, 7)].month, 3),
          endDate: dayIn(months[Math.min(3 + i, 7)].year, months[Math.min(3 + i, 7)].month, 26),
          materialBudget: toDb(Math.round(stageBudgets[i] * 0.6)),
          laborBudget: toDb(Math.round(stageBudgets[i] * 0.4)),
          percentOfWork: String(Math.round(100 / stageNames.length)),
        })),
      )
      .returning();

    // deviz client + deviz intern, cu mapare 1:1 pe majoritatea liniilor
    const [clientDeviz] = await db
      .insert(s.devize)
      .values({
        workUnitId: unit.id, kind: "client", version: 2, status: "acceptat",
        overheadPercent: "8", profitPercent: "12", createdBy: userRows[5].id,
      })
      .returning();
    const [internalDeviz] = await db
      .insert(s.devize)
      .values({
        workUnitId: unit.id, kind: "intern", version: 1, status: "draft",
        createdBy: contract.ownerId ?? pm.id,
      })
      .returning();

    const DEVIZ_LINES = [
      ["Montaj schelă fațadă", "mp", 420, 1200, 3600],
      ["Desfacere tencuială existentă", "mp", 380, 0, 5200],
      ["Hidroizolație bicomponentă 2 straturi", "mp", 310, 8700, 5000],
      ["Termoizolație EPS 10cm cu plasă", "mp", 290, 7400, 6500],
      ["Zugrăveli lavabile exterior", "mp", 290, 1350, 1800],
      ["Reparații punctuale beton", "mp", 65, 11200, 9800],
      ["Circuit electric exterior", "ml", 120, 1450, 2500],
      ["Montaj corpuri iluminat", "buc", 24, 11500, 6000],
      ["Demontaj schelă", "mp", 420, 0, 2100],
      ["Evacuare moloz", "to", 18, 0, 38000],
    ] as const;

    const clientLines = await db
      .insert(s.devizLines)
      .values(
        DEVIZ_LINES.map(([name, unitName, q, mat, lab], i) => ({
          devizId: clientDeviz.id,
          position: i + 1,
          category: i < 6 ? "Construcții" : i < 8 ? "Electrice" : "Diverse",
          name, unit: unitName,
          quantity: String(q),
          unitPrice: toDb(Math.round((mat + lab) * 1.2)),
          total: toDb(Math.round((mat + lab) * 1.2 * q)),
        })),
      )
      .returning();

    const internalLines = await db
      .insert(s.devizLines)
      .values(
        DEVIZ_LINES.map(([name, unitName, q, mat, lab], i) => ({
          devizId: internalDeviz.id,
          position: i + 1,
          category: i < 6 ? "Construcții" : i < 8 ? "Electrice" : "Diverse",
          name, unit: unitName,
          quantity: String(q),
          materialUnitPrice: toDb(mat),
          laborUnitPrice: toDb(lab),
          unitPrice: toDb(mat + lab),
          total: toDb((mat + lab) * q),
        })),
      )
      .returning();

    await db.insert(s.devizMapping).values(
      clientLines.map((cl, i) => ({
        clientLineId: cl.id,
        internalLineId: internalLines[i].id,
        coefficient: "1",
      })),
    );

    // pachete — DOAR manoperă, materialele nu intră niciodată (§8.3)
    const packageSpecs = [
      { name: "Pachet construcții", specialty: "constructii", lineIdx: [0, 1, 5, 8] },
      { name: "Pachet hidroizolații", specialty: "hidroizolatii", lineIdx: [2, 3] },
      { name: "Pachet electric", specialty: "electric", lineIdx: [6, 7] },
    ];

    for (const [pi, spec] of packageSpecs.entries()) {
      const sub = subcontractors.find((x) => x.specialty === spec.specialty) ?? pick(subcontractors);
      const [pkg] = await db
        .insert(s.packages)
        .values({
          workUnitId: unit.id,
          code: `${contract.code}-P${pi + 1}`,
          name: spec.name,
          specialty: spec.specialty,
          subcontractorId: sub.id,
          status: "acceptat",
          retentionPercent: sub.retentionPercent ?? "5",
          acceptedAt: new Date(months[2].year, months[2].month - 1, 20),
        })
        .returning();

      const pkgLines = await db
        .insert(s.packageLines)
        .values(
          spec.lineIdx.map((idx, i) => {
            const [name, unitName, q, , lab] = DEVIZ_LINES[idx];
            return {
              packageId: pkg.id,
              internalLineId: internalLines[idx].id,
              position: i + 1,
              name, unit: unitName,
              contractedQty: String(q),
              proposedPrice: toDb(lab),
              agreedPrice: toDb(Math.round(lab * (0.94 + rnd() * 0.12))),
            };
          }),
        )
        .returning();

      // situații de lucrări pe ultimele 3 luni
      for (const [mi, m] of months.slice(4, 7).entries()) {
        const isLast = mi === 2;
        const [sit] = await db
          .insert(s.situatiiLucrari)
          .values({
            packageId: pkg.id, year: m.year, month: m.month,
            code: isLast ? null : `SL-${contract.code}-${pi + 1}-${m.month}`,
            status: isLast ? "declarata" : "aprobata",
            declaredAt: new Date(m.year, m.month - 1, 28),
            verifiedBy: isLast ? null : sefSantier.id,
            verifiedAt: isLast ? null : new Date(m.year, m.month, 1),
            approvedBy: isLast ? null : pm.id,
            approvedAt: isLast ? null : new Date(m.year, m.month, 2),
          })
          .returning();

        await db.insert(s.slLines).values(
          pkgLines.map((pl) => {
            const contracted = Number(pl.contractedQty);
            const done = Math.round(contracted * (0.2 + mi * 0.25) * 100) / 100;
            const declared = Math.round(contracted * 0.25 * 100) / 100;
            const price = Number(pl.agreedPrice) * 100;
            return {
              situatieId: sit.id,
              packageLineId: pl.id,
              name: pl.name,
              unit: pl.unit,
              contractedQty: pl.contractedQty,
              executedCumulative: String(done),
              approvedCumulative: String(isLast ? Math.round(contracted * (0.2 + (mi - 1) * 0.25) * 100) / 100 : done),
              invoicedCumulative: String(isLast ? 0 : done),
              declaredQty: String(declared),
              unitPrice: pl.agreedPrice,
              value: toDb(Math.round(price * declared)),
              verdict: (isLast
                ? chance(0.2)
                  ? "suspect"
                  : "neverificat"
                : "ok") as "ok" | "suspect" | "neverificat",
              verdictComment: isLast && chance(0.2) ? "Cantitatea nu corespunde cu ce am măsurat pe teren." : null,
            };
          }),
        );

        // garanție reținută pe fiecare situație aprobată
        if (!isLast) {
          await db.insert(s.retentions).values({
            direction: "retinuta",
            partnerId: sub.id,
            contractId: contract.id,
            workUnitId: unit.id,
            situatieId: sit.id,
            value: toDb(int(120000, 640000)),
            percent: sub.retentionPercent ?? "5",
            dueDate: dayIn(m.year + 1, m.month, 15),
          });
        }
      }

      // o suplimentare propusă, în așteptare
      if (pi === 0) {
        await db.insert(s.supplements).values({
          packageId: pkg.id,
          name: "Reparații suplimentare la stratul suport, neprevăzute în deviz",
          unit: "mp",
          quantity: "42",
          unitPrice: toDb(9800),
          reason: "Stratul suport s-a dovedit degradat după decopertare.",
          verdict: "ok",
          verdictComment: "Verificat pe teren, cantitatea e reală.",
          status: "propus",
        });
      }
    }

    // costuri pe etape, ca bugetul pe etapă să nu fie gol (§22.4)
    const stageCosts: (typeof s.costEntries.$inferInsert)[] = [];
    for (const [si, stage] of stageRows.entries()) {
      if (si > 3) continue;
      const budget = (Number(stage.materialBudget) + Number(stage.laborBudget)) * 100;
      const spent = Math.round(budget * (si === 0 ? 0.98 : si === 1 ? 0.86 : si === 2 ? 0.62 : 0.14));
      for (const part of split(spent, int(3, 6))) {
        const m = months[Math.min(2 + si, 7)];
        const day = dayIn(m.year, m.month, int(4, 25));
        stageCosts.push({
          firmId: contract.firmId,
          documentDate: day, effectDate: day,
          objectiveId: objective.id, workUnitId: unit.id, stageId: stage.id,
          usedContractId: contract.id, usedComponentId: comp.id,
          chargedContractId: contract.id, chargedComponentId: comp.id,
          costType: pick(COST_TYPES),
          stage: "consumat",
          value: toDb(part),
          quantity: String(int(1, 40)),
          unit: "buc",
          documentType: "bon_consum",
          createdBy: pm.id,
        });
      }
    }
    // și ceva „angajat" — comenzi lansate, bani cheltuiți care încă n-au factură (P6)
    const m = months[6];
    stageCosts.push({
      firmId: contract.firmId,
      documentDate: dayIn(m.year, m.month, 18),
      effectDate: dayIn(m.year, m.month, 18),
      objectiveId: objective.id, workUnitId: unit.id, stageId: stageRows[3].id,
      usedContractId: contract.id, usedComponentId: comp.id,
      chargedContractId: contract.id, chargedComponentId: comp.id,
      costType: "material", stage: "angajat",
      value: toDb(int(400000, 1800000)),
      quantity: "1", unit: "buc",
      documentType: "comanda",
      supplierId: suppliers[0].id,
      note: "Comandă Kerakoll, lead-time 14 zile",
      createdBy: pm.id,
    });
    await db.insert(s.costEntries).values(stageCosts);
  }

  /**
   * Fișele — partea din care se construiește raportul lunar către client.
   *
   * NOTĂ: ponturile de aici NU produc linii de cost; costul de manoperă e deja
   * generat mai sus, cu ținte per componentă. Dacă s-ar genera din ore, plafoanele
   * ar ieși din banda de marjă. Pe fluxul viu (teren → pontaj) orele produc cost,
   * prin `recordCost`.
   */
  console.log("→ fișe de lucru");

  const answerValues: (typeof s.inspectionAnswers.$inferInsert)[] = [];
  const detailValues: (typeof s.interventionDetails.$inferInsert)[] = [];
  const timesheetValues: (typeof s.timesheets.$inferInsert)[] = [];
  const journalValues: (typeof s.siteJournalEntries.$inferInsert)[] = [];

  const workers = userRows.filter((u) => u.role === "sef_santier" || u.role === "pm");
  const NOK_NOTES = [
    "Fisură vizibilă, se lărgește față de luna trecută.",
    "Curge la îmbinare, s-a strâns provizoriu.",
    "Lipsește capacul de protecție.",
    "Corp de iluminat nefuncțional.",
    "Colmatare avansată, necesită curățare mecanizată.",
  ];

  for (const unit of workUnitRows) {
    const day = unit.endDate ?? unit.startDate ?? dayIn(YEAR, MONTH, 15);
    const worker = workers.length ? pick(workers) : pm;

    if (unit.kind === "inspectie") {
      // Fișa completă, cu 10–20% puncte NOK. Fiecare NOK are IEȘIRE — fără ea
      // constatarea moare în fișă și Delta rămâne neumplută.
      const template = pick(checklistTemplates);
      for (const text of template.items) {
        const ok = !chance(0.15);
        answerValues.push({
          workUnitId: unit.id,
          itemText: text,
          ok,
          note: ok ? null : pick(NOK_NOTES),
          outcome: ok ? null : pick(["rezolvat", "interventie", "propunere", "propunere"]),
        });
      }
      timesheetValues.push({
        userId: worker.id,
        workUnitId: unit.id,
        day,
        hours: String(int(2, 5)),
        qualification: "muncitor",
        createdBy: worker.id,
      });
    } else if (unit.kind === "interventie") {
      const hours = int(2, 8);
      detailValues.push({
        workUnitId: unit.id,
        description: pick([
          "Înlocuit piesa defectă, testat în funcționare.",
          "Curățat și degripat, refăcută etanșarea.",
          "Remediat provizoriu, necesită intervenție de fond.",
          "Reparat și repus în funcțiune, fără observații.",
        ]),
        hoursDeclared: String(hours),
        peopleCount: int(1, 3),
        resolvedAt: new Date(day),
      });
      timesheetValues.push({
        userId: worker.id,
        workUnitId: unit.id,
        day,
        hours: String(hours),
        qualification: pick(["muncitor", "electrician", "instalator"]),
        createdBy: worker.id,
      });
    } else if (chance(0.25)) {
      // Jurnal doar pe un sfert din lucrări — atât cât se scrie și în realitate.
      for (let i = 0; i < int(1, 3); i++) {
        journalValues.push({
          workUnitId: unit.id,
          day: unit.startDate ?? day,
          text: pick([
            "S-a lucrat la structură. Echipa completă, fără incidente.",
            "Turnat beton la fundație. Livrarea a întârziat două ore.",
            "Montaj instalație electrică, etapa 1. Restul materialului mâine.",
            "Finisaje interioare. Zona a fost predată curată beneficiarului.",
          ]),
          weather: pick(["senin", "înnorat", "ploaie", "vânt"]),
          peopleCount: int(2, 6),
          blocker: chance(0.25)
            ? pick([
                "Lipsă material — necesarul e la magazie.",
                "Acces blocat de beneficiar până la ora 11.",
                "Ploaie, s-a oprit turnarea.",
              ])
            : null,
          createdBy: worker.id,
        });
      }
    }
  }

  for (let i = 0; i < answerValues.length; i += 500) {
    await db.insert(s.inspectionAnswers).values(answerValues.slice(i, i + 500));
  }
  for (let i = 0; i < detailValues.length; i += 500) {
    await db.insert(s.interventionDetails).values(detailValues.slice(i, i + 500));
  }
  for (let i = 0; i < timesheetValues.length; i += 500) {
    await db.insert(s.timesheets).values(timesheetValues.slice(i, i + 500));
  }
  if (journalValues.length) {
    for (let i = 0; i < journalValues.length; i += 500) {
      await db.insert(s.siteJournalEntries).values(journalValues.slice(i, i + 500));
    }
  }
  console.log(
    `   ${answerValues.length} puncte de checklist · ${detailValues.length} fișe de intervenție · ` +
      `${timesheetValues.length} ponturi · ${journalValues.length} însemnări de jurnal`,
  );

  /* ───────────────── cereri, backlog, decizii de rutare ───────────────── */
  console.log("→ cereri și backlog");

  const requestValues: (typeof s.requests.$inferInsert)[] = [];
  let reqCounter = 1800;

  for (let i = 0; i < 46; i++) {
    const contract = pick(maintenanceContracts);
    const objective = pick(objectivesByContract.get(contract.id)!);
    const operation = pick(operationRows);
    const estimated = Math.round(Number(operation.estimatedCost) * 100 * (0.6 + rnd() * 2.4));
    const threshold = Number(contract.maintenanceThreshold) * 100;

    const decided = chance(0.62);
    const decision = !decided
      ? null
      : estimated < threshold
        ? "interventie_mentenanta"
        : estimated < 1200000
          ? "lucrare_delta"
          : chance(0.6)
            ? "lucrare_componenta"
            : "contract_nou";

    const kind = pick(["tichet", "tichet", "solicitare", "constatare", "propunere"] as const);
    requestValues.push({
      code: `C-${++reqCounter}`,
      kind,
      source: kind === "tichet" ? pick(["email", "email", "telefon"] as const) : kind === "constatare" ? "fisa_inspectie" : "manual",
      title: `${operation.name} — ${objective.name}`,
      description: pick([
        "Sesizare de la administrator: problema persistă de câteva zile.",
        "Constatat la inspecția lunară, punct NOK.",
        "Solicitare telefonică din partea beneficiarului.",
        "Observat de echipa proprie în timpul unei alte intervenții.",
      ]),
      firmId: contract.firmId,
      objectiveId: objective.id,
      contractId: contract.id,
      estimatedValue: toDb(estimated),
      operationId: operation.id,
      status: decided ? "aprobata" : chance(0.4) ? "evaluata" : "neprocesata",
      decision,
      decidedBy: decided ? contract.ownerId ?? pm.id : null,
      decidedAt: decided ? new Date(months[int(5, 7)].year, months[int(5, 7)].month - 1, int(3, 25)) : null,
      decisionNote: decided && decision === "lucrare_delta" ? "Intră în Delta lunii, mai e loc." : null,
      expiresAt: kind === "propunere" ? dayIn(months[7].year, months[7].month + 2 > 12 ? 12 : months[7].month + 2, 28) : null,
      sourceEmail:
        kind === "tichet" && chance(0.5)
          ? { from: "tehnic@apanova.ro", subject: `Sesizare ${objective.name}`, receivedAt: new Date().toISOString() }
          : null,
      requestedBy: pm.id,
    });
  }
  await db.insert(s.requests).values(requestValues);

  /* ───────────────── utilaje ───────────────── */
  console.log("→ utilaje, planificări, PV-uri, motorină, reparații");

  const EQUIPMENT = [
    ["EXC-01", "Excavator JCB 3CX", "excavator", ["sapaturi", "excavari", "incarcare"], 18500, 4820],
    ["EXC-02", "Miniexcavator Kubota U27", "excavator", ["sapaturi", "excavari"], 12000, 2140],
    ["NAC-01", "Nacelă articulată Genie Z-45", "nacela", ["lucru_la_inaltime"], 15000, 1680],
    ["NAC-02", "Nacelă foarfecă Haulotte", "nacela", ["lucru_la_inaltime"], 11000, 980],
    ["BUL-01", "Buldoexcavator Cat 428", "buldoexcavator", ["sapaturi", "incarcare", "nivelare"], 21000, 6310],
    ["CAM-01", "Camion basculant MAN 18t", "camion", ["transport", "evacuare"], 16000, 148000],
    ["CAM-02", "Camion platformă Iveco", "camion", ["transport", "transport_utilaj"], 14000, 96500],
    ["GEN-01", "Generator 60kVA", "generator", ["alimentare_santier"], 6500, 3120],
    ["GEN-02", "Generator 22kVA", "generator", ["alimentare_santier"], 4200, 1890],
    ["POM-01", "Motopompă 4\"", "pompa", ["epuismente"], 3800, 2410],
    ["COM-01", "Compactor placă vibrantă", "compactor", ["compactare"], 2400, 1120],
    ["COM-02", "Cilindru compactor Bomag", "compactor", ["compactare", "nivelare"], 9800, 3340],
    ["MAC-01", "Macara pe pneuri 25t", "macara", ["ridicare"], 32000, 2260],
    ["SCH-01", "Set schelă fațadă 400mp", "schela", ["lucru_la_inaltime"], 900, 0],
    ["CUP-01", "Autoutilitară Ford Transit", "autoutilitara", ["transport"], 5200, 214000],
  ] as const;

  const equipmentRows = await db
    .insert(s.equipment)
    .values(
      EQUIPMENT.map(([code, name, category, activities, rate, meter]) => ({
        code, name, category,
        activities: [...activities],
        firmId: firmRows[3].id,
        status: chance(0.14) ? ("service" as const) : ("disponibil" as const),
        internalHourlyRate: toDb(rate),
        hourMeter: String(meter),
        km: category === "camion" || category === "autoutilitara" ? String(meter * 3) : "0",
        itpExpiry: dayIn(YEARP(), int(1, 12), int(1, 28)),
        rcaExpiry: dayIn(YEARP(), int(1, 12), int(1, 28)),
        iscirExpiry: category === "macara" || category === "nacela" ? dayIn(YEARP(), int(1, 12), 15) : null,
        nextServiceHours: String(Math.round(meter / 250 + 1) * 250),
        nextServiceDate: dayIn(YEARP(), int(1, 12), int(1, 28)),
        accessories:
          category === "excavator" ? ["cupă săpat 60", "cupă taluz", "picon hidraulic"]
          : category === "nacela" ? ["telecomandă", "cablu alimentare"]
          : [],
      })),
    )
    .returning();

  function YEARP() {
    return new Date().getFullYear() + (chance(0.5) ? 0 : 1);
  }

  // solicitări de utilaj — unele în așteptare, ca inboxul managerului de flotă să aibă ce arăta
  const equipmentRequests = [];
  for (let i = 0; i < 9; i++) {
    const eq = pick(equipmentRows);
    const pending = i < 4;
    equipmentRequests.push({
      code: `CU-${++reqCounter}`,
      kind: "solicitare_utilaj" as const,
      source: "manual" as const,
      title: `${pick(eq.activities)} — ${pick(objectiveRows).name}`,
      description: `Necesar ${eq.category} pentru ${int(3, 12)} zile. ${chance(0.5) ? "Cu operator." : "Fără operator, manipulează echipa proprie."}`,
      firmId: mainFirm.id,
      objectiveId: pick(objectiveRows).id,
      equipmentId: pending ? null : eq.id,
      status: pending ? ("neprocesata" as const) : ("aprobata" as const),
      requestedBy: sefSantier.id,
      decidedBy: pending ? null : fleetManager.id,
      decidedAt: pending ? null : new Date(),
    });
  }
  // observații din teren pe utilaje
  for (let i = 0; i < 5; i++) {
    const eq = pick(equipmentRows);
    equipmentRequests.push({
      code: `OU-${++reqCounter}`,
      kind: "observatie_utilaj" as const,
      source: "utilaj" as const,
      title: pick([
        "Frâna funcționează necorespunzător",
        "Pierdere de ulei la brațul hidraulic",
        "Zgomot anormal la pornire",
        "Lipsă lumini de avertizare",
        "Consum de motorină neobișnuit de mare",
      ]),
      description: "Constatat pe șantier, la începutul programului.",
      firmId: mainFirm.id,
      equipmentId: eq.id,
      status: i < 3 ? ("neprocesata" as const) : ("aprobata" as const),
      requestedBy: sefSantier.id,
    });
  }
  const equipmentRequestRows = await db.insert(s.requests).values(equipmentRequests).returning();

  // planificări pe calendar
  const planningValues = [];
  for (let i = 0; i < 34; i++) {
    const eq = pick(equipmentRows);
    const startDay = int(1, 22);
    const m = pick(months.slice(5));
    planningValues.push({
      equipmentId: eq.id,
      workUnitId: pick(workUnitRows).id,
      objectiveId: pick(objectiveRows).id,
      responsibleId: pick([sefSantier.id, userRows[4].id]),
      fromDate: dayIn(m.year, m.month, startDay),
      toDate: dayIn(m.year, m.month, Math.min(startDay + int(2, 9), 28)),
      withOperator: chance(0.4),
      status: "planificata" as const,
    });
  }
  const planningRows = await db.insert(s.equipmentPlannings).values(planningValues).returning();

  // PV-uri: câteva închise, câteva DESCHISE — alea sunt cea mai importantă listă din modul
  const protocolValues = [];
  for (const [i, planning] of planningRows.slice(0, 12).entries()) {
    const open = i < 4;
    const eq = equipmentRows.find((e) => e.id === planning.equipmentId)!;
    const meter = Number(eq.hourMeter);
    protocolValues.push({
      code: `PV-${2000 + i}`,
      equipmentId: eq.id,
      planningId: planning.id,
      workUnitId: planning.workUnitId,
      status: open ? ("deschis" as const) : ("inchis" as const),
      handoverDate: planning.fromDate,
      handoverByName: fleetManager.name,
      handoverToUserId: planning.responsibleId,
      handoverToPersonName: sefSantier.name,
      handoverHourMeter: String(meter - int(10, 90)),
      handoverFuel: String(int(20, 120)),
      handoverCondition: "Bună, fără defecte vizibile",
      handoverAccessories: [...eq.accessories],
      handoverLocked: true,
      handoverSignature: "semnat",
      returnDate: open ? null : planning.toDate,
      returnByName: open ? null : pick([sefSantier.name, userRows[4].name]),
      returnHourMeter: open ? null : String(meter),
      returnFuel: open ? null : String(int(5, 60)),
      returnCondition: open ? null : pick(["Bună", "Bună, zgârieturi minore", "Necesită curățare"]),
      returnAccessories: open ? [] : [...eq.accessories],
      returnSignature: open ? null : "semnat",
    });
  }
  await db.insert(s.handoverProtocols).values(protocolValues);

  // prețul motorinei, pe zi
  const fuelPriceValues = [];
  const fpStart = new Date(YEAR, MONTH - 3, 1);
  for (let d = 0; d < 92; d++) {
    const day = new Date(fpStart.getTime() + d * 86400000);
    fuelPriceValues.push({
      day: day.toISOString().slice(0, 10),
      pricePerLiter: toDb(740 + int(-25, 30)),
      manualOverride: chance(0.05),
    });
  }
  await db.insert(s.fuelPrices).values(fuelPriceValues);

  // fișe de motorină + reparații
  const fuelLogValues = [];
  for (let i = 0; i < 120; i++) {
    const eq = pick(equipmentRows);
    const m = pick(months.slice(4));
    const liters = int(30, 180);
    const price = 740 + int(-20, 25);
    fuelLogValues.push({
      equipmentId: eq.id,
      workUnitId: pick(workUnitRows).id,
      day: dayIn(m.year, m.month, int(1, 27)),
      liters: String(liters),
      pricePerLiter: toDb(price),
      value: toDb(liters * price),
      hourMeter: String(Number(eq.hourMeter) - int(0, 120)),
      createdBy: sefSantier.id,
    });
  }
  await db.insert(s.fuelLogs).values(fuelLogValues);

  const repairValues = [];
  for (let i = 0; i < 22; i++) {
    const eq = pick(equipmentRows);
    const kind = pick(["interventie", "revizie", "gresare", "capitala"] as const);
    const labor = int(20000, 260000);
    const material = int(10000, 420000);
    const m = pick(months.slice(3));
    const linked = equipmentRequestRows.find((r) => r.kind === "observatie_utilaj" && r.equipmentId === eq.id);
    repairValues.push({
      equipmentId: eq.id,
      kind,
      requestId: linked?.id ?? null,
      description: kind === "revizie" ? "Revizie periodică la 250 ore" : pick(["Înlocuire furtun hidraulic", "Schimb ulei și filtre", "Reparație sistem frânare", "Înlocuire rulment"]),
      startedAt: dayIn(m.year, m.month, int(1, 20)),
      finishedAt: chance(0.85) ? dayIn(m.year, m.month, int(21, 27)) : null,
      hours: String(int(2, 40)),
      laborCost: toDb(labor),
      materialCost: toDb(material),
      invoices: chance(0.5)
        ? [{ supplier: "Service Utilaje SRL", number: `F${int(1000, 9999)}`, value: (labor + material) / 100 }]
        : [],
      totalCost: toDb(labor + material),
      immobilized: kind === "capitala",
    });
  }
  await db.insert(s.repairs).values(repairValues);

  /* ───────────────── unelte și transporturi ───────────────── */
  console.log("→ unelte și transporturi");
  const TOOLS = [
    "Rotopercutor Bosch GBH 5-40", "Flex 230 Makita", "Flex 125 Makita", "Bormașină cu acumulator",
    "Aparat sudură invertor", "Nivelă laser Leica", "Telemetru laser", "Pistol de bătut cuie",
    "Mașină de tăiat gresie", "Vibrator beton", "Malaxor mortar", "Aspirator industrial",
    "Scară telescopică 8m", "Set chei tubulare", "Termocamera FLIR", "Detector de metale în perete",
  ];
  await db.insert(s.tools).values(
    TOOLS.map((name, i) => ({
      code: `U-${String(i + 1).padStart(3, "0")}`,
      name,
      category: "scule electrice",
      firmId: mainFirm.id,
      status: chance(0.12) ? ("la_reparatii" as const) : ("activ" as const),
      warehouseId: warehouseRows[4].id,
      holderUserId: chance(0.5) ? pick([sefSantier.id, userRows[4].id, userRows[9].id]) : null,
      purchaseValue: toDb(int(45000, 890000)),
    })),
  );

  const transportValues = [];
  for (let i = 0; i < 28; i++) {
    const kind = pick([
      "livrare_material", "livrare_material", "transfer_santiere",
      "retur_magazie", "evacuare_moloz", "transport_utilaj",
    ] as const);
    const m = pick(months.slice(6));
    transportValues.push({
      code: `TR-${3000 + i}`,
      kind,
      status: pick(["ceruta", "planificata", "efectuata", "efectuata"] as const),
      autoGenerated: kind === "livrare_material" || kind === "transport_utilaj",
      sourceType: kind === "transport_utilaj" ? "equipment_planning" : kind === "livrare_material" ? "purchase_order" : null,
      fromText: kind === "retur_magazie" ? pick(objectiveRows).name : "Magazie centrală Glina",
      toText: kind === "retur_magazie" ? "Magazie centrală Glina" : pick(objectiveRows).name,
      workUnitId: pick(workUnitRows).id,
      day: dayIn(m.year, m.month, int(1, 28)),
      description: kind === "evacuare_moloz" ? `Evacuare ${int(2, 14)} to moloz` : null,
      cost: toDb(int(15000, 180000)),
      requestedBy: sefSantier.id,
    });
  }
  await db.insert(s.transports).values(transportValues);

  /* ───────────────── achiziții ───────────────── */
  console.log("→ comenzi și recepții");
  for (let i = 0; i < 24; i++) {
    const supplier = pick(suppliers);
    const channel = pick(["replenishment", "urgenta", "lucrare"] as const);
    const m = pick(months.slice(5));
    const [po] = await db
      .insert(s.purchaseOrders)
      .values({
        code: `PO-${4000 + i}`,
        firmId: mainFirm.id,
        supplierId: supplier.id,
        channel,
        status: pick(["lansata", "confirmata", "receptionata", "receptionata"] as const),
        orderedAt: dayIn(m.year, m.month, int(1, 24)),
        confirmedDeliveryAt: dayIn(m.year, m.month, int(25, 28)),
        deliverToWarehouseId: channel === "lucrare" ? pick(warehouseRows).id : centralWarehouse.id,
        warehouseCheckUntil: channel === "lucrare" ? new Date() : null,
        approvedBy: pm.id,
        createdBy: userRows[6].id,
      })
      .returning();

    const lineCount = int(2, 6);
    await db.insert(s.poLines).values(
      Array.from({ length: lineCount }, () => {
        const product = pick(productRows);
        const q = int(5, 120);
        const price = Number(product.lastPrice) * 100;
        return {
          poId: po.id,
          productId: product.id,
          quantity: String(q),
          receivedQty: String(po.status === "receptionata" ? q : 0),
          unitPrice: toDb(price),
          value: toDb(price * q),
          workUnitId: channel === "lucrare" ? pick(workUnitRows).id : null,
        };
      }),
    );
  }

  /**
   * Necesarul din teren, canalul C (§16): comenzi în stare de necesar, fără furnizor,
   * cu fereastra de 24h a magaziei încă deschisă. Fără ele, ecranul 24 arată filtrul
   * de 24h ca pe o stare goală — adică exact regula pe care demo-ul trebuie să o arate.
   */
  console.log("→ necesar din teren, în fereastra de 24h");
  const lucrariCuEtape = workUnitRows.filter((w) => w.kind === "lucrare").slice(0, 3);
  for (const [i, unit] of lucrariCuEtape.entries()) {
    const [need] = await db
      .insert(s.purchaseOrders)
      .values({
        code: `N-${5100 + i}`,
        firmId: mainFirm.id,
        channel: "lucrare",
        status: "draft",
        deliverToWarehouseId: centralWarehouse.id,
        // una aproape expirată, ca să se vadă și avertismentul, nu doar starea liniștită
        warehouseCheckUntil: new Date(Date.now() + (i === 0 ? 3 : 14 + i) * 3600 * 1000),
        createdBy: sefSantier.id,
      })
      .returning();

    await db.insert(s.poLines).values(
      Array.from({ length: int(1, 3) }, () => {
        const product = pick(productRows);
        const q = int(4, 30);
        const price = Number(product.lastPrice) * 100;
        return {
          poId: need.id,
          productId: product.id,
          quantity: String(q),
          unitPrice: toDb(price),
          value: toDb(price * q),
          workUnitId: unit.id,
        };
      }),
    );
  }

  /* ───────────────── documente ───────────────── */
  console.log("→ arbore de documente și șabloane de PV");
  const [root] = await db
    .insert(s.fileNodes)
    .values({ kind: "folder", name: "Damina", createdBy: admin.id })
    .returning();

  for (const contract of contractRows.slice(0, 4)) {
    const [contractFolder] = await db
      .insert(s.fileNodes)
      .values({ parentId: root.id, kind: "folder", name: `${contract.code} — ${contract.name}`, contractId: contract.id, createdBy: admin.id })
      .returning();
    for (const sub of ["Deviz", "Oferte", "Avize", "Facturi", "PV", "Poze", "Recepții"]) {
      await db.insert(s.fileNodes).values({
        parentId: contractFolder.id, kind: "folder", name: sub, createdBy: admin.id,
      });
    }
  }

  await db.insert(s.pvTemplates).values([
    { name: "PV predare-primire utilaj", kind: "predare_utilaj", fields: [] },
    { name: "PV predare-primire unelte", kind: "predare_unelte", fields: [] },
    { name: "PV custodie material la subcontractant", kind: "custodie", fields: [] },
    { name: "PV recepție lucrări ascunse", kind: "lucrari_ascunse", fields: [] },
    { name: "PV recepție la terminarea lucrărilor", kind: "receptie_finala", fields: [] },
    { name: "PV de inventar", kind: "inventar", fields: [] },
  ]);

  /* ───────────────── rapoarte lunare și facturi ───────────────── */
  console.log("→ rapoarte lunare și facturi");
  const reportValues = [];
  const invoiceValues = [];
  let invoiceNo = 1240;

  for (const contract of maintenanceContracts) {
    for (const [i, m] of months.slice(4).entries()) {
      const frozen = i < 3;
      reportValues.push({
        contractId: contract.id, year: m.year, month: m.month,
        version: 1,
        status: frozen ? "trimis" : "draft",
        frozenAt: frozen ? new Date(m.year, m.month, 3) : null,
        approvedBy: frozen ? contract.ownerId ?? pm.id : null,
        sentAt: frozen ? new Date(m.year, m.month, 4) : null,
      });

      if (frozen) {
        const monthly = Number(contract.monthlyValue) * 100;
        invoiceValues.push({
          firmId: contract.firmId,
          contractId: contract.id,
          clientId: contract.clientId,
          series: "DMF",
          number: ++invoiceNo,
          issueDate: dayIn(m.year, m.month, 5),
          dueDate: dayIn(m.year, m.month + 2 > 12 ? 12 : m.month + 2, 15),
          status: i === 0 ? ("incasata" as const) : ("trimisa" as const),
          netValue: toDb(monthly),
          vatValue: toDb(Math.round(monthly * 0.19)),
          totalValue: toDb(Math.round(monthly * 1.19)),
          efacturaStatus: "trimis",
        });
      }
    }
  }
  await db.insert(s.monthlyReports).values(reportValues);
  await db.insert(s.invoices).values(invoiceValues);

  /*
   * Notificările NU se mai seedează. Clopoțelul își calculează semnalele din date
   * la fiecare încărcare (`lib/notifications.ts`), deci rânduri fixe aici ar fi
   * fost un al doilea adevăr — și primul care se strică, pentru că nu le schimbă
   * nimeni când situația se rezolvă. Tabela rămâne pentru mesaje om-către-om.
   */

  /*
   * Concedii. Un an credibil are și zile luate, și o cerere care așteaptă: fără
   * amândouă, ecranul „Concediu" din teren arată gol și nimeni nu vede ce face.
   * `workingDays` se calculează cu aceeași funcție ca la depunere.
   */
  console.log("→ concedii");

  const leaveValues: (typeof s.leaveRequests.$inferInsert)[] = [];
  const fieldPeople = userRows.filter((u) => u.role === "sef_santier");

  for (const [index, person] of fieldPeople.entries()) {
    const plans: { from: string; to: string; kind: "odihna" | "medical" | "fara_plata"; status: "aprobata" | "ceruta" | "respinsa" }[] = [
      { from: dayIn(YEAR, 7, 6 + index), to: dayIn(YEAR, 7, 10 + index), kind: "odihna", status: "aprobata" },
      { from: dayIn(YEAR, 4, 13 + index), to: dayIn(YEAR, 4, 15 + index), kind: "odihna", status: "aprobata" },
      { from: dayIn(YEAR, MONTH + 1 > 12 ? 12 : MONTH + 1, 3), to: dayIn(YEAR, MONTH + 1 > 12 ? 12 : MONTH + 1, 7), kind: "odihna", status: "ceruta" },
    ];
    if (index === 0) {
      plans.push({ from: dayIn(YEAR, 3, 2), to: dayIn(YEAR, 3, 4), kind: "medical", status: "aprobata" });
    }

    for (const plan of plans) {
      leaveValues.push({
        userId: person.id,
        kind: plan.kind,
        fromDate: plan.from,
        toDate: plan.to,
        returnDate: nextWorkingDay(plan.to),
        workingDays: workingDaysBetween(plan.from, plan.to),
        replacementId: fieldPeople[(index + 1) % fieldPeople.length]?.id ?? null,
        status: plan.status,
        decidedBy: plan.status === "ceruta" ? null : pm.id,
        decidedAt: plan.status === "ceruta" ? null : new Date(),
      });
    }
  }
  if (leaveValues.length) await db.insert(s.leaveRequests).values(leaveValues);

  console.log("→ gata partea 2");
}
