/**
 * Schema completă — Damina ERP (prototip).
 *
 * Toate tabelele într-un fișier, deliberat: e ce permite mai multor sesiuni să lucreze
 * în paralel fără să se calce. Vezi PLAN.md §2.
 *
 * Convenții:
 *  - bani: numeric(14,2) în Postgres, întreg (bani) în TypeScript prin lib/money.ts
 *  - cantități: numeric(14,3) — pot fi fracționare (ore, mp, tone)
 *  - id: uuid, generat de Postgres
 */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ────────────────────────────── helpers ────────────────────────────── */

const id = () => uuid("id").primaryKey().defaultRandom();
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
const qty = (name: string) => numeric(name, { precision: 14, scale: 3 });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ────────────────────────────── enums ────────────────────────────── */

export const userRole = pgEnum("user_role", [
  "admin",
  "pm",
  "sef_santier",
  "devizist",
  "achizitii",
  "magazie",
  "flota",
  "client",
]);

export const partnerType = pgEnum("partner_type", ["client", "furnizor", "subcontractant", "angajat"]);

export const contractType = pgEnum("contract_type", [
  "mentenanta",
  "individual_deviz",
  "individual_inversa",
]);

export const componentType = pgEnum("component_type", ["mentenanta", "lucrari", "delta", "individual"]);

export const workUnitType = pgEnum("work_unit_type", ["inspectie", "interventie", "lucrare"]);

export const workUnitStatus = pgEnum("work_unit_status", [
  "propusa",
  "planificata",
  "in_lucru",
  "finalizata",
  "anulata",
]);

export const executantType = pgEnum("executant_type", ["propriu", "subcontractant"]);

export const requestType = pgEnum("request_type", [
  "tichet",
  "solicitare",
  "constatare",
  "propunere",
  "solicitare_utilaj",
  "observatie_utilaj",
]);

export const requestSource = pgEnum("request_source", [
  "email",
  "manual",
  "telefon",
  "fisa_inspectie",
  "utilaj",
]);

export const requestStatus = pgEnum("request_status", [
  "neprocesata",
  "evaluata",
  "aprobata",
  "respinsa",
  "amanata",
]);

/** cele 3 ramuri din §7 al documentului de business, plus contractul nou */
export const routingDecision = pgEnum("routing_decision", [
  "interventie_mentenanta",
  "lucrare_delta",
  "lucrare_componenta",
  "contract_nou",
]);

export const costType = pgEnum("cost_type", [
  "material",
  "manopera",
  "servicii_subc",
  "utilaj",
  "motorina",
  "transport",
  "reparatii",
  "alte",
]);

/** P6: angajamentul se urmărește înaintea cheltuielii */
export const costStage = pgEnum("cost_stage", ["angajat", "receptionat", "consumat", "facturat"]);

export const allocationStatus = pgEnum("allocation_status", ["activ", "inlocuit"]);

export const devizKind = pgEnum("deviz_kind", ["client", "intern"]);
export const devizStatus = pgEnum("deviz_status", ["draft", "trimis", "acceptat", "respins"]);

export const slStatus = pgEnum("sl_status", [
  "draft",
  "declarata",
  "verificata",
  "aprobata",
  "facturata",
]);

export const lineVerdict = pgEnum("line_verdict", ["neverificat", "ok", "suspect"]);

export const warehouseType = pgEnum("warehouse_type", [
  "centrala",
  "santier",
  "echipa",
  "subcontractant",
  "consignatie",
  "unelte",
]);

export const movementType = pgEnum("movement_type", ["nir", "consum", "transfer", "retur", "inventar"]);

export const poStatus = pgEnum("po_status", [
  "draft",
  "lansata",
  "confirmata",
  "receptionata_partial",
  "receptionata",
  "anulata",
]);

/** cele 3 canale din §16 */
export const purchaseChannel = pgEnum("purchase_channel", ["replenishment", "urgenta", "lucrare"]);

export const equipmentStatus = pgEnum("equipment_status", [
  "disponibil",
  "service",
  "indisponibil",
  "casat",
]);

export const planningStatus = pgEnum("planning_status", [
  "planificata",
  "in_derulare",
  "incheiata",
  "anulata",
]);

export const protocolStatus = pgEnum("protocol_status", ["deschis", "inchis"]);

export const repairType = pgEnum("repair_type", ["interventie", "revizie", "gresare", "capitala"]);

export const transportType = pgEnum("transport_type", [
  "livrare_material",
  "transfer_santiere",
  "retur_magazie",
  "evacuare_moloz",
  "transport_utilaj",
]);

export const transportStatus = pgEnum("transport_status", [
  "ceruta",
  "planificata",
  "efectuata",
  "anulata",
]);

export const nodeType = pgEnum("node_type", ["folder", "file"]);
export const pvStatus = pgEnum("pv_status", ["draft", "trimis", "semnat"]);
export const invoiceStatus = pgEnum("invoice_status", ["draft", "emisa", "trimisa", "incasata"]);
export const toolStatus = pgEnum("tool_status", ["activ", "la_reparatii", "casat", "pierdut"]);

/* ══════════════════════════ 1. ORGANIZARE ══════════════════════════ */

export const firms = pgTable("firms", {
  id: id(),
  name: text("name").notNull(),
  cui: text("cui").notNull(),
  regCom: text("reg_com"),
  address: text("address"),
  /** prefixul seriilor de documente ale firmei */
  documentPrefix: text("document_prefix").notNull(),
  color: text("color"),
  /** nomenclator folosit deja ⇒ dezactivare, nu ștergere (PLAN.md §9.11) */
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  /** prototip: parolă în clar în seed, hash simplu la producție */
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: userRole("role").notNull(),
  firmId: uuid("firm_id").references(() => firms.id),
  qualification: text("qualification"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/** Un singur nomenclator de parteneri; `types` e un array, un partener poate fi și client și furnizor. */
export const partners = pgTable("partners", {
  id: id(),
  name: text("name").notNull(),
  types: partnerType("types").array().notNull(),
  cui: text("cui"),
  address: text("address"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  /** specialitatea subcontractantului: electric, sanitar, constructii… */
  specialty: text("specialty"),
  /** procentul de garanție de bună execuție reținut din fiecare SL */
  retentionPercent: numeric("retention_percent", { precision: 5, scale: 2 }),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const objectives = pgTable("objectives", {
  id: id(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  /** cladire_administrativa | statie | rezervor | gura_canal | … */
  kind: text("kind").notNull(),
  address: text("address"),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  surface: qty("surface"),
  notes: text("notes"),
  createdAt: createdAt(),
});

/* ══════════════════════════ 2. CONTRACTE ȘI BANI ══════════════════════════ */

export const contracts = pgTable("contracts", {
  id: id(),
  firmId: uuid("firm_id")
    .notNull()
    .references(() => firms.id),
  clientId: uuid("client_id")
    .notNull()
    .references(() => partners.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  kind: contractType("kind").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  totalValue: money("total_value").notNull().default("0"),
  /** abonamentul de bază, anul 1. Anii următori sunt în contract_years. */
  monthlyValue: money("monthly_value").notNull().default("0"),
  paymentDays: integer("payment_days").notNull().default(70),
  /** indexare anuală, implicit 5%, poate fi 0 (§4.1) */
  indexationPercent: numeric("indexation_percent", { precision: 5, scale: 2 }).notNull().default("5"),
  /** pragul sub care o cerere merge pe mentenanță; implicit 2.000 lei */
  maintenanceThreshold: money("maintenance_threshold").notNull().default("2000"),
  /** alertă de expirare, în luni */
  expiryAlertMonths: integer("expiry_alert_months").notNull().default(6),
  /** proprietarul de contract — PM-ul, un singur nume responsabil de P&L (§4.1) */
  ownerId: uuid("owner_id").references(() => users.id),
  createdAt: createdAt(),
});

/** Abonamentul istoricizat pe an de contract — indexarea se aplică la aniversare (§4.1, §22.6). */
export const contractYears = pgTable(
  "contract_years",
  {
    id: id(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    yearNo: integer("year_no").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    monthlyValue: money("monthly_value").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("contract_years_unq").on(t.contractId, t.yearNo)],
);

/**
 * Componenta de contract — cheia modelului (§4.2).
 * Trei numere separate: venit alocat · plafon de cost · consum real (calculat din registru).
 */
export const contractComponents = pgTable("contract_components", {
  id: id(),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" }),
  kind: componentType("kind").notNull(),
  name: text("name").notNull(),
  /** ce parte din abonament aparține componentei, în procente */
  revenuePercent: numeric("revenue_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  /** marja țintă — din ea iese plafonul de cost */
  targetMarginPercent: numeric("target_margin_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("25"),
  createdAt: createdAt(),
});

/**
 * Bugetul pe componentă și lună.
 * Mentenanță: plafon de COST lunar (să nu depășești).
 * Lucrări: plafon anual defalcat lunar (să nu depășești).
 * Delta: plafon de VENIT lunar, pus MANUAL, care trebuie UMPLUT. Nu se reportează.
 */
export const componentBudgets = pgTable(
  "component_budgets",
  {
    id: id(),
    componentId: uuid("component_id")
      .notNull()
      .references(() => contractComponents.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    /** plafonul planificat pentru luna asta */
    plan: money("plan").notNull().default("0"),
    /** doar Delta: plafonul de venit pus manual de PM */
    manualCap: money("manual_cap"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("component_budgets_unq").on(t.componentId, t.year, t.month)],
);

/**
 * Legătura obiectiv ↔ contract. Profilul de inspecție stă AICI, nu pe obiectiv și nu pe
 * contract — asta rezolvă cazul „pe același contract, la unele obiective faci alte
 * inspecții decât la altele" (§5).
 */
export const contractObjectives = pgTable("contract_objectives", {
  id: id(),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" }),
  objectiveId: uuid("objective_id")
    .notNull()
    .references(() => objectives.id),
  fromDate: date("from_date").notNull(),
  toDate: date("to_date"),
  checklistTemplateId: uuid("checklist_template_id"),
  /** frecvența contractuală de inspecție, în luni */
  inspectionFrequencyMonths: integer("inspection_frequency_months"),
  createdAt: createdAt(),
});

/* ══════════════════════════ 3. UNITATEA DE LUCRU ══════════════════════════ */

/**
 * Inima modelului (§6). Trei tipuri, identitate comună — de-aia promovarea
 * intervenție → lucrare păstrează id-ul, pozele, orele și consumurile.
 *
 * ATENȚIE: finanțarea NU e aici. E în funding_allocations. (P2)
 */
export const workUnits = pgTable("work_units", {
  id: id(),
  code: text("code").notNull(),
  kind: workUnitType("kind").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  firmId: uuid("firm_id")
    .notNull()
    .references(() => firms.id),
  objectiveId: uuid("objective_id")
    .notNull()
    .references(() => objectives.id),
  status: workUnitStatus("status").notNull().default("propusa"),
  responsibleId: uuid("responsible_id").references(() => users.id),
  executant: executantType("executant").notNull().default("propriu"),
  subcontractorId: uuid("subcontractor_id").references(() => partners.id),
  startDate: date("start_date"),
  endDate: date("end_date"),
  estimatedValue: money("estimated_value").notNull().default("0"),
  budgetCost: money("budget_cost").notNull().default("0"),
  /** dacă a fost promovată dintr-o intervenție, păstrăm urma */
  promotedFrom: workUnitType("promoted_from"),
  promotedAt: timestamp("promoted_at", { withTimezone: true }),
  /** comutatorul din §22.1: auto-consum la recepție, pentru lucrări mici */
  autoConsumeOnReceipt: boolean("auto_consume_on_receipt").notNull().default(false),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/** Etape — doar la lucrări. Graficul Gantt se construiește din ele (§9). */
export const workUnitStages = pgTable("work_unit_stages", {
  id: id(),
  workUnitId: uuid("work_unit_id")
    .notNull()
    .references(() => workUnits.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  materialBudget: money("material_budget").notNull().default("0"),
  laborBudget: money("labor_budget").notNull().default("0"),
  percentOfWork: numeric("percent_of_work", { precision: 5, scale: 2 }).notNull().default("0"),
  createdAt: createdAt(),
});

/**
 * Alocarea de finanțare (§13). Tabela care rezolvă simultan:
 * Delta pe mai multe luni · mutările între contracte · promovările.
 * O lucrare mare poate avea 3 alocări paralele: aug 12.500 · sep 12.500 · oct 9.800.
 */
export const fundingAllocations = pgTable("funding_allocations", {
  id: id(),
  workUnitId: uuid("work_unit_id")
    .notNull()
    .references(() => workUnits.id, { onDelete: "cascade" }),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => contracts.id),
  componentId: uuid("component_id")
    .notNull()
    .references(() => contractComponents.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  allocatedValue: money("allocated_value").notNull().default("0"),
  percent: numeric("percent", { precision: 5, scale: 2 }),
  status: allocationStatus("status").notNull().default("activ"),
  reason: text("reason"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/**
 * Realocare într-o lună ÎNCHISĂ (§13.1).
 * Liniile originale rămân datate în luna lor; se emite un document de re-alocare
 * în luna curentă, care scoate valoarea din componenta veche și o pune pe cea nouă.
 * Ecranul „lista realocărilor lunii" se construiește din tabela asta.
 */
export const reallocations = pgTable("reallocations", {
  id: id(),
  workUnitId: uuid("work_unit_id")
    .notNull()
    .references(() => workUnits.id),
  fromComponentId: uuid("from_component_id")
    .notNull()
    .references(() => contractComponents.id),
  toComponentId: uuid("to_component_id")
    .notNull()
    .references(() => contractComponents.id),
  value: money("value").notNull(),
  /** luna în care se înregistrează mișcarea (luna curentă, deschisă) */
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  reason: text("reason").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/* ══════════════════════════ 4. REGISTRUL DE COST ══════════════════════════ */

/**
 * TABELA CENTRALĂ (§11). Fiecare leu cheltuit produce o linie aici, cu aceleași dimensiuni,
 * indiferent de sursă. Toate rapoartele sunt filtre pe ea. (P3)
 *
 * Se scrie EXCLUSIV prin lib/cost-ledger.ts.
 *
 * Dubla analitică (§12):
 *   „folosit"    = unde s-a întâmplat fizic munca  → istoric obiectiv, raport client
 *   „descărcat"  = pe ce buget se duce banul       → plafoane, marjă, control financiar
 * Implicit sunt egale. Diferă doar când cineva le desparte explicit, cu motiv.
 */
export const costEntries = pgTable("cost_entries", {
  id: id(),

  // CÂND și CINE
  documentDate: date("document_date").notNull(),
  /** luna de raportare — poate diferi de data documentului (fișă din iulie, raportată în august) */
  effectDate: date("effect_date").notNull(),
  firmId: uuid("firm_id")
    .notNull()
    .references(() => firms.id),

  // UNDE S-A ÎNTÂMPLAT — analitica „folosit"
  usedContractId: uuid("used_contract_id").references(() => contracts.id),
  usedComponentId: uuid("used_component_id").references(() => contractComponents.id),
  objectiveId: uuid("objective_id").references(() => objectives.id),
  workUnitId: uuid("work_unit_id").references(() => workUnits.id),
  stageId: uuid("stage_id").references(() => workUnitStages.id),

  // CINE PLĂTEȘTE — analitica „descărcat"
  chargedContractId: uuid("charged_contract_id").references(() => contracts.id),
  chargedComponentId: uuid("charged_component_id").references(() => contractComponents.id),
  /** motivul obligatoriu când „folosit" ≠ „descărcat" */
  splitReason: text("split_reason"),

  // CE FEL DE COST
  costType: costType("cost_type").notNull(),
  productId: uuid("product_id"),
  qualification: text("qualification"),

  // CÂT
  quantity: qty("quantity"),
  unit: text("unit"),
  value: money("value").notNull(),
  stage: costStage("stage").notNull(),

  // DE UNDE VINE
  documentType: text("document_type").notNull(),
  documentId: uuid("document_id"),
  supplierId: uuid("supplier_id").references(() => partners.id),
  note: text("note"),

  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/**
 * Închiderea de perioadă (§21, punctul 1).
 * E precondiția regulii de mutare din §13.1: comportamentul diferă după cum luna e închisă.
 * În prototip: buton + flag, fără triggere de blocare.
 */
export const periods = pgTable(
  "periods",
  {
    id: id(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("periods_unq").on(t.firmId, t.year, t.month)],
);

/* ══════════════════════════ 5. CERERI ȘI RUTARE ══════════════════════════ */

/**
 * O singură entitate, `tip` ca etichetă (§7). Tichet, solicitare, constatare,
 * propunere internă, solicitare de utilaj, observație pe utilaj — aceeași cutie.
 */
export const requests = pgTable("requests", {
  id: id(),
  code: text("code").notNull(),
  kind: requestType("kind").notNull(),
  source: requestSource("source").notNull().default("manual"),
  title: text("title").notNull(),
  description: text("description"),
  firmId: uuid("firm_id").references(() => firms.id),
  objectiveId: uuid("objective_id").references(() => objectives.id),
  contractId: uuid("contract_id").references(() => contracts.id),
  /** dacă vine dintr-o fișă de inspecție, din ce punct NOK */
  sourceInspectionId: uuid("source_inspection_id"),
  /** dacă e observație pe utilaj */
  equipmentId: uuid("equipment_id"),
  /** din catalogul de operațiuni — face pragul de 2.000 lei obiectiv, nu „din ochi" */
  estimatedValue: money("estimated_value").notNull().default("0"),
  operationId: uuid("operation_id"),
  status: requestStatus("status").notNull().default("neprocesata"),
  /** decizia economică cea mai importantă din firmă — cu autor și dată (§7) */
  decision: routingDecision("decision"),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: text("decision_note"),
  /** unitatea de lucru produsă de decizie */
  workUnitId: uuid("work_unit_id").references(() => workUnits.id),
  /** propunerile expiră; altfel backlogul se umple de lucruri moarte */
  expiresAt: date("expires_at"),
  /** emailul original rămâne atașat — e dovada solicitării clientului */
  sourceEmail: jsonb("source_email"),
  requestedBy: uuid("requested_by").references(() => users.id),
  createdAt: createdAt(),
});

/**
 * Catalogul de operațiuni standard (§8.5) — pseudo-devizul mentenanței.
 * Dă decizia mentenanță/Delta/contract în 30 de secunde, pe cifre.
 */
export const operationCatalog = pgTable("operation_catalog", {
  id: id(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  unit: text("unit").notNull().default("buc"),
  /** normă de timp, în ore */
  standardHours: qty("standard_hours").notNull().default("0"),
  qualification: text("qualification"),
  /** cost estimat total = manoperă + materiale tipice */
  estimatedCost: money("estimated_cost").notNull().default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const operationCatalogMaterials = pgTable("operation_catalog_materials", {
  id: id(),
  operationId: uuid("operation_id")
    .notNull()
    .references(() => operationCatalog.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull(),
  quantity: qty("quantity").notNull(),
  createdAt: createdAt(),
});

/* ══════════════════════════ 6. FIȘE DE LUCRU ══════════════════════════ */

export const checklistTemplates = pgTable("checklist_templates", {
  id: id(),
  name: text("name").notNull(),
  /** pe ce tip de obiectiv se aplică */
  objectiveKind: text("objective_kind"),
  /** electrica | sanitara | vizuala | … */
  discipline: text("discipline"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const checklistItems = pgTable("checklist_items", {
  id: id(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => checklistTemplates.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  text: text("text").notNull(),
  /** grupare vizuală în fișă */
  section: text("section"),
  createdAt: createdAt(),
});

/**
 * Răspunsurile la o fișă de inspecție.
 * Regula: fiecare punct NOK trebuie să aibă o IEȘIRE — rezolvat pe loc / intervenție /
 * propunere. Fără asta, constatările se pierd și Delta rămâne neumplută (§7).
 */
export const inspectionAnswers = pgTable("inspection_answers", {
  id: id(),
  workUnitId: uuid("work_unit_id")
    .notNull()
    .references(() => workUnits.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").references(() => checklistItems.id),
  /** text liber pentru punctele adăugate pe teren */
  itemText: text("item_text").notNull(),
  ok: boolean("ok"),
  note: text("note"),
  /** ieșirea impusă la NOK */
  outcome: text("outcome"),
  outcomeRequestId: uuid("outcome_request_id").references(() => requests.id),
  createdAt: createdAt(),
});

export const interventionDetails = pgTable("intervention_details", {
  id: id(),
  workUnitId: uuid("work_unit_id")
    .notNull()
    .references(() => workUnits.id, { onDelete: "cascade" }),
  operationId: uuid("operation_id").references(() => operationCatalog.id),
  description: text("description"),
  hoursDeclared: qty("hours_declared").notNull().default("0"),
  peopleCount: integer("people_count").notNull().default(1),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * Pontaj. Ziua unui om SE POATE împărți pe mai multe unități de lucru —
 * altfel alocarea costului e falsă (§9).
 */
export const timesheets = pgTable("timesheets", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  workUnitId: uuid("work_unit_id")
    .notNull()
    .references(() => workUnits.id),
  day: date("day").notNull(),
  hours: qty("hours").notNull(),
  qualification: text("qualification"),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/** Rate card ISTORICIZAT — salariile cresc în 4 ani (§9). */
export const laborRates = pgTable("labor_rates", {
  id: id(),
  qualification: text("qualification").notNull(),
  /** cost/oră = salariu + taxe + coeficient de neproductivitate */
  hourlyCost: money("hourly_cost").notNull(),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to"),
  /** nomenclator folosit deja ⇒ dezactivare, nu ștergere (PLAN.md §9.11) */
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/**
 * Jurnalul de șantier (T6). O însemnare pe zi și pe unitate de lucru: ce s-a lucrat,
 * cine a fost, ce a blocat. Nu produce bani — de asta nu trece prin registrul de cost.
 *
 * NOTĂ: tabela asta nu era în PLAN.md §2. Ecranul T6 e cerut, iar jurnalul nu încape
 * în nicio tabelă existentă fără să o deformeze. Vezi PROGRESS.md §3.
 */
export const siteJournalEntries = pgTable("site_journal_entries", {
  id: id(),
  workUnitId: uuid("work_unit_id")
    .notNull()
    .references(() => workUnits.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  text: text("text").notNull(),
  /** starea vremii — la lucrări în exterior e motiv real de întârziere */
  weather: text("weather"),
  peopleCount: integer("people_count"),
  /** ce a blocat lucrul azi; gol = nimic */
  blocker: text("blocker"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/* ══════════════════════════ 7. DEVIZ ══════════════════════════ */

/**
 * Două devize, legate (§8.1).
 * Devizul CLIENT se versionează. Devizul INTERN nu ajunge niciodată la client,
 * deci PM-ul îl modifică liber, fără aprobare externă.
 */
export const devize = pgTable("devize", {
  id: id(),
  workUnitId: uuid("work_unit_id")
    .notNull()
    .references(() => workUnits.id, { onDelete: "cascade" }),
  kind: devizKind("kind").notNull(),
  version: integer("version").notNull().default(1),
  status: devizStatus("status").notNull().default("draft"),
  /** doar la devizul client: indirecte + profit, ca pachet */
  overheadPercent: numeric("overhead_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  profitPercent: numeric("profit_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const devizLines = pgTable("deviz_lines", {
  id: id(),
  devizId: uuid("deviz_id")
    .notNull()
    .references(() => devize.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  category: text("category"),
  code: text("code"),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("buc"),
  quantity: qty("quantity").notNull().default("0"),
  /** la devizul intern material și manoperă sunt ÎNTOTDEAUNA separate */
  materialUnitPrice: money("material_unit_price").notNull().default("0"),
  laborUnitPrice: money("labor_unit_price").notNull().default("0"),
  equipmentUnitPrice: money("equipment_unit_price").notNull().default("0"),
  transportUnitPrice: money("transport_unit_price").notNull().default("0"),
  /** la devizul client, de multe ori e un singur preț la comun */
  unitPrice: money("unit_price").notNull().default("0"),
  total: money("total").notNull().default("0"),
  normedArticleId: uuid("normed_article_id"),
  /** marcaj pentru liniile venite din suplimentări (§10.2) */
  isSupplement: boolean("is_supplement").notNull().default(false),
  createdAt: createdAt(),
});

/**
 * Maparea N:M client ↔ intern (§8.1).
 * O poziție client se poate sparge în 5 interne; 3 client pot corespunde uneia interne.
 * Ea permite ca declarația subcontractantului să urce automat în SL-ul către client.
 */
export const devizMapping = pgTable("deviz_mapping", {
  id: id(),
  clientLineId: uuid("client_line_id")
    .notNull()
    .references(() => devizLines.id, { onDelete: "cascade" }),
  internalLineId: uuid("internal_line_id")
    .notNull()
    .references(() => devizLines.id, { onDelete: "cascade" }),
  coefficient: numeric("coefficient", { precision: 10, scale: 4 }).notNull().default("1"),
  createdAt: createdAt(),
});

/**
 * Biblioteca de articole normate (§8.2, modul 3).
 * „Cel mai valoros activ pe termen lung" — crește singură, din propunerile
 * făcute la fiecare deviz construit în modurile 1, 2 sau 4.
 */
export const normedArticles = pgTable("normed_articles", {
  id: id(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  unit: text("unit").notNull().default("buc"),
  materialCost: money("material_cost").notNull().default("0"),
  laborHours: qty("labor_hours").notNull().default("0"),
  qualification: text("qualification"),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: createdAt(),
});

/** Șabloane de deviz pe tip de obiectiv (§8.2, modul 1). */
export const devizTemplates = pgTable("deviz_templates", {
  id: id(),
  name: text("name").notNull(),
  objectiveKind: text("objective_kind"),
  /** liniile șablonului, ca JSON — e un șablon, nu un document */
  lines: jsonb("lines").notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
});

/* ══════════════════════════ 8. PACHETE ȘI SITUAȚII DE LUCRĂRI ══════════════════════════ */

/**
 * Pachet de subcontractant (§8.3). Din devizul intern, PM-ul grupează linii pe specialitate.
 * REGULĂ IMPUSĂ DE SISTEM: materialele nu intră niciodată în pachet.
 * Subcontractanții facturează doar manoperă.
 *
 * NOTĂ: portalul subcontractantului există ca aplicație separată. Aici sunt doar tabelele,
 * ca punct de cusătură. Nu se construiesc ecrane de subcontractant. (PLAN.md §7)
 */
export const packages = pgTable("packages", {
  id: id(),
  workUnitId: uuid("work_unit_id")
    .notNull()
    .references(() => workUnits.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  specialty: text("specialty"),
  subcontractorId: uuid("subcontractor_id").references(() => partners.id),
  status: text("status").notNull().default("draft"),
  retentionPercent: numeric("retention_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const packageLines = pgTable("package_lines", {
  id: id(),
  packageId: uuid("package_id")
    .notNull()
    .references(() => packages.id, { onDelete: "cascade" }),
  internalLineId: uuid("internal_line_id").references(() => devizLines.id),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("buc"),
  contractedQty: qty("contracted_qty").notNull().default("0"),
  /** PREȚ — vizibil PM și subcontractant, ASCUNS șefului de șantier (§10.3) */
  proposedPrice: money("proposed_price").notNull().default("0"),
  agreedPrice: money("agreed_price").notNull().default("0"),
  createdAt: createdAt(),
});

/** Situația de lucrări lunară, per pachet (§10.1). */
export const situatiiLucrari = pgTable("situatii_lucrari", {
  id: id(),
  packageId: uuid("package_id")
    .notNull()
    .references(() => packages.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  /** codul SL generat de sistem — pe el se face matching-ul facturii din SPV */
  code: text("code"),
  status: slStatus("status").notNull().default("draft"),
  declaredAt: timestamp("declared_at", { withTimezone: true }),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  /** garanția reținută din situația asta */
  retentionValue: money("retention_value").notNull().default("0"),
  createdAt: createdAt(),
});

/**
 * Cele CINCI cantități cumulate (§10.2). Fără ele, controlul e iluzoriu.
 * Sistemul blochează declararea peste `contractedQty` fără suplimentare aprobată.
 */
export const slLines = pgTable("sl_lines", {
  id: id(),
  situatieId: uuid("situatie_id")
    .notNull()
    .references(() => situatiiLucrari.id, { onDelete: "cascade" }),
  packageLineId: uuid("package_line_id").references(() => packageLines.id),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("buc"),
  contractedQty: qty("contracted_qty").notNull().default("0"),
  executedCumulative: qty("executed_cumulative").notNull().default("0"),
  approvedCumulative: qty("approved_cumulative").notNull().default("0"),
  invoicedCumulative: qty("invoiced_cumulative").notNull().default("0"),
  /** cantitatea declarată în luna asta */
  declaredQty: qty("declared_qty").notNull().default("0"),
  unitPrice: money("unit_price").notNull().default("0"),
  value: money("value").notNull().default("0"),
  /** verificarea e LINIE CU LINIE, nu aprobare în bloc (§10.3) */
  verdict: lineVerdict("verdict").notNull().default("neverificat"),
  verdictComment: text("verdict_comment"),
  isSupplement: boolean("is_supplement").notNull().default(false),
  createdAt: createdAt(),
});

/**
 * Suplimentări (§10.2, §10.3).
 * Când PM-ul acceptă, linia aterizează ATOMIC și în devizul permanent (categoria
 * „Lucrări suplimentare") și în situația curentă. În doi timpi ai rămâne cu un
 * suplimentar acceptat care nu s-a reflectat nicăieri în bani.
 */
export const supplements = pgTable("supplements", {
  id: id(),
  packageId: uuid("package_id")
    .notNull()
    .references(() => packages.id),
  situatieId: uuid("situatie_id").references(() => situatiiLucrari.id),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("buc"),
  quantity: qty("quantity").notNull(),
  unitPrice: money("unit_price").notNull().default("0"),
  reason: text("reason"),
  /** verificarea de teren: ok / suspect, înainte de decizia PM-ului */
  verdict: lineVerdict("verdict").notNull().default("neverificat"),
  verdictComment: text("verdict_comment"),
  status: text("status").notNull().default("propus"),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * Garanții de bună execuție (§21, punctul 2) — lipsesc din orice soft de pe piață.
 * În AMBELE sensuri: reții de la subcontractant, clientul îți reține ție.
 */
export const retentions = pgTable("retentions", {
  id: id(),
  /** `retinuta` = eu rețin de la subcontractant; `datorata` = clientul îmi reține mie */
  direction: text("direction").notNull(),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => partners.id),
  contractId: uuid("contract_id").references(() => contracts.id),
  workUnitId: uuid("work_unit_id").references(() => workUnits.id),
  situatieId: uuid("situatie_id").references(() => situatiiLucrari.id),
  value: money("value").notNull(),
  percent: numeric("percent", { precision: 5, scale: 2 }),
  /** scadențarul de eliberare */
  dueDate: date("due_date"),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  note: text("note"),
  createdAt: createdAt(),
});

/* ══════════════════════════ 9. STOC ȘI ACHIZIȚII ══════════════════════════ */

/** P5: gestiune = LOC FIZIC unde stă marfa. Niciodată „gestiunea de mentenanță a contractului X". */
export const warehouses = pgTable("warehouses", {
  id: id(),
  firmId: uuid("firm_id")
    .notNull()
    .references(() => firms.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  kind: warehouseType("kind").notNull(),
  /** la gestiunile de șantier: lucrarea; la echipă: echipa; la consignație: furnizorul */
  workUnitId: uuid("work_unit_id").references(() => workUnits.id),
  partnerId: uuid("partner_id").references(() => partners.id),
  keeperId: uuid("keeper_id").references(() => users.id),
  /** consignația: marfa NU e a ta până la consum */
  isCustody: boolean("is_custody").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const products = pgTable("products", {
  id: id(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  unit: text("unit").notNull().default("buc"),
  defaultSupplierId: uuid("default_supplier_id").references(() => partners.id),
  lastPrice: money("last_price").notNull().default("0"),
  /** lead time, în zile — Kerakoll la 2 săptămâni e o problemă de achiziții (§16) */
  leadTimeDays: integer("lead_time_days").notNull().default(0),
  minStock: qty("min_stock").notNull().default("0"),
  maxStock: qty("max_stock").notNull().default("0"),
  /** loturi și expirare: obligatoriu pe adezivi, mortare, chimicale */
  tracksLots: boolean("tracks_lots").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const stock = pgTable(
  "stock",
  {
    id: id(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    quantity: qty("quantity").notNull().default("0"),
    /** rezervat, nu mutat. Disponibil = quantity − reserved (§17) */
    reserved: qty("reserved").notNull().default("0"),
    /** cost mediu ponderat, per gestiune */
    avgCost: money("avg_cost").notNull().default("0"),
    lot: text("lot"),
    expiresAt: date("expires_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stock_unq").on(t.warehouseId, t.productId, t.lot)],
);

export const stockMovements = pgTable("stock_movements", {
  id: id(),
  kind: movementType("kind").notNull(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  fromWarehouseId: uuid("from_warehouse_id").references(() => warehouses.id),
  toWarehouseId: uuid("to_warehouse_id").references(() => warehouses.id),
  quantity: qty("quantity").notNull(),
  unitCost: money("unit_cost").notNull().default("0"),
  lot: text("lot"),
  documentType: text("document_type"),
  documentId: uuid("document_id"),
  day: date("day").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/** Bon de consum — poartă contractul, componenta și obiectivul (P5). */
export const consumptionNotes = pgTable("consumption_notes", {
  id: id(),
  code: text("code").notNull(),
  firmId: uuid("firm_id")
    .notNull()
    .references(() => firms.id),
  warehouseId: uuid("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  workUnitId: uuid("work_unit_id")
    .notNull()
    .references(() => workUnits.id),
  stageId: uuid("stage_id").references(() => workUnitStages.id),
  day: date("day").notNull(),
  effectDate: date("effect_date").notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const consumptionLines = pgTable("consumption_lines", {
  id: id(),
  noteId: uuid("note_id")
    .notNull()
    .references(() => consumptionNotes.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  quantity: qty("quantity").notNull(),
  unitCost: money("unit_cost").notNull().default("0"),
  value: money("value").notNull().default("0"),
  lot: text("lot"),
  createdAt: createdAt(),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: id(),
  code: text("code").notNull(),
  firmId: uuid("firm_id")
    .notNull()
    .references(() => firms.id),
  /**
   * GOL până la alegerea furnizorului. Necesarul de material venit din teren (T4)
   * intră tot aici, ca draft fără furnizor — el e intrarea filtrului de 24h de la
   * magazie (§16). Achizițiile îi pun furnizorul când îl lansează.
   */
  supplierId: uuid("supplier_id").references(() => partners.id),
  channel: purchaseChannel("channel").notNull(),
  status: poStatus("status").notNull().default("draft"),
  orderedAt: date("ordered_at"),
  confirmedDeliveryAt: date("confirmed_delivery_at"),
  deliverToWarehouseId: uuid("deliver_to_warehouse_id").references(() => warehouses.id),
  /** filtrul de 24h la magazie, pe canalul C (§16) */
  warehouseCheckUntil: timestamp("warehouse_check_until", { withTimezone: true }),
  warehouseCoveredFromStock: boolean("warehouse_covered_from_stock").notNull().default(false),
  approvedBy: uuid("approved_by").references(() => users.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/** Analitica stă PE LINIE — altfel raportul pe etapă e gol (§9, §22.4). */
export const poLines = pgTable("po_lines", {
  id: id(),
  poId: uuid("po_id")
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  quantity: qty("quantity").notNull(),
  receivedQty: qty("received_qty").notNull().default("0"),
  unitPrice: money("unit_price").notNull().default("0"),
  value: money("value").notNull().default("0"),
  contractId: uuid("contract_id").references(() => contracts.id),
  componentId: uuid("component_id").references(() => contractComponents.id),
  workUnitId: uuid("work_unit_id").references(() => workUnits.id),
  /** OBLIGATORIU pe necesarul de material, cu default = etapa curentă (§22.4) */
  stageId: uuid("stage_id").references(() => workUnitStages.id),
  createdAt: createdAt(),
});

export const goodsReceipts = pgTable("goods_receipts", {
  id: id(),
  code: text("code").notNull(),
  poId: uuid("po_id").references(() => purchaseOrders.id),
  warehouseId: uuid("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  supplierId: uuid("supplier_id").references(() => partners.id),
  day: date("day").notNull(),
  /** avizul încărcat din teren */
  deliveryNoteRef: text("delivery_note_ref"),
  totalValue: money("total_value").notNull().default("0"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/* ══════════════════════════ 10. UTILAJE, UNELTE, TRANSPORT ══════════════════════════ */

export const equipment = pgTable("equipment", {
  id: id(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  /** activitățile pe care le poate face — pe ele se sprijină filtrul din solicitare (§18.1.2) */
  activities: text("activities").array().notNull().default(sql`'{}'::text[]`),
  firmId: uuid("firm_id").references(() => firms.id),
  status: equipmentStatus("status").notNull().default("disponibil"),
  /** amortizare + reparații + asigurări / ore anuale. Fără el, „costul cu utilajul" e doar motorina. */
  internalHourlyRate: money("internal_hourly_rate").notNull().default("0"),
  isRented: boolean("is_rented").notNull().default(false),
  dailyRentCost: money("daily_rent_cost").notNull().default("0"),
  hourMeter: qty("hour_meter").notNull().default("0"),
  km: qty("km").notNull().default("0"),
  itpExpiry: date("itp_expiry"),
  rcaExpiry: date("rca_expiry"),
  iscirExpiry: date("iscir_expiry"),
  /** revizia se face ȘI după ore, nu doar calendaristic (§18.1.7) */
  nextServiceDate: date("next_service_date"),
  nextServiceHours: qty("next_service_hours"),
  accessories: text("accessories").array().notNull().default(sql`'{}'::text[]`),
  photoUrl: text("photo_url"),
  /** utilaj imobilizat: pe perioada asta NU se calculează costuri de exploatare (§18.1.3) */
  immobilizedFrom: date("immobilized_from"),
  createdAt: createdAt(),
});

/** Calendarul de flotă (§18.1.5). Validarea de suprapunere se face pe server. */
export const equipmentPlannings = pgTable("equipment_plannings", {
  id: id(),
  equipmentId: uuid("equipment_id")
    .notNull()
    .references(() => equipment.id, { onDelete: "cascade" }),
  workUnitId: uuid("work_unit_id").references(() => workUnits.id),
  objectiveId: uuid("objective_id").references(() => objectives.id),
  /** cererea din care a ieșit planificarea; solicitantul devine responsabil (§18.1.2) */
  requestId: uuid("request_id").references(() => requests.id),
  responsibleId: uuid("responsible_id").references(() => users.id),
  subcontractorId: uuid("subcontractor_id").references(() => partners.id),
  fromDate: date("from_date").notNull(),
  toDate: date("to_date").notNull(),
  withOperator: boolean("with_operator").notNull().default(false),
  status: planningStatus("status").notNull().default("planificata"),
  note: text("note"),
  createdAt: createdAt(),
});

/**
 * PV de predare-primire (§18.1.4). UN document, DOUĂ etape.
 * Regulile ieșite din testare reală:
 *  1. datele de predare se blochează după creare (`handoverLocked`)
 *  2. nu poți deschide un PV nou cât timp precedentul e deschis
 *  3. data primirii nu poate fi anterioară datei de predare
 *  4. contorul utilajului se actualizează la ÎNCHIDEREA PV-ului, nu manual
 *  5. PV-urile deschise se evidențiază vizual — sunt utilaje neîntoarse
 */
export const handoverProtocols = pgTable("handover_protocols", {
  id: id(),
  code: text("code").notNull(),
  equipmentId: uuid("equipment_id").references(() => equipment.id),
  toolId: uuid("tool_id"),
  planningId: uuid("planning_id").references(() => equipmentPlannings.id),
  workUnitId: uuid("work_unit_id").references(() => workUnits.id),
  status: protocolStatus("status").notNull().default("deschis"),

  // etapa 1 — predare (se blochează după creare)
  handoverDate: date("handover_date").notNull(),
  handoverByName: text("handover_by_name").notNull(),
  handoverToUserId: uuid("handover_to_user_id").references(() => users.id),
  handoverToPartnerId: uuid("handover_to_partner_id").references(() => partners.id),
  handoverToPersonName: text("handover_to_person_name"),
  handoverHourMeter: qty("handover_hour_meter"),
  handoverFuel: qty("handover_fuel"),
  handoverCondition: text("handover_condition"),
  handoverNotes: text("handover_notes"),
  handoverAccessories: text("handover_accessories").array().notNull().default(sql`'{}'::text[]`),
  handoverSignature: text("handover_signature"),
  handoverLocked: boolean("handover_locked").notNull().default(false),

  // etapa 2 — primire înapoi (poate preda altcineva decât cel care a luat)
  returnDate: date("return_date"),
  returnByName: text("return_by_name"),
  returnHourMeter: qty("return_hour_meter"),
  returnFuel: qty("return_fuel"),
  returnCondition: text("return_condition"),
  returnIssues: text("return_issues"),
  returnAccessories: text("return_accessories").array().notNull().default(sql`'{}'::text[]`),
  returnSignature: text("return_signature"),

  createdAt: createdAt(),
});

/** Prețul motorinei pe zi — altfel „costul cu motorina" e o medie inventată (§18.1.6). */
export const fuelPrices = pgTable(
  "fuel_prices",
  {
    id: id(),
    day: date("day").notNull(),
    pricePerLiter: money("price_per_liter").notNull(),
    manualOverride: boolean("manual_override").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("fuel_prices_unq").on(t.day)],
);

export const fuelLogs = pgTable("fuel_logs", {
  id: id(),
  equipmentId: uuid("equipment_id")
    .notNull()
    .references(() => equipment.id),
  workUnitId: uuid("work_unit_id").references(() => workUnits.id),
  day: date("day").notNull(),
  liters: qty("liters").notNull(),
  pricePerLiter: money("price_per_liter").notNull().default("0"),
  value: money("value").notNull().default("0"),
  hourMeter: qty("hour_meter"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const repairs = pgTable("repairs", {
  id: id(),
  equipmentId: uuid("equipment_id")
    .notNull()
    .references(() => equipment.id),
  kind: repairType("kind").notNull(),
  /** legătura cu observația din teren, păstrată în ambele sensuri (§18.1.3) */
  requestId: uuid("request_id").references(() => requests.id),
  description: text("description").notNull(),
  startedAt: date("started_at").notNull(),
  finishedAt: date("finished_at"),
  /** costul se raportează la ORE, nu la zile (§18.1.6) */
  hours: qty("hours").notNull().default("0"),
  laborCost: money("labor_cost").notNull().default("0"),
  materialCost: money("material_cost").notNull().default("0"),
  /** o reparație are frecvent facturi de la MAI MULȚI furnizori (§18.1.7) */
  invoices: jsonb("invoices").notNull().default(sql`'[]'::jsonb`),
  totalCost: money("total_cost").notNull().default("0"),
  immobilized: boolean("immobilized").notNull().default(false),
  createdAt: createdAt(),
});

export const tools = pgTable("tools", {
  id: id(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  firmId: uuid("firm_id").references(() => firms.id),
  status: toolStatus("status").notNull().default("activ"),
  warehouseId: uuid("warehouse_id").references(() => warehouses.id),
  /** la cine e acum */
  holderUserId: uuid("holder_user_id").references(() => users.id),
  holderPartnerId: uuid("holder_partner_id").references(() => partners.id),
  purchaseValue: money("purchase_value").notNull().default("0"),
  createdAt: createdAt(),
});

/** O singură entitate, mai multe tipuri, o singură coadă centrală (§18). */
export const transports = pgTable("transports", {
  id: id(),
  code: text("code").notNull(),
  kind: transportType("kind").notNull(),
  status: transportStatus("status").notNull().default("ceruta"),
  /** cele generate automat (din comenzi, din rezervări de utilaje) intră singure */
  autoGenerated: boolean("auto_generated").notNull().default(false),
  sourceType: text("source_type"),
  sourceId: uuid("source_id"),
  fromText: text("from_text"),
  toText: text("to_text"),
  fromObjectiveId: uuid("from_objective_id").references(() => objectives.id),
  toObjectiveId: uuid("to_objective_id").references(() => objectives.id),
  workUnitId: uuid("work_unit_id").references(() => workUnits.id),
  day: date("day").notNull(),
  description: text("description"),
  cost: money("cost").notNull().default("0"),
  requestedBy: uuid("requested_by").references(() => users.id),
  createdAt: createdAt(),
});

/* ══════════════════════════ 11. FIȘIERE ȘI PV ══════════════════════════ */

/**
 * Arborele de foldere stă în Postgres, listă de adiacență (§19.1).
 * Mutarea/redenumirea unui folder = UN SINGUR UPDATE, zero operații pe storage,
 * inclusiv pe foldere cu 100.000+ fișiere.
 */
export const fileNodes = pgTable("file_nodes", {
  id: id(),
  parentId: uuid("parent_id"),
  kind: nodeType("kind").notNull(),
  name: text("name").notNull(),
  /** folderul auto-generat al unei unități de lucru */
  workUnitId: uuid("work_unit_id").references(() => workUnits.id),
  contractId: uuid("contract_id").references(() => contracts.id),
  objectiveId: uuid("objective_id").references(() => objectives.id),
  currentVersionId: uuid("current_version_id"),
  /** soft-delete → coș de gunoi; numele redevine disponibil imediat */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/** Append-only. Nimic nu se suprascrie niciodată. */
export const fileVersions = pgTable("file_versions", {
  id: id(),
  nodeId: uuid("node_id")
    .notNull()
    .references(() => fileNodes.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  /** cheia în storage — calea NU e codată în ea */
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  /** geotag + timestamp pe poze — dovada că inspecția s-a făcut acolo (§19.1) */
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  takenAt: timestamp("taken_at", { withTimezone: true }),
  /** înainte / după, pe lucrare */
  phase: text("phase"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: createdAt(),
});

/**
 * Motorul generic de PV (§19.2). Un șablon per tip, nu cod separat per tip:
 * predare-primire utilaj/unelte, custodie, acces, recepție calitativă,
 * lucrări ascunse, recepție la terminare, inventar.
 */
export const pvTemplates = pgTable("pv_templates", {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  storageKey: text("storage_key"),
  /** câmpuri poziționate PROCENTUAL față de pagină, nu în puncte fixe */
  fields: jsonb("fields").notNull().default(sql`'[]'::jsonb`),
  /** nomenclator folosit deja ⇒ dezactivare, nu ștergere (PLAN.md §9.11) */
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const pvDocuments = pgTable("pv_documents", {
  id: id(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => pvTemplates.id),
  code: text("code").notNull(),
  workUnitId: uuid("work_unit_id").references(() => workUnits.id),
  status: pvStatus("status").notNull().default("draft"),
  values: jsonb("values").notNull().default(sql`'{}'::jsonb`),
  /** link unic, tokenizat, fără cont — pentru cine semnează din afară */
  token: text("token"),
  signerName: text("signer_name"),
  signatureImage: text("signature_image"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signerIp: text("signer_ip"),
  /** GOL CUNOSCUT: fără hash de conținut la semnare. Vezi PLAN.md §7. */
  contentHash: text("content_hash"),
  /** jurnal: creat / trimis / deschis / semnat */
  activity: jsonb("activity").notNull().default(sql`'[]'::jsonb`),
  fileNodeId: uuid("file_node_id").references(() => fileNodes.id),
  createdAt: createdAt(),
});

/* ══════════════════════════ 12. RAPOARTE, FACTURI, NOTIFICĂRI ══════════════════════════ */

/**
 * Raportul lunar către client (§20.1) — „banii se primesc în baza unui raport",
 * deci e la fel de important ca factura. Versionat și ÎNGHEȚAT la emitere;
 * modificările ulterioare apar în luna următoare ca ajustare.
 */
export const monthlyReports = pgTable("monthly_reports", {
  id: id(),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => contracts.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"),
  /** conținutul înghețat la emitere */
  content: jsonb("content"),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => users.id),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  token: text("token"),
  createdAt: createdAt(),
});

export const invoices = pgTable("invoices", {
  id: id(),
  firmId: uuid("firm_id")
    .notNull()
    .references(() => firms.id),
  contractId: uuid("contract_id").references(() => contracts.id),
  clientId: uuid("client_id")
    .notNull()
    .references(() => partners.id),
  series: text("series").notNull(),
  number: integer("number").notNull(),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  status: invoiceStatus("status").notNull().default("draft"),
  netValue: money("net_value").notNull().default("0"),
  vatValue: money("vat_value").notNull().default("0"),
  totalValue: money("total_value").notNull().default("0"),
  /** intercompany: clientul e o firmă din grup — contează la consolidare (§3) */
  isIntercompany: boolean("is_intercompany").notNull().default(false),
  monthlyReportId: uuid("monthly_report_id").references(() => monthlyReports.id),
  /** schelet: statusul în e-Factura. Vezi PLAN.md §7. */
  efacturaStatus: text("efactura_status"),
  createdAt: createdAt(),
});

export const invoiceLines = pgTable("invoice_lines", {
  id: id(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: qty("quantity").notNull().default("1"),
  unitPrice: money("unit_price").notNull().default("0"),
  value: money("value").notNull().default("0"),
  situatieId: uuid("situatie_id").references(() => situatiiLucrari.id),
  createdAt: createdAt(),
});

export const notifications = pgTable("notifications", {
  id: id(),
  userId: uuid("user_id").references(() => users.id),
  role: userRole("role"),
  /** buget_80 | sl_de_aprobat | pv_deschis | revizie_scadenta | contract_expira | delta_neumpluta | … */
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  href: text("href"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/* ────────────────────────────── relații ────────────────────────────── */

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  firm: one(firms, { fields: [contracts.firmId], references: [firms.id] }),
  client: one(partners, { fields: [contracts.clientId], references: [partners.id] }),
  owner: one(users, { fields: [contracts.ownerId], references: [users.id] }),
  components: many(contractComponents),
  years: many(contractYears),
  objectives: many(contractObjectives),
}));

export const contractComponentsRelations = relations(contractComponents, ({ one, many }) => ({
  contract: one(contracts, { fields: [contractComponents.contractId], references: [contracts.id] }),
  budgets: many(componentBudgets),
}));

export const workUnitsRelations = relations(workUnits, ({ one, many }) => ({
  objective: one(objectives, { fields: [workUnits.objectiveId], references: [objectives.id] }),
  firm: one(firms, { fields: [workUnits.firmId], references: [firms.id] }),
  responsible: one(users, { fields: [workUnits.responsibleId], references: [users.id] }),
  stages: many(workUnitStages),
  allocations: many(fundingAllocations),
  devize: many(devize),
  packages: many(packages),
}));

export const fundingAllocationsRelations = relations(fundingAllocations, ({ one }) => ({
  workUnit: one(workUnits, { fields: [fundingAllocations.workUnitId], references: [workUnits.id] }),
  contract: one(contracts, { fields: [fundingAllocations.contractId], references: [contracts.id] }),
  component: one(contractComponents, {
    fields: [fundingAllocations.componentId],
    references: [contractComponents.id],
  }),
}));

export const devizeRelations = relations(devize, ({ one, many }) => ({
  workUnit: one(workUnits, { fields: [devize.workUnitId], references: [workUnits.id] }),
  lines: many(devizLines),
}));

export const packagesRelations = relations(packages, ({ one, many }) => ({
  workUnit: one(workUnits, { fields: [packages.workUnitId], references: [workUnits.id] }),
  subcontractor: one(partners, { fields: [packages.subcontractorId], references: [partners.id] }),
  lines: many(packageLines),
  situatii: many(situatiiLucrari),
}));

export const situatiiLucrariRelations = relations(situatiiLucrari, ({ one, many }) => ({
  pkg: one(packages, { fields: [situatiiLucrari.packageId], references: [packages.id] }),
  lines: many(slLines),
}));

export const equipmentRelations = relations(equipment, ({ many }) => ({
  plannings: many(equipmentPlannings),
  fuelLogs: many(fuelLogs),
  repairs: many(repairs),
  protocols: many(handoverProtocols),
}));

export const requestsRelations = relations(requests, ({ one }) => ({
  objective: one(objectives, { fields: [requests.objectiveId], references: [objectives.id] }),
  contract: one(contracts, { fields: [requests.contractId], references: [contracts.id] }),
  workUnit: one(workUnits, { fields: [requests.workUnitId], references: [workUnits.id] }),
}));
