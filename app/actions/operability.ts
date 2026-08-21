"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq, sql as raw } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  equipment,
  fileNodes,
  fileVersions,
  poLines,
  purchaseOrders,
  requests,
  tools,
  transports,
  warehouses,
  workUnitStages,
  workUnits,
} from "@/lib/db/schema";
import { recordCost } from "@/lib/cost-ledger";
import { parseInput, toDb } from "@/lib/money";
import {
  numberOf,
  validateEquipment,
  validateFolder,
  validateManualCost,
  validatePoLines,
  validatePurchaseOrder,
  validateRequest,
  validateStage,
  validateTool,
  validateTransport,
  validateWarehouse,
  validateWorkUnit,
  type FormErrors,
  type PoLineDraft,
} from "@/lib/operability-types";
import { can, type Capability } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { createWorkUnit } from "@/lib/work-units";

/**
 * Blocul E, §9.4–§9.10 — introducerea datelor pentru cereri, unități de lucru, resurse,
 * stoc, documente și costul manual.
 *
 * Regula 1: costul trece prin `recordCost`, cu `documentType` nou. Zero `insert` paralel.
 * Regula 2: finanțarea unei UL e un rând în `funding_allocations`, pus de `createWorkUnit`.
 * Regula 5: poarta e `lib/permissions.ts`, verificată aici.
 */

async function guard(capability: Capability, message: string) {
  const session = await requireSession();
  if (!can(session.role, capability)) throw new Error(`FĂRĂ DREPT: ${message}`);
  return session;
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function nul(value: string): string | null {
  return value === "" ? null : value;
}

function num(value: string): string {
  const n = numberOf(value);
  return Number.isFinite(n) ? String(n) : "0";
}

function money(value: string): number {
  return parseInput(value);
}

function values(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of new Set(fd.keys())) {
    out[key] = fd
      .getAll(key)
      .map((v) => (typeof v === "string" ? v : ""))
      .join(",");
  }
  return out;
}

function check(errors: FormErrors) {
  const keys = Object.keys(errors);
  if (keys.length > 0) {
    throw new Error(`VALIDARE: ${keys.map((k) => `${k} — ${errors[k]}`).join("; ")}`);
  }
}

/**
 * Serie următoare pentru un prefix, din codurile deja existente — aceeași idee ca
 * `nextWorkUnitCode` din `lib/work-units.ts`: nu se ține un contor separat, care s-ar
 * putea desincroniza de realitate.
 */
function nextCode(prefix: string, codes: { code: string }[]): string {
  const max = codes.reduce((m, { code }) => {
    const digits = Number(code.replace(/\D/g, ""));
    return Number.isFinite(digits) ? Math.max(m, digits) : m;
  }, 1000);
  return `${prefix}-${max + 1}`;
}

/* ═══════════════════ §9.4 Cererea din birou ═══════════════════ */

/**
 * Clientul sună la birou — cazul cel mai frecvent, care azi n-are drum.
 * Cererea intră cu `source = manual` și de aici încolo urmează **exact** aceeași rutare
 * din §7 ca una venită din teren. Fără ramură nouă de cod.
 */
export async function createRequest(fd: FormData): Promise<void> {
  const session = await guard("cereri.decide", "cererile se introduc de PM sau admin.");
  check(validateRequest(values(fd)));

  const code = nextCode("CER", await db.select({ code: requests.code }).from(requests));
  const [row] = await db
    .insert(requests)
    .values({
      code,
      kind: str(fd, "kind") as "tichet" | "solicitare" | "constatare" | "propunere",
      source: (str(fd, "source") || "manual") as "manual" | "telefon" | "email",
      title: str(fd, "title"),
      description: nul(str(fd, "description")),
      firmId: nul(str(fd, "firmId")),
      objectiveId: nul(str(fd, "objectiveId")),
      contractId: nul(str(fd, "contractId")),
      operationId: nul(str(fd, "operationId")),
      estimatedValue: toDb(money(str(fd, "estimatedValue"))),
      expiresAt: nul(str(fd, "expiresAt")),
      status: "neprocesata",
      requestedBy: session.id,
    })
    .returning({ id: requests.id });

  revalidatePath("/cereri");
  redirect(`/cereri/${row.id}`);
}

/* ═══════════════════ §9.5 Unități de lucru și etape ═══════════════════ */

/**
 * Nu tot ce se lucrează trece printr-o cerere. UL creat direct — cu finanțarea ca
 * legătură (regula 2), nu ca un câmp `contract_id` pe unitate.
 */
export async function createWorkUnitDirect(fd: FormData): Promise<void> {
  const session = await guard("contracte.editeaza", "unitățile de lucru se deschid de PM sau admin.");
  check(validateWorkUnit(values(fd)));

  const contractId = str(fd, "fundingContractId");
  const componentId = str(fd, "fundingComponentId");
  const startDate = str(fd, "startDate");
  const anchor = startDate || new Date().toISOString().slice(0, 10);

  const unit = await createWorkUnit({
    kind: str(fd, "kind") as "inspectie" | "interventie" | "lucrare",
    title: str(fd, "title"),
    description: nul(str(fd, "description")),
    firmId: str(fd, "firmId"),
    objectiveId: str(fd, "objectiveId"),
    responsibleId: nul(str(fd, "responsibleId")),
    startDate: nul(startDate),
    endDate: nul(str(fd, "endDate")),
    estimatedValue: money(str(fd, "estimatedValue")),
    budgetCost: money(str(fd, "budgetCost")),
    status: (str(fd, "status") || "planificata") as "propusa" | "planificata" | "in_lucru",
    createdBy: session.id,
    funding:
      contractId && componentId
        ? {
            contractId,
            componentId,
            year: Number(anchor.slice(0, 4)),
            month: Number(anchor.slice(5, 7)),
            value: money(str(fd, "fundingValue")),
            reason: nul(str(fd, "fundingReason")),
          }
        : null,
  });

  // Executantul nu e parametru al `createWorkUnit` — se pune imediat, pe același rând.
  const executant = str(fd, "executant");
  if (executant === "subcontractant") {
    await db
      .update(workUnits)
      .set({ executant: "subcontractant", subcontractorId: nul(str(fd, "subcontractorId")) })
      .where(eq(workUnits.id, unit.id));
  }

  revalidatePath("/lucrari");
  redirect(`/lucrari/${unit.id}`);
}

/** Etapele — Gantt-ul de la ecranul 22 se desenează din ele. */
export async function saveStage(fd: FormData): Promise<void> {
  await guard("contracte.editeaza", "etapele se administrează de PM sau admin.");
  check(validateStage(values(fd)));

  const workUnitId = str(fd, "workUnitId");
  const id = str(fd, "id");

  const row = {
    name: str(fd, "name"),
    startDate: nul(str(fd, "startDate")),
    endDate: nul(str(fd, "endDate")),
    materialBudget: toDb(money(str(fd, "materialBudget"))),
    laborBudget: toDb(money(str(fd, "laborBudget"))),
    percentOfWork: num(str(fd, "percentOfWork")),
  };

  if (id) {
    await db.update(workUnitStages).set(row).where(eq(workUnitStages.id, id));
  } else {
    const existing = await db
      .select({ position: workUnitStages.position })
      .from(workUnitStages)
      .where(eq(workUnitStages.workUnitId, workUnitId));
    const position = existing.reduce((max, s) => Math.max(max, s.position), 0) + 1;
    await db.insert(workUnitStages).values({ workUnitId, position, ...row });
  }

  revalidatePath(`/lucrari/${workUnitId}/executie`);
  revalidatePath(`/lucrari/${workUnitId}`);
}

/**
 * Ștergerea unei etape — permisă doar cât timp nu s-a agățat nimic de ea. §9.11:
 * un cost cu `stage_id` orfan e o gaură într-un raport pe etape.
 */
export async function deleteStage(fd: FormData): Promise<void> {
  await guard("contracte.editeaza", "etapele se administrează de PM sau admin.");
  const id = str(fd, "id");
  const workUnitId = str(fd, "workUnitId");

  const [used] = await db
    .select({ n: raw<string>`count(*)` })
    .from(poLines)
    .where(eq(poLines.stageId, id));
  if (Number(used?.n ?? 0) > 0) {
    throw new Error("Etapa are deja linii de comandă pe ea. Redenumește-o, nu o șterge.");
  }

  await db.delete(workUnitStages).where(eq(workUnitStages.id, id));
  revalidatePath(`/lucrari/${workUnitId}/executie`);
}

/* ═══════════════════ §9.7 Resurse ═══════════════════ */

export async function saveEquipment(fd: FormData): Promise<void> {
  await guard("flota.gestioneaza", "flota se administrează de dispecerul de flotă sau admin.");
  check(validateEquipment(values(fd)));

  const id = str(fd, "id");
  const row = {
    code: str(fd, "code").toUpperCase(),
    name: str(fd, "name"),
    category: str(fd, "category"),
    activities: fd
      .getAll("activities")
      .map((a) => String(a))
      .filter(Boolean),
    firmId: nul(str(fd, "firmId")),
    status: (str(fd, "status") || "disponibil") as "disponibil" | "service" | "indisponibil" | "casat",
    internalHourlyRate: toDb(money(str(fd, "internalHourlyRate"))),
    isRented: str(fd, "isRented") === "1",
    dailyRentCost: toDb(money(str(fd, "dailyRentCost"))),
    hourMeter: num(str(fd, "hourMeter")),
    km: num(str(fd, "km")),
    itpExpiry: nul(str(fd, "itpExpiry")),
    rcaExpiry: nul(str(fd, "rcaExpiry")),
    iscirExpiry: nul(str(fd, "iscirExpiry")),
    // Ambele baze de scadență, ca la §9.7 — pe amândouă calculează `lib/equipment.ts`.
    nextServiceDate: nul(str(fd, "nextServiceDate")),
    nextServiceHours: nul(str(fd, "nextServiceHours")) === null ? null : num(str(fd, "nextServiceHours")),
    accessories: str(fd, "accessories")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
  };

  if (id) await db.update(equipment).set(row).where(eq(equipment.id, id));
  else await db.insert(equipment).values(row);

  revalidatePath("/utilaje");
  if (id) revalidatePath(`/utilaje/${id}`);
}

export async function saveTool(fd: FormData): Promise<void> {
  await guard("stoc.opereaza", "uneltele se administrează de magazie sau achiziții.");
  check(validateTool(values(fd)));

  const id = str(fd, "id");
  const row = {
    code: str(fd, "code").toUpperCase(),
    name: str(fd, "name"),
    category: nul(str(fd, "category")),
    firmId: nul(str(fd, "firmId")),
    status: (str(fd, "status") || "activ") as "activ" | "la_reparatii" | "casat" | "pierdut",
    warehouseId: nul(str(fd, "warehouseId")),
    holderUserId: nul(str(fd, "holderUserId")),
    holderPartnerId: nul(str(fd, "holderPartnerId")),
    purchaseValue: toDb(money(str(fd, "purchaseValue"))),
  };

  if (id) await db.update(tools).set(row).where(eq(tools.id, id));
  else await db.insert(tools).values(row);
  revalidatePath("/unelte");
}

/** Transportul cerut de la birou — coada care azi se umple doar automat (§18). */
export async function createTransport(fd: FormData): Promise<void> {
  const session = await guard("flota.solicita", "transporturile se cer din birou sau de pe șantier.");
  check(validateTransport(values(fd)));

  const code = nextCode("TR", await db.select({ code: transports.code }).from(transports));
  await db.insert(transports).values({
    code,
    kind: str(fd, "kind") as
      | "livrare_material"
      | "transfer_santiere"
      | "retur_magazie"
      | "evacuare_moloz"
      | "transport_utilaj",
    status: "ceruta",
    autoGenerated: false,
    fromText: nul(str(fd, "fromText")),
    toText: nul(str(fd, "toText")),
    fromObjectiveId: nul(str(fd, "fromObjectiveId")),
    toObjectiveId: nul(str(fd, "toObjectiveId")),
    workUnitId: nul(str(fd, "workUnitId")),
    day: str(fd, "day"),
    description: nul(str(fd, "description")),
    cost: toDb(money(str(fd, "cost"))),
    requestedBy: session.id,
  });

  revalidatePath("/transporturi");
}

/* ═══════════════════ §9.8 Stoc și achiziții ═══════════════════ */

export async function saveWarehouse(fd: FormData): Promise<void> {
  await guard("stoc.opereaza", "gestiunile se administrează de magazie sau achiziții.");
  check(validateWarehouse(values(fd)));

  const id = str(fd, "id");
  const kind = str(fd, "kind");
  const row = {
    firmId: str(fd, "firmId"),
    code: str(fd, "code").toUpperCase(),
    name: str(fd, "name"),
    kind: kind as "centrala" | "santier" | "echipa" | "subcontractant" | "consignatie" | "unelte",
    workUnitId: nul(str(fd, "workUnitId")),
    partnerId: nul(str(fd, "partnerId")),
    keeperId: nul(str(fd, "keeperId")),
    // Consignația e prin definiție marfă în custodie: nu se lasă pe seama unei bife uitate.
    isCustody: kind === "consignatie" || str(fd, "isCustody") === "1",
  };

  if (id) await db.update(warehouses).set(row).where(eq(warehouses.id, id));
  else await db.insert(warehouses).values(row);
  revalidatePath("/stoc");
}

/**
 * Canalul B din §16 — comanda făcută de birou pentru o lucrare anume.
 *
 * Analitica e obligatorie **pe linie** de la creare (§9.8). Comanda se naște în `draft`;
 * angajamentul în registru se scrie la lansare, de unde se scria și până acum — nu se
 * deschide o a doua cale către `cost_entries` (regula 1).
 */
export async function createPurchaseOrder(fd: FormData): Promise<void> {
  const session = await guard("achizitii.gestioneaza", "comenzile se fac de achiziții sau PM.");
  check(validatePurchaseOrder(values(fd)));

  const lines: PoLineDraft[] = JSON.parse(str(fd, "lines") || "[]");
  check(validatePoLines(lines));

  const code = nextCode(
    "CMD",
    await db.select({ code: purchaseOrders.code }).from(purchaseOrders),
  );

  const poId = await db.transaction(async (tx) => {
    const [po] = await tx
      .insert(purchaseOrders)
      .values({
        code,
        firmId: str(fd, "firmId"),
        supplierId: nul(str(fd, "supplierId")),
        channel: "lucrare",
        status: "draft",
        deliverToWarehouseId: str(fd, "deliverToWarehouseId"),
        confirmedDeliveryAt: nul(str(fd, "confirmedDeliveryAt")),
        createdBy: session.id,
      })
      .returning({ id: purchaseOrders.id });

    await tx.insert(poLines).values(
      lines.map((l) => ({
        poId: po.id,
        productId: l.productId,
        quantity: String(l.quantity),
        unitPrice: toDb(l.unitPrice),
        value: toDb(Math.round(l.unitPrice * l.quantity)),
        contractId: l.contractId || null,
        componentId: l.componentId || null,
        workUnitId: l.workUnitId || null,
        stageId: l.stageId || null,
      })),
    );

    return po.id;
  });

  revalidatePath("/achizitii");
  redirect(`/achizitii/${poId}`);
}

/* ═══════════════════ §9.9 Documente ═══════════════════ */

export async function createFolder(fd: FormData): Promise<void> {
  const session = await requireSession();
  check(validateFolder(values(fd)));

  await db.insert(fileNodes).values({
    parentId: nul(str(fd, "parentId")),
    kind: "folder",
    name: str(fd, "name"),
    contractId: nul(str(fd, "contractId")),
    objectiveId: nul(str(fd, "objectiveId")),
    workUnitId: nul(str(fd, "workUnitId")),
    createdBy: session.id,
  });

  revalidatePath("/documente");
}

/**
 * Încărcarea unui fișier — o singură bucată, direct în Supabase Storage prin REST
 * (multipart rămâne în §7, ca „ce le spui programatorilor").
 *
 * `file_versions` e append-only: o încărcare peste un fișier existent adaugă versiunea
 * următoare, nu suprascrie nimic.
 */
export async function uploadFile(fd: FormData): Promise<void> {
  const session = await requireSession();

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Niciun fișier de încărcat.");
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Fișier peste 25 MB. Încărcarea în bucăți nu se construiește în prototip.");
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Storage neconfigurat: lipsesc cheile Supabase.");

  const parentId = nul(str(fd, "parentId"));
  const nodeId = nul(str(fd, "nodeId"));
  const name = str(fd, "name") || file.name;
  const storageKey = `documente/${Date.now()}-${crypto.randomUUID()}`;

  const response = await fetch(`${base}/storage/v1/object/fisiere/${storageKey}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: await file.arrayBuffer(),
  });
  if (!response.ok) {
    throw new Error(`Încărcarea a eșuat (${response.status}). Verifică bucket-ul „fisiere".`);
  }

  let targetId = nodeId;
  if (!targetId) {
    const [node] = await db
      .insert(fileNodes)
      .values({
        parentId,
        kind: "file",
        name,
        contractId: nul(str(fd, "contractId")),
        objectiveId: nul(str(fd, "objectiveId")),
        workUnitId: nul(str(fd, "workUnitId")),
        createdBy: session.id,
      })
      .returning({ id: fileNodes.id });
    targetId = node.id;
  }

  const existing = await db
    .select({ version: fileVersions.version })
    .from(fileVersions)
    .where(eq(fileVersions.nodeId, targetId))
    .orderBy(asc(fileVersions.version));
  const version = existing.reduce((max, v) => Math.max(max, v.version), 0) + 1;

  const [created] = await db
    .insert(fileVersions)
    .values({
      nodeId: targetId,
      version,
      storageKey,
      mimeType: file.type || null,
      sizeBytes: file.size,
      phase: nul(str(fd, "phase")),
      uploadedBy: session.id,
    })
    .returning({ id: fileVersions.id });

  await db
    .update(fileNodes)
    .set({ currentVersionId: created.id })
    .where(eq(fileNodes.id, targetId));

  revalidatePath("/documente");
}

/* ═══════════════════ §9.10 Costul introdus manual ═══════════════════ */

/**
 * Factura de la furnizor care nu vine printr-o recepție: chirii, utilități, servicii.
 *
 * Regula 1 din CLAUDE.md, literal: **`recordCost` cu un `documentType` nou**, nu un
 * `insert` paralel. Luna închisă e refuzată de aceeași poartă ca peste tot.
 */
export async function createManualCost(fd: FormData): Promise<void> {
  const session = await guard("cost.realoca", "costul manual se introduce de PM sau admin.");
  check(validateManualCost(values(fd)));

  const documentDate = str(fd, "documentDate");
  const effectDate = str(fd, "effectDate") || documentDate;

  await recordCost({
    firmId: str(fd, "firmId"),
    documentDate,
    effectDate,
    objectiveId: nul(str(fd, "objectiveId")),
    workUnitId: nul(str(fd, "workUnitId")),
    usedContractId: nul(str(fd, "usedContractId")),
    usedComponentId: nul(str(fd, "usedComponentId")),
    chargedContractId: nul(str(fd, "chargedContractId")),
    chargedComponentId: nul(str(fd, "chargedComponentId")),
    splitReason: nul(str(fd, "splitReason")),
    costType: str(fd, "costType") as
      | "material"
      | "manopera"
      | "servicii_subc"
      | "utilaj"
      | "motorina"
      | "transport"
      | "reparatii"
      | "alte",
    // Factura de la furnizor e cheltuială consumată, nu angajament: banii au ieșit.
    stage: "consumat",
    value: money(str(fd, "value")),
    supplierId: nul(str(fd, "supplierId")),
    documentType: "factura_manuala",
    note: nul(str(fd, "note")),
    createdBy: session.id,
  });

  revalidatePath("/cost");
  revalidatePath("/panou");
}
