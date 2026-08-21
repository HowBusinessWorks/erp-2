/**
 * Date de demonstrație.
 *
 * Regula: cifrele trebuie să se adune la ceva credibil. Un gauge la 89% convinge;
 * unul la 3% pentru că baza e goală, nu. De-aia costurile se generează pe 8 luni
 * în urmă, cu ținte per componentă, nu la întâmplare.
 *
 * Rulează: npm run seed
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { inArray, isNull, sql } from "drizzle-orm";

import { db } from "../lib/db";
import * as s from "../lib/db/schema";
import { toDb } from "../lib/money";

/* ───────────────────────── aleator, dar reproductibil ───────────────────────── */

let seedState = 20260820;
function rnd(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const chance = (p: number) => rnd() < p;

const TODAY = new Date();
const YEAR = TODAY.getFullYear();
const MONTH = TODAY.getMonth() + 1;

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function dayIn(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, 28)).padStart(2, "0")}`;
}
/** ultimele n luni, inclusiv cea curentă */
function lastMonths(n: number): { year: number; month: number }[] {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(YEAR, MONTH - 1 - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

/* ───────────────────────── curățenie ───────────────────────── */

async function wipe() {
  const tables = [
    "notifications", "invoice_lines", "invoices", "monthly_reports",
    "pv_documents", "pv_templates", "file_versions", "file_nodes",
    "transports", "tools", "repairs", "fuel_logs", "fuel_prices",
    "handover_protocols", "equipment_plannings", "equipment",
    "goods_receipts", "po_lines", "purchase_orders",
    "consumption_lines", "consumption_notes", "stock_movements", "stock",
    "products", "warehouses",
    "retentions", "supplements", "sl_lines", "situatii_lucrari",
    "package_lines", "packages",
    "deviz_templates", "normed_articles", "deviz_mapping", "deviz_lines", "devize",
    "labor_rates", "timesheets", "intervention_details", "inspection_answers",
    "site_journal_entries", "leave_requests",
    "checklist_items", "checklist_templates",
    "operation_catalog_materials", "operation_catalog", "requests",
    "periods", "cost_entries", "reallocations", "funding_allocations",
    "work_unit_stages", "work_units",
    "contract_objectives", "component_budgets", "contract_components",
    "contract_years", "contracts",
    "objectives", "partners", "users", "firms",
  ];
  for (const t of tables) {
    await db.execute(sql.raw(`truncate table "${t}" cascade`));
  }
}

/* ═══════════════════════════ seed ═══════════════════════════ */

async function main() {
  console.log("→ curăț tabelele…");
  await wipe();

  const password = process.env.SEED_PASSWORD ?? "damina";

  /* ── firme ── */
  console.log("→ firme");
  const firmRows = await db
    .insert(s.firms)
    .values([
      { name: "Damina Construct SRL", cui: "RO14238811", documentPrefix: "DC", address: "București, Sector 4" },
      { name: "Damina Instal SRL", cui: "RO28115402", documentPrefix: "DI", address: "București, Sector 4" },
      { name: "Damina Mentenanță SRL", cui: "RO31904772", documentPrefix: "DM", address: "București, Sector 3" },
      { name: "Damina Utilaje SRL", cui: "RO37220185", documentPrefix: "DU", address: "Popești-Leordeni, Ilfov" },
      { name: "Damina Prod SRL", cui: "RO40118293", documentPrefix: "DP", address: "Jilava, Ilfov" },
    ])
    .returning();
  const mainFirm = firmRows[0];

  /* ── utilizatori ── */
  console.log("→ utilizatori");
  const userRows = await db
    .insert(s.users)
    .values([
      { email: "admin@damina.ro", password, name: "Sergiu Firulescu", role: "admin", firmId: mainFirm.id },
      { email: "pm@damina.ro", password, name: "Andrei Ionescu", role: "pm", firmId: mainFirm.id },
      { email: "pm2@damina.ro", password, name: "Cristina Marin", role: "pm", firmId: firmRows[1].id },
      { email: "santier@damina.ro", password, name: "Marius Dobre", role: "sef_santier", firmId: mainFirm.id, qualification: "sef_santier" },
      { email: "santier2@damina.ro", password, name: "Ionuț State", role: "sef_santier", firmId: mainFirm.id, qualification: "sef_santier" },
      { email: "devize@damina.ro", password, name: "Elena Pavel", role: "devizist", firmId: mainFirm.id },
      { email: "achizitii@damina.ro", password, name: "Radu Neagu", role: "achizitii", firmId: mainFirm.id },
      { email: "magazie@damina.ro", password, name: "Vasile Oprea", role: "magazie", firmId: mainFirm.id },
      { email: "flota@damina.ro", password, name: "Gabriel Tudor", role: "flota", firmId: firmRows[3].id },
      { email: "electrician@damina.ro", password, name: "Petre Lungu", role: "sef_santier", firmId: mainFirm.id, qualification: "electrician" },
    ])
    .returning();

  const admin = userRows[0];
  const pm = userRows[1];
  const pm2 = userRows[2];
  const sefSantier = userRows[3];
  const fleetManager = userRows[8];

  /* ── parteneri ── */
  console.log("→ parteneri");
  const partnerRows = await db
    .insert(s.partners)
    .values([
      // clienți
      { name: "Apa Nova București", types: ["client"], cui: "RO12345678", contactName: "Dan Petrescu", contactEmail: "tehnic@apanova.ro" },
      { name: "Primăria Sectorului 4", types: ["client"], cui: "RO4316422", contactName: "Ioana Radu" },
      { name: "Administrația Lacuri și Parcuri", types: ["client"], cui: "RO14008314" },
      { name: "Termoenergetica SA", types: ["client"], cui: "RO37752029" },
      { name: "Compania Municipală Imobiliara", types: ["client"], cui: "RO37764749" },
      { name: "Asociația Proprietarilor Tineretului 42", types: ["client"] },
      { name: "SC Vertical Office SRL", types: ["client"], cui: "RO22119483" },
      // furnizori
      { name: "Kerakoll România", types: ["furnizor"], cui: "RO17284410", contactName: "Bogdan Ilie" },
      { name: "Dedeman", types: ["furnizor"], cui: "RO2317142" },
      { name: "Saint-Gobain Construction", types: ["furnizor"], cui: "RO7566258" },
      { name: "Electroalfa Distribuție", types: ["furnizor"], cui: "RO9004112" },
      { name: "Romstal Imex", types: ["furnizor"], cui: "RO6787148" },
      { name: "Arabesque", types: ["furnizor"], cui: "RO2988189" },
      { name: "Leroy Merlin", types: ["furnizor"], cui: "RO25243130" },
      // subcontractanți
      { name: "ElectroX Instal SRL", types: ["subcontractant"], cui: "RO28841200", specialty: "electric", retentionPercent: "5" },
      { name: "HidroY Sanitare SRL", types: ["subcontractant"], cui: "RO31228475", specialty: "sanitar", retentionPercent: "5" },
      { name: "ConstruTop SRL", types: ["subcontractant"], cui: "RO19002348", specialty: "constructii", retentionPercent: "10" },
      { name: "Izolații Prime SRL", types: ["subcontractant"], cui: "RO35112904", specialty: "hidroizolatii", retentionPercent: "10" },
      { name: "Termo Vent SRL", types: ["subcontractant"], cui: "RO29113847", specialty: "hvac", retentionPercent: "5" },
      { name: "Alpin Acces SRL", types: ["subcontractant"], cui: "RO33912840", specialty: "alpinism", retentionPercent: "5" },
    ])
    .returning();

  const clients = partnerRows.filter((p) => p.types.includes("client"));
  const suppliers = partnerRows.filter((p) => p.types.includes("furnizor"));
  const subcontractors = partnerRows.filter((p) => p.types.includes("subcontractant"));

  /* ── obiective ── */
  console.log("→ obiective");
  const OBJECTIVE_KINDS = [
    ["statie", "Stație pompare"],
    ["rezervor", "Rezervor"],
    ["gura_canal", "Gură de canal"],
    ["cladire_administrativa", "Clădire administrativă"],
    ["camin", "Cămin vizitare"],
    ["bazin", "Bazin retenție"],
    ["filtru", "Stație filtrare"],
  ] as const;
  const ZONES = [
    "Berceni", "Militari", "Pantelimon", "Colentina", "Drumul Taberei", "Titan",
    "Rahova", "Giulești", "Crângași", "Băneasa", "Tei", "Vitan", "Ferentari",
    "Jilava", "Popești", "Bragadiru", "Chiajna", "Otopeni",
  ];

  const objectiveValues = [];
  for (let i = 1; i <= 124; i++) {
    const [kind, label] = pick(OBJECTIVE_KINDS);
    objectiveValues.push({
      code: `OB-${String(i).padStart(4, "0")}`,
      name: `${label} ${pick(ZONES)}${chance(0.35) ? ` ${int(1, 9)}` : ""}`,
      kind,
      address: `Str. ${pick(ZONES)} nr. ${int(1, 220)}, București`,
      lat: String((44.35 + rnd() * 0.24).toFixed(6)),
      lng: String((25.98 + rnd() * 0.28).toFixed(6)),
      surface: String(int(20, 4200)),
    });
  }
  const objectiveRows = await db.insert(s.objectives).values(objectiveValues).returning();

  /* ── rate card istoricizat ── */
  console.log("→ rate card");
  await db.insert(s.laborRates).values([
    { qualification: "muncitor", hourlyCost: toDb(3200), validFrom: `${YEAR - 2}-01-01`, validTo: `${YEAR - 1}-12-31` },
    { qualification: "muncitor", hourlyCost: toDb(3800), validFrom: `${YEAR}-01-01` },
    { qualification: "electrician", hourlyCost: toDb(4500), validFrom: `${YEAR - 2}-01-01`, validTo: `${YEAR - 1}-12-31` },
    { qualification: "electrician", hourlyCost: toDb(5200), validFrom: `${YEAR}-01-01` },
    { qualification: "instalator", hourlyCost: toDb(4300), validFrom: `${YEAR}-01-01` },
    { qualification: "sudor", hourlyCost: toDb(5500), validFrom: `${YEAR}-01-01` },
    { qualification: "sef_santier", hourlyCost: toDb(7000), validFrom: `${YEAR}-01-01` },
  ]);

  /* ── contracte ── */
  console.log("→ contracte, componente, plafoane");

  type ContractSpec = {
    code: string;
    name: string;
    client: (typeof clients)[number];
    firmIdx: number;
    kind: "mentenanta" | "individual_deviz" | "individual_inversa";
    monthly: number;
    total: number;
    startYear: number;
    indexation: string;
    owner: string;
    deltaCap?: number;
    /** ținta de umplere a gauge-urilor, ca demo-ul să arate cifre vii */
    targets?: { mentenanta: number; lucrari: number; delta: number };
  };

  const contractSpecs: ContractSpec[] = [
    {
      // Contractul din §4.3 al documentului — cifrele sunt exact cele din exemplu.
      code: "4700", name: "Mentenanță rețea Apa Nova", client: clients[0], firmIdx: 0,
      kind: "mentenanta", monthly: 8333300, total: 400000000, startYear: YEAR - 1,
      indexation: "5", owner: pm.id, deltaCap: 1250000,
      targets: { mentenanta: 0.89, lucrari: 0.85, delta: 0.67 },
    },
    {
      code: "4712", name: "Mentenanță clădiri Sector 4", client: clients[1], firmIdx: 0,
      kind: "mentenanta", monthly: 4150000, total: 199200000, startYear: YEAR - 2,
      indexation: "5", owner: pm.id, deltaCap: 620000,
      targets: { mentenanta: 0.72, lucrari: 0.64, delta: 0.41 },
    },
    {
      code: "4718", name: "Mentenanță lacuri și parcuri", client: clients[2], firmIdx: 2,
      kind: "mentenanta", monthly: 2780000, total: 133440000, startYear: YEAR - 1,
      indexation: "0", owner: pm2.id, deltaCap: 410000,
      targets: { mentenanta: 0.94, lucrari: 0.78, delta: 0.23 },
    },
    {
      code: "4725", name: "Mentenanță puncte termice", client: clients[3], firmIdx: 1,
      kind: "mentenanta", monthly: 5610000, total: 269280000, startYear: YEAR - 3,
      indexation: "5", owner: pm2.id, deltaCap: 840000,
      targets: { mentenanta: 0.81, lucrari: 1.06, delta: 0.88 },
    },
    {
      code: "4731", name: "Mentenanță imobile CMI", client: clients[4], firmIdx: 2,
      kind: "mentenanta", monthly: 3240000, total: 155520000, startYear: YEAR,
      indexation: "5", owner: pm.id, deltaCap: 480000,
      targets: { mentenanta: 0.58, lucrari: 0.44, delta: 0.35 },
    },
    {
      code: "4740", name: "Mentenanță stații pompare zona sud", client: clients[0], firmIdx: 1,
      kind: "mentenanta", monthly: 6120000, total: 293760000, startYear: YEAR - 2,
      indexation: "0", owner: pm.id, deltaCap: 910000,
      targets: { mentenanta: 0.97, lucrari: 0.91, delta: 0.52 },
    },
    {
      code: "L-233", name: "Reabilitare hidroizolație bazin Berceni", client: clients[0], firmIdx: 0,
      kind: "individual_deviz", monthly: 0, total: 41800000, startYear: YEAR,
      indexation: "0", owner: pm.id,
    },
    {
      code: "L-241", name: "Reabilitare fațadă sediu administrativ", client: clients[6], firmIdx: 0,
      kind: "individual_deviz", monthly: 0, total: 68500000, startYear: YEAR,
      indexation: "0", owner: pm2.id,
    },
    {
      code: "AP-118", name: "Amenajare apartament Tineretului 42", client: clients[5], firmIdx: 4,
      kind: "individual_inversa", monthly: 0, total: 9400000, startYear: YEAR,
      indexation: "0", owner: pm.id,
    },
  ];

  const contractRows = [];
  const componentsByContract = new Map<string, typeof s.contractComponents.$inferSelect[]>();

  for (const spec of contractSpecs) {
    const years = spec.kind === "mentenanta" ? 4 : 1;
    const [contract] = await db
      .insert(s.contracts)
      .values({
        firmId: firmRows[spec.firmIdx].id,
        clientId: spec.client.id,
        code: spec.code,
        name: spec.name,
        kind: spec.kind,
        startDate: `${spec.startYear}-01-15`,
        endDate: `${spec.startYear + years}-01-14`,
        totalValue: toDb(spec.total),
        monthlyValue: toDb(spec.monthly),
        paymentDays: 70,
        indexationPercent: spec.indexation,
        maintenanceThreshold: toDb(200000),
        ownerId: spec.owner,
      })
      .returning();
    contractRows.push(contract);

    // anii de contract, cu indexarea aplicată la aniversare
    if (spec.kind === "mentenanta") {
      const yearValues = [];
      let monthly = spec.monthly;
      for (let y = 1; y <= years; y++) {
        if (y > 1) monthly = Math.round(monthly * (1 + Number(spec.indexation) / 100));
        yearValues.push({
          contractId: contract.id,
          yearNo: y,
          startDate: `${spec.startYear + y - 1}-01-15`,
          endDate: `${spec.startYear + y}-01-14`,
          monthlyValue: toDb(monthly),
        });
      }
      await db.insert(s.contractYears).values(yearValues);
    }

    // componentele
    const componentSpecs =
      spec.kind === "mentenanta"
        ? [
            { kind: "mentenanta" as const, name: "Mentenanță", revenuePercent: "40", targetMarginPercent: "25" },
            { kind: "lucrari" as const, name: "Lucrări", revenuePercent: "60", targetMarginPercent: "25" },
            { kind: "delta" as const, name: "Delta", revenuePercent: "15", targetMarginPercent: "30" },
          ]
        : [{ kind: "individual" as const, name: "Valoare contract", revenuePercent: "100", targetMarginPercent: "18" }];

    const comps = await db
      .insert(s.contractComponents)
      .values(componentSpecs.map((c) => ({ ...c, contractId: contract.id })))
      .returning();
    componentsByContract.set(contract.id, comps);

    // bugete pe ultimele 12 luni
    const budgetValues = [];
    for (const { year, month } of lastMonths(12)) {
      for (const comp of comps) {
        const revenue = Math.round(spec.monthly * (Number(comp.revenuePercent) / 100));
        if (comp.kind === "delta") {
          budgetValues.push({
            componentId: comp.id, year, month,
            plan: toDb(spec.deltaCap ?? revenue),
            manualCap: toDb(spec.deltaCap ?? revenue),
          });
        } else {
          const cap = Math.round(revenue * (1 - Number(comp.targetMarginPercent) / 100));
          budgetValues.push({
            componentId: comp.id, year, month,
            plan: toDb(spec.kind === "mentenanta" ? cap : Math.round(spec.total * 0.82 / 12)),
          });
        }
      }
    }
    if (budgetValues.length) await db.insert(s.componentBudgets).values(budgetValues);
  }

  /* ── legături contract ↔ obiectiv ── */
  console.log("→ obiective pe contracte");
  const maintenanceContracts = contractRows.filter((c) => c.kind === "mentenanta");
  const contractObjectiveValues = [];
  const objectivesByContract = new Map<string, typeof objectiveRows>();

  let cursor = 0;
  for (const contract of maintenanceContracts) {
    const count = int(12, 26);
    const slice = objectiveRows.slice(cursor, cursor + count);
    cursor = (cursor + count) % (objectiveRows.length - 30);
    objectivesByContract.set(contract.id, slice);
    for (const objective of slice) {
      contractObjectiveValues.push({
        contractId: contract.id,
        objectiveId: objective.id,
        fromDate: contract.startDate,
        inspectionFrequencyMonths: pick([1, 1, 1, 3, 6]),
      });
    }
  }
  await db.insert(s.contractObjectives).values(contractObjectiveValues);

  /* ── checklist-uri ── */
  console.log("→ checklist-uri de inspecție");
  const checklistSpecs = [
    { name: "Inspecție vizuală stație pompare", objectiveKind: "statie", discipline: "vizuala",
      items: ["Stare generală construcție", "Etanșeitate conducte", "Funcționare pompe", "Nivel zgomot și vibrații", "Curățenie incintă", "Iluminat de siguranță", "Semnalizare de avertizare"] },
    { name: "Inspecție electrică", objectiveKind: null, discipline: "electrica",
      items: ["Tablou electric — stare", "Verificare împământare", "Siguranțe și protecții", "Cabluri — izolație", "Corpuri de iluminat", "Prize și întrerupătoare", "Măsurători PRAM"] },
    { name: "Inspecție sanitară", objectiveKind: null, discipline: "sanitara",
      items: ["Robineți și vane", "Scurgeri vizibile", "Presiune în rețea", "Sifoane și sifonări", "Izolație termică conducte"] },
    { name: "Inspecție gură de canal", objectiveKind: "gura_canal", discipline: "vizuala",
      items: ["Stare capac și ramă", "Grad de colmatare", "Stare pereți cămin", "Trepte de acces", "Miros / degajări gaze"] },
    { name: "Inspecție clădire administrativă", objectiveKind: "cladire_administrativa", discipline: "vizuala",
      items: ["Fațadă — fisuri", "Acoperiș și jgheaburi", "Tâmplărie exterioară", "Instalație stingere incendiu", "Căi de evacuare", "Grup sanitar", "Centrală termică"] },
  ];

  const checklistTemplates = [];
  for (const spec of checklistSpecs) {
    const [tpl] = await db
      .insert(s.checklistTemplates)
      .values({ name: spec.name, objectiveKind: spec.objectiveKind, discipline: spec.discipline })
      .returning();
    await db.insert(s.checklistItems).values(
      spec.items.map((text, i) => ({ templateId: tpl.id, position: i + 1, text })),
    );
    checklistTemplates.push({ tpl, items: spec.items });
  }

  /**
   * Profilul de inspecție stă pe LEGĂTURA contract–obiectiv (§5), nu pe obiectiv.
   * Se atașează după ce există șabloanele: cel potrivit tipului de obiectiv, altfel
   * cel electric, care se aplică peste tot.
   */
  const genericTemplate = checklistTemplates.find((t) => t.tpl.objectiveKind === null)!.tpl;
  for (const { tpl } of checklistTemplates) {
    const ids = objectiveRows
      .filter((o) => o.kind === tpl.objectiveKind)
      .map((o) => o.id);
    if (!ids.length) continue;
    await db
      .update(s.contractObjectives)
      .set({ checklistTemplateId: tpl.id })
      .where(inArray(s.contractObjectives.objectiveId, ids));
  }
  await db
    .update(s.contractObjectives)
    .set({ checklistTemplateId: genericTemplate.id })
    .where(isNull(s.contractObjectives.checklistTemplateId));

  /* ── produse ── */
  console.log("→ produse");
  const PRODUCT_SPECS = [
    ["Adeziv flexibil Kerakoll H40", "adezivi", "sac", 8900, true, 14],
    ["Mortar de reparație R4", "mortare", "sac", 11200, true, 14],
    ["Hidroizolație bicomponentă", "hidroizolatii", "kg", 4350, true, 10],
    ["Membrană bituminoasă 4mm", "hidroizolatii", "mp", 2680, false, 7],
    ["Cablu CYYF 3x2.5", "electrice", "ml", 780, false, 3],
    ["Cablu CYYF 5x6", "electrice", "ml", 2140, false, 5],
    ["Siguranță automată 16A", "electrice", "buc", 2350, false, 2],
    ["Contactor 25A", "electrice", "buc", 8900, false, 5],
    ["Corp iluminat LED 36W", "electrice", "buc", 11500, false, 4],
    ["Țeavă PPR 32mm", "sanitare", "ml", 1420, false, 3],
    ["Cot PPR 32mm", "sanitare", "buc", 340, false, 3],
    ["Vană sferică 1\"", "sanitare", "buc", 4200, false, 4],
    ["Robinet trecere 1/2\"", "sanitare", "buc", 2600, false, 3],
    ["Pompă submersibilă 1.5kW", "utilaje", "buc", 189000, false, 21],
    ["Ciment Portland 42.5", "constructii", "sac", 3450, false, 5],
    ["Nisip spălat 0-4", "constructii", "to", 12000, false, 3],
    ["Fier beton Ø12", "constructii", "kg", 620, false, 7],
    ["Cărămidă Porotherm 25", "constructii", "buc", 890, false, 5],
    ["Vopsea lavabilă interior 15L", "finisaje", "gal", 21500, false, 4],
    ["Gresie porțelanată 60x60", "finisaje", "mp", 9800, false, 10],
    ["Plasă fibră sticlă 160g", "finisaje", "mp", 780, false, 6],
    ["Polistiren EPS 80 - 10cm", "termoizolatii", "mp", 3200, false, 8],
    ["Vată minerală bazaltică", "termoizolatii", "mp", 4100, false, 9],
    ["Mănuși protecție", "consumabile", "per", 850, false, 1],
    ["Disc debitat metal 125", "consumabile", "buc", 620, false, 1],
    ["Spumă poliuretanică", "consumabile", "buc", 2150, false, 2],
    ["Silicon sanitar", "consumabile", "buc", 1680, false, 2],
    ["Șurub autofiletant 4.5x50", "consumabile", "cut", 3400, false, 2],
    ["Diblu nylon 8mm", "consumabile", "cut", 1900, false, 2],
    ["Bandă izolatoare", "consumabile", "buc", 480, false, 1],
  ] as const;

  const productValues = PRODUCT_SPECS.map(([name, category, unit, price, lots, lead], i) => ({
    code: `P-${String(i + 1).padStart(4, "0")}`,
    name, category, unit,
    lastPrice: toDb(price),
    tracksLots: lots,
    leadTimeDays: lead,
    minStock: String(int(5, 40)),
    maxStock: String(int(80, 400)),
    defaultSupplierId: pick(suppliers).id,
  }));
  const productRows = await db.insert(s.products).values(productValues).returning();

  /* ── gestiuni + stoc ── */
  console.log("→ gestiuni și stoc");
  const warehouseValues: (typeof s.warehouses.$inferInsert)[] = [
    { firmId: mainFirm.id, code: "MG-01", name: "Magazie centrală Glina", kind: "centrala", keeperId: userRows[7].id },
    { firmId: mainFirm.id, code: "EQ-01", name: "Echipa Berceni", kind: "echipa", keeperId: sefSantier.id },
    { firmId: mainFirm.id, code: "EQ-02", name: "Echipa Militari", kind: "echipa", keeperId: userRows[4].id },
    { firmId: mainFirm.id, code: "EQ-03", name: "Echipa electric", kind: "echipa", keeperId: userRows[9].id },
    { firmId: mainFirm.id, code: "UN-01", name: "Depozit unelte", kind: "unelte", keeperId: userRows[7].id },
    { firmId: firmRows[1].id, code: "MG-02", name: "Magazie Instal", kind: "centrala" },
  ];
  for (const sub of subcontractors.slice(0, 3)) {
    warehouseValues.push({
      firmId: mainFirm.id, code: `SC-${sub.name.slice(0, 3).toUpperCase()}`,
      name: `Custodie ${sub.name}`, kind: "subcontractant", partnerId: sub.id,
    });
  }
  warehouseValues.push({
    firmId: mainFirm.id, code: "CG-KER", name: "Consignație Kerakoll",
    kind: "consignatie", partnerId: suppliers[0].id, isCustody: true,
  });
  const warehouseRows = await db.insert(s.warehouses).values(warehouseValues).returning();
  const centralWarehouse = warehouseRows[0];

  const stockValues = [];
  for (const wh of warehouseRows.filter((w) => w.kind !== "subcontractant")) {
    const count = wh.kind === "centrala" ? productRows.length : int(6, 14);
    for (const product of productRows.slice(0, count)) {
      stockValues.push({
        warehouseId: wh.id,
        productId: product.id,
        quantity: String(int(0, wh.kind === "centrala" ? 320 : 40)),
        reserved: chance(0.2) ? String(int(1, 12)) : "0",
        avgCost: product.lastPrice,
      });
    }
  }
  await db.insert(s.stock).values(stockValues);

  /* ── catalog de operațiuni ── */
  console.log("→ catalog de operațiuni");
  const OPERATIONS = [
    ["Înlocuire corp iluminat", "electric", 1.5, 15000],
    ["Reparație tablou electric", "electric", 4, 62000],
    ["Verificare PRAM", "electric", 3, 48000],
    ["Înlocuire siguranță automată", "electric", 0.5, 5200],
    ["Refacere circuit priză", "electric", 3, 41000],
    ["Înlocuire vană", "sanitar", 2, 24000],
    ["Desfundare coloană", "sanitar", 3, 33000],
    ["Reparație scurgere conductă", "sanitar", 2.5, 28000],
    ["Înlocuire robinet", "sanitar", 1, 12000],
    ["Curățare gură de canal", "canalizare", 2, 21000],
    ["Înlocuire capac cămin", "canalizare", 1.5, 38000],
    ["Reparație trepte cămin", "canalizare", 4, 56000],
    ["Reparație tencuială", "constructii", 6, 72000],
    ["Zugrăvit încăpere", "finisaje", 8, 89000],
    ["Reparație hidroizolație punctuală", "hidroizolatii", 5, 118000],
    ["Înlocuire gresie deteriorată", "finisaje", 4, 54000],
    ["Reparație tâmplărie", "constructii", 3, 44000],
    ["Curățare jgheaburi", "constructii", 3, 26000],
    ["Revizie pompă", "mecanic", 4, 78000],
    ["Înlocuire garnituri pompă", "mecanic", 2.5, 42000],
    ["Verificare instalație stingere", "psi", 3, 51000],
    ["Reîncărcare stingător", "psi", 0.5, 9500],
    ["Montaj schelă", "constructii", 10, 164000],
    ["Demontaj schelă", "constructii", 6, 92000],
    ["Evacuare moloz", "logistic", 4, 68000],
  ] as const;

  const operationRows = await db
    .insert(s.operationCatalog)
    .values(
      OPERATIONS.map(([name, category, hours, cost], i) => ({
        code: `OP-${String(i + 1).padStart(3, "0")}`,
        name, category,
        standardHours: String(hours),
        estimatedCost: toDb(cost),
        qualification: category === "electric" ? "electrician" : category === "sanitar" ? "instalator" : "muncitor",
      })),
    )
    .returning();

  /* ── articole normate ── */
  console.log("→ articole normate");
  await db.insert(s.normedArticles).values([
    { code: "AN-001", name: "Montaj gresie porțelanată", category: "finisaje", unit: "mp", materialCost: toDb(9800), laborHours: "0.8", qualification: "muncitor", usageCount: 34 },
    { code: "AN-002", name: "Montaj schelă fațadă", category: "constructii", unit: "mp", materialCost: toDb(1200), laborHours: "0.35", qualification: "muncitor", usageCount: 21 },
    { code: "AN-003", name: "Hidroizolație bicomponentă 2 straturi", category: "hidroizolatii", unit: "mp", materialCost: toDb(8700), laborHours: "0.5", qualification: "muncitor", usageCount: 18 },
    { code: "AN-004", name: "Termoizolație EPS 10cm cu plasă", category: "termoizolatii", unit: "mp", materialCost: toDb(7400), laborHours: "0.65", qualification: "muncitor", usageCount: 27 },
    { code: "AN-005", name: "Circuit electric priză, aparent", category: "electrice", unit: "ml", materialCost: toDb(1450), laborHours: "0.25", qualification: "electrician", usageCount: 42 },
    { code: "AN-006", name: "Montaj corp iluminat LED", category: "electrice", unit: "buc", materialCost: toDb(11500), laborHours: "0.6", qualification: "electrician", usageCount: 56 },
    { code: "AN-007", name: "Țeavă PPR 32 cu fitinguri", category: "sanitare", unit: "ml", materialCost: toDb(2100), laborHours: "0.4", qualification: "instalator", usageCount: 31 },
    { code: "AN-008", name: "Zugrăveli lavabile 2 straturi", category: "finisaje", unit: "mp", materialCost: toDb(1350), laborHours: "0.18", qualification: "muncitor", usageCount: 63 },
  ]);

  console.log("→ gata partea 1 (organizare, contracte, nomenclatoare)");
  return {
    firmRows, userRows, admin, pm, pm2, sefSantier, fleetManager,
    partnerRows, clients, suppliers, subcontractors,
    objectiveRows, contractRows, componentsByContract, objectivesByContract,
    checklistTemplates, productRows, warehouseRows, centralWarehouse,
    operationRows, mainFirm,
  };
}

export type SeedContext = Awaited<ReturnType<typeof main>>;
export { main as seedCore, rnd, int, pick, chance, lastMonths, dayIn, ymd, YEAR, MONTH };
