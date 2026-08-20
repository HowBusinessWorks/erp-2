/**
 * Șabloanele de PV (ecranul 33) — partea pură, fără acces la bază.
 *
 * Poziția unui câmp e în PROCENTE din lățimea și înălțimea paginii. Un PDF scanat la
 * 200 dpi și același PDF scanat la 300 dpi au câmpul în același loc procentual și în
 * locuri complet diferite în puncte. Cu procente, șablonul supraviețuiește rescanării
 * și schimbării de format.
 */

export type TemplateFieldKind = "text" | "data" | "numar" | "semnatura";

export type TemplateField = {
  key: string;
  label: string;
  /** stânga, în % din lățimea paginii */
  x: number;
  /** sus, în % din înălțimea paginii */
  y: number;
  /** lățimea câmpului, în % din lățimea paginii */
  width: number;
  kind: TemplateFieldKind;
};

export const TEMPLATE_KIND_LABEL: Record<string, string> = {
  predare_utilaj: "Predare-primire utilaj",
  predare_unelte: "Predare-primire unelte",
  custodie: "Custodie material la subcontractant",
  lucrari_ascunse: "Recepție lucrări ascunse",
  receptie_finala: "Recepție la terminarea lucrărilor",
  inventar: "Inventar",
};

export const FIELD_KIND_LABEL: Record<TemplateFieldKind, string> = {
  text: "Text",
  data: "Dată",
  numar: "Număr",
  semnatura: "Semnătură",
};

/** Ce câmpuri are sens să pui pe fiecare fel de PV — punctul de pornire, nu o cușcă. */
export const SUGGESTED_FIELDS: Record<string, { key: string; label: string; kind: TemplateFieldKind }[]> = {
  predare_utilaj: [
    { key: "cod_pv", label: "Număr PV", kind: "text" },
    { key: "utilaj", label: "Utilaj", kind: "text" },
    { key: "data_predare", label: "Data predării", kind: "data" },
    { key: "contor", label: "Contor la predare", kind: "numar" },
    { key: "predator", label: "Predat de", kind: "text" },
    { key: "primitor", label: "Primit de", kind: "text" },
    { key: "semnatura_primitor", label: "Semnătura primitorului", kind: "semnatura" },
  ],
  predare_unelte: [
    { key: "cod_pv", label: "Număr PV", kind: "text" },
    { key: "unealta", label: "Unealtă", kind: "text" },
    { key: "data_predare", label: "Data predării", kind: "data" },
    { key: "primitor", label: "Primit de", kind: "text" },
    { key: "semnatura_primitor", label: "Semnătura primitorului", kind: "semnatura" },
  ],
  custodie: [
    { key: "subcontractant", label: "Subcontractant", kind: "text" },
    { key: "valoare", label: "Valoare custodie", kind: "numar" },
    { key: "data", label: "Data", kind: "data" },
    { key: "semnatura", label: "Semnătura", kind: "semnatura" },
  ],
  lucrari_ascunse: [
    { key: "lucrare", label: "Lucrare", kind: "text" },
    { key: "faza", label: "Faza verificată", kind: "text" },
    { key: "data", label: "Data verificării", kind: "data" },
    { key: "semnatura_diriginte", label: "Semnătura dirigintelui", kind: "semnatura" },
  ],
  receptie_finala: [
    { key: "lucrare", label: "Lucrare", kind: "text" },
    { key: "contract", label: "Contract", kind: "text" },
    { key: "data", label: "Data recepției", kind: "data" },
    { key: "valoare", label: "Valoarea lucrărilor", kind: "numar" },
    { key: "semnatura_beneficiar", label: "Semnătura beneficiarului", kind: "semnatura" },
  ],
  inventar: [
    { key: "gestiune", label: "Gestiune", kind: "text" },
    { key: "data", label: "Data inventarului", kind: "data" },
    { key: "semnatura_gestionar", label: "Semnătura gestionarului", kind: "semnatura" },
  ],
};

/** Șablonul A4 în proporții: 210 × 297 mm. Previzualizarea păstrează raportul. */
export const A4_RATIO = 297 / 210;
