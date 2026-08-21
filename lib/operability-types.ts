/**
 * Blocul E, restul — validatoare PURE și etichete pentru tot ce se introduce din
 * interfață în afara nomenclatoarelor și a contractelor (PLAN.md §9.4–§9.10).
 *
 * Pur: fără `lib/db`, deci îl importă și componentele de client. Principiul 4 din §9.0 —
 * aceeași funcție păzește formularul și server action-ul.
 */

export type FormErrors = Record<string, string>;

/* ─────────────────────────── etichete ─────────────────────────── */

export const REQUEST_KINDS = [
  { value: "tichet", label: "Tichet — sesizare de la client" },
  { value: "solicitare", label: "Solicitare — cerere de lucrare" },
  { value: "constatare", label: "Constatare — problemă găsită pe teren" },
  { value: "propunere", label: "Propunere — lucrare de vândut (Delta)" },
] as const;

export const REQUEST_SOURCES = [
  { value: "manual", label: "Introdusă la birou" },
  { value: "telefon", label: "Telefon" },
  { value: "email", label: "E-mail" },
] as const;

export const WORK_UNIT_KINDS = [
  { value: "lucrare", label: "Lucrare" },
  { value: "interventie", label: "Intervenție" },
  { value: "inspectie", label: "Inspecție" },
] as const;

export const WAREHOUSE_KINDS = [
  { value: "centrala", label: "Depozit central" },
  { value: "santier", label: "Gestiune de șantier" },
  { value: "echipa", label: "Gestiune de echipă" },
  { value: "subcontractant", label: "La subcontractant" },
  { value: "consignatie", label: "Consignație — marfa nu e a ta până la consum" },
  { value: "unelte", label: "Magazie de unelte" },
] as const;

export const TRANSPORT_KINDS = [
  { value: "livrare_material", label: "Livrare de material" },
  { value: "transfer_santiere", label: "Transfer între șantiere" },
  { value: "retur_magazie", label: "Retur la magazie" },
  { value: "evacuare_moloz", label: "Evacuare moloz" },
  { value: "transport_utilaj", label: "Transport de utilaj" },
] as const;

export const COST_TYPES = [
  { value: "material", label: "Material" },
  { value: "manopera", label: "Manoperă" },
  { value: "servicii_subc", label: "Servicii / subcontractant" },
  { value: "utilaj", label: "Utilaj" },
  { value: "motorina", label: "Motorină" },
  { value: "transport", label: "Transport" },
  { value: "reparatii", label: "Reparații" },
  { value: "alte", label: "Alte (chirii, utilități, servicii)" },
] as const;

export const EQUIPMENT_CATEGORIES = [
  "excavator",
  "buldoexcavator",
  "autobasculanta",
  "automacara",
  "compactor",
  "generator",
  "pompa",
  "vidanja",
  "utilitara",
  "altele",
];

/* ─────────────────────── ajutoare pure ─────────────────────── */

function blank(v: string | undefined): boolean {
  return !v || v.trim() === "";
}

export function numberOf(input: string | undefined): number {
  if (blank(input)) return 0;
  const cleaned = String(input)
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function req(v: Record<string, string>, e: FormErrors, field: string, message: string) {
  if (blank(v[field])) e[field] = message;
}

function positive(v: Record<string, string>, e: FormErrors, field: string, label: string) {
  if (blank(v[field])) return;
  const n = numberOf(v[field]);
  if (Number.isNaN(n)) e[field] = `${label} nu e un număr.`;
  else if (n < 0) e[field] = `${label} nu poate fi negativ.`;
}

function order(v: Record<string, string>, e: FormErrors, from: string, to: string) {
  if (!blank(v[from]) && !blank(v[to]) && v[to] < v[from]) {
    e[to] = "Sfârșitul e înaintea începutului.";
  }
}

/* ─────────────────────── §9.4 Cererea din birou ─────────────────────── */

export function validateRequest(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "title", "Fără un titlu, cererea nu se poate ruta.");
  req(v, e, "kind", "Alege tipul cererii.");
  req(v, e, "objectiveId", "Rutarea din §7 pleacă de la obiectiv — e obligatoriu.");
  positive(v, e, "estimatedValue", "Valoarea estimată");
  // Propunerea moare dacă nu expiră: backlogul Delta se umple de lucruri moarte (§14).
  if (v.kind === "propunere" && blank(v.expiresAt)) {
    e.expiresAt = "O propunere fără termen rămâne pe veci în backlog.";
  }
  return e;
}

/* ─────────────────── §9.5 Unități de lucru și etape ─────────────────── */

export function validateWorkUnit(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "title", "Denumirea unității de lucru e obligatorie.");
  req(v, e, "kind", "Alege tipul.");
  req(v, e, "firmId", "Alege firma executantă.");
  req(v, e, "objectiveId", "Fără obiectiv, unitatea nu are unde să existe.");
  order(v, e, "startDate", "endDate");
  positive(v, e, "estimatedValue", "Valoarea estimată");
  positive(v, e, "budgetCost", "Bugetul de cost");
  positive(v, e, "fundingValue", "Suma finanțată");

  // Regula 2 din CLAUDE.md: finanțarea e o legătură. Ori e completă, ori lipsește de tot.
  const hasContract = !blank(v.fundingContractId);
  const hasComponent = !blank(v.fundingComponentId);
  if (hasContract !== hasComponent) {
    e.fundingComponentId = "Finanțarea are nevoie și de contract, și de componentă.";
  }
  if (hasContract && hasComponent && numberOf(v.fundingValue) <= 0) {
    e.fundingValue = "O alocare de 0 lei nu apasă pe niciun plafon.";
  }
  if (!blank(v.subcontractorId) && v.executant !== "subcontractant") {
    e.subcontractorId = "Subcontractantul se pune doar când executantul e subcontractant.";
  }
  if (v.executant === "subcontractant" && blank(v.subcontractorId)) {
    e.subcontractorId = "Alege subcontractantul.";
  }
  return e;
}

export function validateStage(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "name", "Denumirea etapei e obligatorie.");
  order(v, e, "startDate", "endDate");
  positive(v, e, "materialBudget", "Bugetul de materiale");
  positive(v, e, "laborBudget", "Bugetul de manoperă");
  if (!blank(v.percentOfWork)) {
    const n = numberOf(v.percentOfWork);
    if (Number.isNaN(n) || n < 0 || n > 100) {
      e.percentOfWork = "Ponderea etapei e între 0 și 100.";
    }
  }
  return e;
}

/* ─────────────────────── §9.7 Resurse ─────────────────────── */

export function validateEquipment(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "code", "Codul utilajului e obligatoriu.");
  req(v, e, "name", "Denumirea e obligatorie.");
  req(v, e, "category", "Categoria filtrează solicitările de utilaj (§18.1.2).");
  positive(v, e, "internalHourlyRate", "Tariful orar intern");
  positive(v, e, "dailyRentCost", "Chiria zilnică");
  positive(v, e, "hourMeter", "Contorul de ore");
  positive(v, e, "km", "Kilometrajul");
  positive(v, e, "nextServiceHours", "Ora următoarei revizii");

  // §9.7, litera legii: `lib/equipment.ts` calculează scadența pe DATĂ și pe ORE.
  // Un utilaj introdus fără ore nu declanșează niciodată revizia.
  if (blank(v.nextServiceDate) && blank(v.nextServiceHours)) {
    e.nextServiceHours = "Revizia se calculează pe dată ȘI pe ore. Completează cel puțin una — de preferat amândouă.";
  }
  if (!blank(v.nextServiceHours) && !Number.isNaN(numberOf(v.nextServiceHours))) {
    if (numberOf(v.nextServiceHours) < numberOf(v.hourMeter)) {
      e.nextServiceHours = "Ora reviziei e sub contorul actual — revizia e deja depășită.";
    }
  }
  if (v.isRented === "1" && numberOf(v.dailyRentCost) <= 0) {
    e.dailyRentCost = "Un utilaj închiriat fără chirie nu produce cost de exploatare.";
  }
  return e;
}

export function validateTool(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "code", "Codul e obligatoriu.");
  req(v, e, "name", "Denumirea e obligatorie.");
  positive(v, e, "purchaseValue", "Valoarea de achiziție");
  if (!blank(v.holderUserId) && !blank(v.holderPartnerId)) {
    e.holderPartnerId = "Unealta e la o singură persoană: sau un angajat, sau un partener.";
  }
  return e;
}

export function validateTransport(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "kind", "Alege tipul transportului.");
  req(v, e, "day", "Ziua transportului e obligatorie.");
  if (blank(v.fromText) && blank(v.fromObjectiveId)) {
    e.fromText = "De unde pleacă?";
  }
  if (blank(v.toText) && blank(v.toObjectiveId)) {
    e.toText = "Unde ajunge?";
  }
  positive(v, e, "cost", "Costul");
  return e;
}

/* ─────────────────────── §9.8 Stoc și achiziții ─────────────────────── */

export function validateWarehouse(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "code", "Codul gestiunii e obligatoriu.");
  req(v, e, "name", "Denumirea e obligatorie.");
  req(v, e, "firmId", "Gestiunea aparține unei firme.");
  req(v, e, "kind", "Alege tipul gestiunii.");
  if (v.kind === "santier" && blank(v.workUnitId)) {
    e.workUnitId = "O gestiune de șantier ține de o lucrare.";
  }
  if (v.kind === "consignatie" && blank(v.partnerId)) {
    e.partnerId = "Consignația e a unui furnizor — el rămâne proprietarul mărfii.";
  }
  return e;
}

export type PoLineDraft = {
  productId: string;
  quantity: number;
  unitPrice: number;
  contractId: string;
  componentId: string;
  workUnitId: string;
  stageId: string;
};

export function validatePurchaseOrder(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "firmId", "Alege firma care comandă.");
  req(v, e, "deliverToWarehouseId", "Unde se livrează marfa?");
  return e;
}

/**
 * §9.8: analitica pe linie e obligatorie **de la creare**. Fără ea, raportul pe etapă e
 * gol (§22.4) și angajamentul nu apasă pe nicio componentă.
 */
export function validatePoLines(lines: PoLineDraft[]): FormErrors {
  const e: FormErrors = {};
  if (lines.length === 0) {
    e.lines = "O comandă fără linii nu comandă nimic.";
    return e;
  }
  lines.forEach((l, i) => {
    if (!l.productId) e[`line.${i}.productId`] = "Alege produsul.";
    if (!(l.quantity > 0)) e[`line.${i}.quantity`] = "Cantitatea trebuie să fie peste 0.";
    if (l.unitPrice < 0) e[`line.${i}.unitPrice`] = "Prețul nu poate fi negativ.";
    if (!l.componentId) {
      e[`line.${i}.componentId`] = "Analitica e obligatorie pe fiecare linie.";
    }
  });
  return e;
}

/* ─────────────────────── §9.9 Documente ─────────────────────── */

export function validateFolder(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "name", "Numele folderului e obligatoriu.");
  if (!blank(v.name) && /[\\/]/.test(v.name)) {
    e.name = "Numele nu poate conține / sau \\.";
  }
  return e;
}

/* ─────────────────────── §9.10 Cost manual ─────────────────────── */

/**
 * Factura de la furnizor care nu vine printr-o recepție: chirii, utilități, servicii.
 * Merge prin `recordCost`, cu `documentType = "factura_manuala"` — regula 1, literal.
 */
export function validateManualCost(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "firmId", "Alege firma pe care intră costul.");
  req(v, e, "documentDate", "Data documentului e obligatorie.");
  req(v, e, "costType", "Alege felul costului.");
  req(v, e, "value", "Valoarea e obligatorie.");
  positive(v, e, "value", "Valoarea");
  if (!e.value && numberOf(v.value) === 0) e.value = "Un cost de 0 lei nu se înregistrează.";

  // Fără nicio analitică, linia intră în registru și nu apasă pe niciun plafon.
  if (blank(v.chargedComponentId) && blank(v.workUnitId)) {
    e.chargedComponentId = "Alege componenta care plătește sau unitatea de lucru care o deduce.";
  }
  // §12: când „descărcat" diferă de „folosit", motivul e obligatoriu.
  const splits =
    !blank(v.usedComponentId) &&
    !blank(v.chargedComponentId) &&
    v.usedComponentId !== v.chargedComponentId;
  if (splits && blank(v.splitReason)) {
    e.splitReason = "Componenta care plătește diferă de cea unde s-a folosit. Motivul e obligatoriu.";
  }
  return e;
}

/* ─────────────────────── §9.6 Deviz și derivate ─────────────────────── */

export function validateDeviz(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "name", "Denumirea devizului e obligatorie.");
  req(v, e, "kind", "Client sau intern?");
  return e;
}

export function validateDevizLine(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "description", "Descrierea poziției e obligatorie.");
  req(v, e, "unit", "Unitatea de măsură e obligatorie.");
  const qty = numberOf(v.quantity);
  if (Number.isNaN(qty) || qty <= 0) e.quantity = "Cantitatea trebuie să fie peste 0.";
  positive(v, e, "unitPrice", "Prețul unitar");
  return e;
}

export function validatePackage(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "name", "Denumirea pachetului e obligatorie.");
  req(v, e, "subcontractorId", "Un pachet se dă unui subcontractant.");
  return e;
}
