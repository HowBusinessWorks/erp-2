/**
 * Nomenclatoare — etichete, file și VALIDATOARE PURE.
 *
 * Fișierul e pur intenționat: nu importă `lib/db`, deci poate fi folosit și dintr-o
 * componentă de client. Vezi `lib/routing-types.ts` pentru același motiv.
 *
 * Principiul 4 din PLAN.md §9.0: validarea stă aici, nu în componentă. Aceleași
 * funcții păzesc și server action-ul, și formularul.
 */

export type FormErrors = Record<string, string>;

export const NOMENCLATOR_TABS = [
  { key: "firme", label: "Firme" },
  { key: "parteneri", label: "Parteneri" },
  { key: "produse", label: "Produse" },
  { key: "calificari", label: "Calificări" },
  { key: "operatiuni", label: "Operațiuni" },
  { key: "checklist", label: "Checklist" },
  { key: "utilizatori", label: "Utilizatori" },
  { key: "motorina", label: "Preț motorină" },
  { key: "pv", label: "Șabloane PV" },
] as const;

export type NomenclatorTab = (typeof NOMENCLATOR_TABS)[number]["key"];

export const PARTNER_TYPES = [
  { value: "client", label: "Client" },
  { value: "furnizor", label: "Furnizor" },
  { value: "subcontractant", label: "Subcontractant" },
  { value: "angajat", label: "Angajat" },
] as const;

export const UNITS = ["buc", "kg", "m", "mp", "mc", "l", "ore", "set", "ml"];

export const PV_KINDS = [
  { value: "predare_primire", label: "Predare-primire" },
  { value: "receptie", label: "Recepție" },
  { value: "interventie", label: "Intervenție" },
  { value: "constatare", label: "Constatare" },
];

/* ─────────────────────── ajutoare pure ─────────────────────── */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function blank(v: string | undefined): boolean {
  return !v || v.trim() === "";
}

/** „1.234,56" sau „1234.56" -> număr. Doar pentru VALIDARE; banii se convertesc cu lib/money. */
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

function req(v: Record<string, string>, errors: FormErrors, field: string, message: string) {
  if (blank(v[field])) errors[field] = message;
}

function positive(v: Record<string, string>, errors: FormErrors, field: string, label: string) {
  if (blank(v[field])) return;
  const n = numberOf(v[field]);
  if (Number.isNaN(n)) errors[field] = `${label} nu e un număr.`;
  else if (n < 0) errors[field] = `${label} nu poate fi negativ.`;
}

/* ─────────────────────── validatoare ─────────────────────── */

export function validateFirm(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "name", "Denumirea firmei e obligatorie.");
  req(v, e, "cui", "CUI-ul e obligatoriu.");
  if (!blank(v.cui) && !/^(RO)?\s?\d{2,10}$/i.test(v.cui.trim())) {
    e.cui = "CUI invalid — cifre, opțional cu RO în față.";
  }
  req(v, e, "documentPrefix", "Fără prefix, facturile firmei n-au serie.");
  if (!blank(v.documentPrefix) && !/^[A-Z0-9]{2,8}$/.test(v.documentPrefix.trim())) {
    e.documentPrefix = "Doar majuscule și cifre, 2–8 caractere.";
  }
  return e;
}

export function validatePartner(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "name", "Denumirea partenerului e obligatorie.");
  if (blank(v.types)) e.types = "Alege cel puțin un rol.";
  if (!blank(v.contactEmail) && !EMAIL.test(v.contactEmail.trim())) {
    e.contactEmail = "Adresă de e-mail invalidă.";
  }
  positive(v, e, "retentionPercent", "Procentul de garanție");
  if (!e.retentionPercent && !blank(v.retentionPercent) && numberOf(v.retentionPercent) > 100) {
    e.retentionPercent = "Procentul nu poate depăși 100.";
  }
  return e;
}

export function validateProduct(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "code", "Codul e obligatoriu.");
  req(v, e, "name", "Denumirea e obligatorie.");
  req(v, e, "unit", "Unitatea de măsură e obligatorie.");
  positive(v, e, "lastPrice", "Prețul");
  positive(v, e, "leadTimeDays", "Lead time-ul");
  positive(v, e, "minStock", "Stocul minim");
  positive(v, e, "maxStock", "Stocul maxim");
  if (!e.minStock && !e.maxStock && numberOf(v.maxStock) > 0) {
    if (numberOf(v.minStock) > numberOf(v.maxStock)) {
      e.maxStock = "Stocul maxim nu poate fi sub cel minim.";
    }
  }
  return e;
}

export function validateLaborRate(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "qualification", "Calificarea e obligatorie.");
  req(v, e, "hourlyCost", "Rata orară e obligatorie.");
  positive(v, e, "hourlyCost", "Rata orară");
  if (!e.hourlyCost && !blank(v.hourlyCost) && numberOf(v.hourlyCost) === 0) {
    e.hourlyCost = "O rată de 0 lei/oră face pontajul gratuit.";
  }
  req(v, e, "validFrom", "Data de la care se aplică e obligatorie.");
  if (!blank(v.validFrom) && !blank(v.validTo) && v.validTo < v.validFrom) {
    e.validTo = "Sfârșitul valabilității e înaintea începutului.";
  }
  return e;
}

export function validateOperation(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "code", "Codul operațiunii e obligatoriu.");
  req(v, e, "name", "Denumirea e obligatorie.");
  req(v, e, "unit", "Unitatea de măsură e obligatorie.");
  positive(v, e, "standardHours", "Norma de timp");
  positive(v, e, "estimatedCost", "Costul estimat");
  if (!blank(v.materials)) {
    const parsed = parseOperationMaterials(v.materials);
    if (parsed.invalid.length > 0) {
      e.materials = `Linii pe care nu le pot citi: ${parsed.invalid.join("; ")}`;
    }
  }
  return e;
}

export function validateChecklistTemplate(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "name", "Denumirea șablonului e obligatorie.");
  if (parseChecklistItems(v.items ?? "").length === 0) {
    e.items = "Un șablon fără puncte nu arată nimic pe teren.";
  }
  return e;
}

export function validateUser(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "name", "Numele e obligatoriu.");
  req(v, e, "email", "E-mailul e obligatoriu.");
  if (!blank(v.email) && !EMAIL.test(v.email.trim())) e.email = "Adresă de e-mail invalidă.";
  req(v, e, "role", "Rolul e obligatoriu.");
  // La creare (fără id) parola e obligatorie; la editare, goală = neschimbată.
  if (blank(v.id) && blank(v.password)) e.password = "Parola se setează de administrator.";
  if (!blank(v.password) && v.password.length < 6) {
    e.password = "Minimum 6 caractere.";
  }
  return e;
}

export function validateFuelPrice(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "month", "Luna e obligatorie.");
  if (!blank(v.month) && !/^\d{4}-\d{2}$/.test(v.month.trim())) e.month = "Format așteptat: AAAA-LL.";
  req(v, e, "pricePerLiter", "Prețul pe litru e obligatoriu.");
  positive(v, e, "pricePerLiter", "Prețul pe litru");
  if (!e.pricePerLiter && numberOf(v.pricePerLiter) === 0) {
    e.pricePerLiter = "Un preț de 0 lei/l face motorina gratuită.";
  }
  return e;
}

export function validatePvTemplate(v: Record<string, string>): FormErrors {
  const e: FormErrors = {};
  req(v, e, "name", "Denumirea șablonului e obligatorie.");
  req(v, e, "kind", "Tipul de PV e obligatoriu.");
  return e;
}

/* ─────────────────── liste editate ca text ───────────────────
 * Punctele de checklist și materialele normate se editează câte unul pe linie.
 * Nu e cea mai bogată interfață, dar e cea mai ușor de schimbat — și nu cere
 * un al doilea formular dinamic. Vezi PROGRESS.md §4.
 */

export type ChecklistItemDraft = { section: string | null; text: string };

/** „Electrică | Verifică tabloul" -> { section: "Electrică", text: "Verifică tabloul" } */
export function parseChecklistItems(input: string): ChecklistItemDraft[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const idx = line.indexOf("|");
      if (idx === -1) return { section: null, text: line };
      const section = line.slice(0, idx).trim();
      const text = line.slice(idx + 1).trim();
      return text === "" ? { section: null, text: section } : { section: section || null, text };
    });
}

export function formatChecklistItems(items: ChecklistItemDraft[]): string {
  return items.map((i) => (i.section ? `${i.section} | ${i.text}` : i.text)).join("\n");
}

export type OperationMaterialDraft = { code: string; quantity: number };

/** „CIM-42 x 2,5" -> { code: "CIM-42", quantity: 2.5 } */
export function parseOperationMaterials(input: string): {
  materials: OperationMaterialDraft[];
  invalid: string[];
} {
  const materials: OperationMaterialDraft[] = [];
  const invalid: string[] = [];
  for (const raw of input.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const m = /^(.+?)\s*[x×]\s*([\d.,]+)$/i.exec(line);
    const qty = m ? numberOf(m[2]) : NaN;
    if (!m || Number.isNaN(qty) || qty <= 0) invalid.push(line);
    else materials.push({ code: m[1].trim(), quantity: qty });
  }
  return { materials, invalid };
}

export function formatOperationMaterials(materials: OperationMaterialDraft[]): string {
  return materials.map((m) => `${m.code} x ${m.quantity}`).join("\n");
}

/** „2026-08" -> „2026-08-01"; ziua e cheia din `fuel_prices`. */
export function monthToDay(month: string): string {
  return `${month.trim()}-01`;
}

export function dayToMonth(day: string): string {
  return day.slice(0, 7);
}

const MONTHS = [
  "ianuarie",
  "februarie",
  "martie",
  "aprilie",
  "mai",
  "iunie",
  "iulie",
  "august",
  "septembrie",
  "octombrie",
  "noiembrie",
  "decembrie",
];

export function monthLabel(day: string): string {
  const [y, m] = day.split("-");
  const idx = Number(m) - 1;
  return `${MONTHS[idx] ?? m} ${y}`;
}
