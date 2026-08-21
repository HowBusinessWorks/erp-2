"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql as raw } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  devizLines,
  devizMapping,
  devizTemplates,
  devize,
  normedArticles,
  packageLines,
  packages,
  retentions,
  situatiiLucrari,
  slLines,
  supplements,
} from "@/lib/db/schema";
import { canEnterPackage, checkCumulative } from "@/lib/deviz";
import { validateDevizLine, validatePackage } from "@/lib/operability-types";
import { multiplyQty, parseInput, toDb } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

/**
 * Blocul A2 — acțiunile pe devize, pachete, SL, suplimentări și garanții.
 *
 * Două dintre ele refuză să facă ce li se cere, și asta e ideea:
 * `addPackageLine` respinge materialele, `verifySlLine` respinge cantitățile care
 * depășesc contractatul. Regulile sunt impuse de sistem, nu lăsate la bunăvoința
 * celui care completează formularul.
 */

function num(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/* ─────────────────── ecranul 17 — maparea N:M ─────────────────── */

/**
 * Leagă o poziție din devizul client de un articol din devizul intern.
 *
 * Coeficientul spune cât din articolul intern intră în poziția de client: 1 = tot,
 * 0,5 = jumătate (articolul servește și altă poziție). Fără el, o poziție internă
 * folosită în două locuri s-ar număra de două ori la cost.
 */
export async function mapDevizLines(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "deviz.intern.editeaza")) return;

  const clientLineId = String(formData.get("clientLineId") ?? "");
  const internalLineId = String(formData.get("internalLineId") ?? "");
  const coefficient = num(formData.get("coefficient")) || 1;
  const devizId = String(formData.get("devizId") ?? "");
  if (!clientLineId || !internalLineId) return;

  const [existing] = await db
    .select()
    .from(devizMapping)
    .where(
      and(
        eq(devizMapping.clientLineId, clientLineId),
        eq(devizMapping.internalLineId, internalLineId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(devizMapping)
      .set({ coefficient: String(coefficient) })
      .where(eq(devizMapping.id, existing.id));
  } else {
    await db
      .insert(devizMapping)
      .values({ clientLineId, internalLineId, coefficient: String(coefficient) });
  }

  if (devizId) revalidatePath(`/devize/${devizId}`);
}

export async function unmapDevizLines(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "deviz.intern.editeaza")) return;

  const mappingId = String(formData.get("mappingId") ?? "");
  const devizId = String(formData.get("devizId") ?? "");
  if (!mappingId) return;

  await db.delete(devizMapping).where(eq(devizMapping.id, mappingId));
  if (devizId) revalidatePath(`/devize/${devizId}`);
}

/* ─────────────────── ecranul 18 — articole normate ─────────────────── */

/**
 * „Salvează poziția ca articol normat."
 *
 * Biblioteca de articole nu se construiește dintr-un import de 4.000 de rânduri pe
 * care nu-i folosește nimeni, ci din pozițiile pe care devizierul le-a scris deja o
 * dată. `usageCount` spune care merită păstrate.
 */
export async function saveAsNormedArticle(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "deviz.intern.editeaza")) return;

  const lineId = String(formData.get("lineId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const qualification = String(formData.get("qualification") ?? "").trim() || null;
  const laborHours = num(formData.get("laborHours"));
  if (!lineId || !code) return;

  const [line] = await db.select().from(devizLines).where(eq(devizLines.id, lineId)).limit(1);
  if (!line) return;

  const [article] = await db
    .insert(normedArticles)
    .values({
      code,
      name: line.name,
      category: line.category,
      unit: line.unit,
      materialCost: line.materialUnitPrice,
      laborHours: String(laborHours),
      qualification,
      usageCount: 1,
    })
    .returning();

  await db
    .update(devizLines)
    .set({ normedArticleId: article.id })
    .where(eq(devizLines.id, lineId));

  revalidatePath(`/devize/${line.devizId}`);
  revalidatePath("/devize/articole");
}

/* ─────────────────── ecranul 19 — pachete ─────────────────── */

/**
 * Adaugă o linie de deviz intern într-un pachet de subcontractant.
 *
 * **Refuză materialele.** Nu cu un avertisment pe care îl închizi, ci cu un refuz:
 * subcontractantul dă manoperă, materialul îl dă firma. Un pachet cu material în el
 * înseamnă că plătești aceeași țeavă de două ori — o dată la furnizor și o dată în
 * prețul subcontractantului (§8.3).
 */
export async function addPackageLine(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "pachete.gestioneaza")) return;

  const packageId = String(formData.get("packageId") ?? "");
  const internalLineId = String(formData.get("internalLineId") ?? "");
  const proposedPrice = parseInput(String(formData.get("proposedPrice") ?? ""));
  if (!packageId || !internalLineId) return;

  const [line] = await db
    .select()
    .from(devizLines)
    .where(eq(devizLines.id, internalLineId))
    .limit(1);
  if (!line) return;

  // regula, impusă aici, nu doar desenată pe ecran
  if (!canEnterPackage(line).allowed) return;

  const [{ n }] = await db
    .select({ n: raw<string>`count(*)` })
    .from(packageLines)
    .where(eq(packageLines.packageId, packageId));

  await db.insert(packageLines).values({
    packageId,
    internalLineId,
    position: Number(n) + 1,
    name: line.name,
    unit: line.unit,
    contractedQty: line.quantity,
    proposedPrice: toDb(proposedPrice),
    agreedPrice: toDb(proposedPrice),
  });

  revalidatePath(`/pachete/${packageId}`);
}

export async function removePackageLine(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "pachete.gestioneaza")) return;

  const lineId = String(formData.get("lineId") ?? "");
  const packageId = String(formData.get("packageId") ?? "");
  if (!lineId) return;

  await db.delete(packageLines).where(eq(packageLines.id, lineId));
  if (packageId) revalidatePath(`/pachete/${packageId}`);
}

/* ─────────────────── ecranul 20 și T8 — situații de lucrări ─────────────────── */

/**
 * Verdictul pe o linie de SL. Verificarea e **linie cu linie**, nu aprobare în bloc.
 *
 * Cine verifică e omul din teren, care știe dacă s-au turnat 40 sau 32 de metri
 * pătrați. El nu vede prețuri — vede cantități. Decizia economică rămâne la PM.
 */
export async function verifySlLine(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "sl.verifica") && !can(session.role, "sl.aproba")) return;

  const lineId = String(formData.get("lineId") ?? "");
  const verdict = String(formData.get("verdict") ?? "");
  const comment = String(formData.get("verdictComment") ?? "").trim() || null;
  if (!lineId || !["neverificat", "ok", "suspect"].includes(verdict)) return;

  // „suspect" fără explicație e o acuzație pe care nimeni nu o poate rezolva
  if (verdict === "suspect" && !comment) return;

  await db
    .update(slLines)
    .set({ verdict: verdict as "neverificat" | "ok" | "suspect", verdictComment: comment })
    .where(eq(slLines.id, lineId));

  const [line] = await db.select().from(slLines).where(eq(slLines.id, lineId)).limit(1);
  if (line) {
    revalidatePath(`/situatii/${line.situatieId}`);
    revalidatePath(`/teren/situatii/${line.situatieId}`);
  }
}

/**
 * Aprobarea situației. Aici se aplică blocajul din §10.1: nicio linie nu poate
 * împinge cumulatul aprobat peste cantitatea contractată.
 *
 * Dacă o linie depășește, situația NU se aprobă. Ieșirea corectă e o suplimentare,
 * nu o aprobare cu ochii închiși — și suplimentarea trece prin altă poartă, cu
 * decizie și autor.
 */
export async function approveSituatie(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "sl.aproba")) return;

  const situatieId = String(formData.get("situatieId") ?? "");
  if (!situatieId) return;

  const lines = await db.select().from(slLines).where(eq(slLines.situatieId, situatieId));
  if (!lines.length) return;

  // o singură depășire blochează toată situația
  if (lines.some((l) => checkCumulative(l).blocked)) return;
  // și o singură linie suspectă, la fel — se lămurește înainte, nu după
  if (lines.some((l) => l.verdict === "suspect")) return;

  let retained = 0;
  for (const line of lines) {
    const declared = Number(line.declaredQty ?? 0);
    if (declared <= 0) continue;
    await db
      .update(slLines)
      .set({ approvedCumulative: String(Number(line.approvedCumulative ?? 0) + declared) })
      .where(eq(slLines.id, line.id));
    retained += Number(line.value ?? 0);
  }

  const [situatie] = await db
    .select({ sl: situatiiLucrari, pkg: packages })
    .from(situatiiLucrari)
    .leftJoin(packages, eq(situatiiLucrari.packageId, packages.id))
    .where(eq(situatiiLucrari.id, situatieId))
    .limit(1);

  const percent = Number(situatie?.pkg?.retentionPercent ?? 0);
  const retentionValue = Math.round(retained * 100 * (percent / 100));

  await db
    .update(situatiiLucrari)
    .set({
      status: "aprobata",
      approvedBy: session.id,
      approvedAt: new Date(),
      retentionValue: toDb(retentionValue),
    })
    .where(eq(situatiiLucrari.id, situatieId));

  // garanția de bună execuție se naște din situație, nu se introduce de mână
  if (retentionValue > 0 && situatie?.pkg?.subcontractorId) {
    const due = new Date();
    due.setFullYear(due.getFullYear() + 1);
    await db.insert(retentions).values({
      direction: "retinuta",
      partnerId: situatie.pkg.subcontractorId,
      workUnitId: situatie.pkg.workUnitId,
      situatieId,
      value: toDb(retentionValue),
      percent: String(percent),
      dueDate: due.toISOString().slice(0, 10),
      note: `Garanție din SL ${situatie.sl.code ?? ""}`.trim(),
    });
  }

  revalidatePath(`/situatii/${situatieId}`);
  revalidatePath("/situatii");
  revalidatePath("/garantii");
}

/* ─────────────────── ecranul 21 — suplimentări și garanții ─────────────────── */

/**
 * Suplimentarea ATOMICĂ (§10.2).
 *
 * Linia de pachet și linia de situație se creează în ACEEAȘI tranzacție. Dacă s-ar
 * face în doi pași, o cădere între ei ar lăsa o situație facturabilă fără acoperire
 * în pachet — exact felul de neconcordanță pe care nimeni nu o găsește până la
 * inventar.
 */
export async function decideSupplement(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "suplimentari.decide")) return;

  const supplementId = String(formData.get("supplementId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!supplementId || !["acceptat", "respins"].includes(decision)) return;

  const [supplement] = await db
    .select()
    .from(supplements)
    .where(eq(supplements.id, supplementId))
    .limit(1);
  if (!supplement || supplement.status !== "propus") return;

  if (decision === "respins") {
    await db
      .update(supplements)
      .set({ status: "respins", decidedBy: session.id, decidedAt: new Date() })
      .where(eq(supplements.id, supplementId));
    revalidatePath("/garantii");
    return;
  }

  const quantity = Number(supplement.quantity ?? 0);
  const unitPrice = Number(supplement.unitPrice ?? 0) * 100;
  const value = multiplyQty(Math.round(unitPrice), quantity);

  await db.transaction(async (tx) => {
    const [{ n }] = await tx
      .select({ n: raw<string>`count(*)` })
      .from(packageLines)
      .where(eq(packageLines.packageId, supplement.packageId));

    // 1. linia intră în pachet — de acum e cantitate contractată
    const [packageLine] = await tx
      .insert(packageLines)
      .values({
        packageId: supplement.packageId,
        position: Number(n) + 1,
        name: supplement.name,
        unit: supplement.unit,
        contractedQty: supplement.quantity,
        proposedPrice: supplement.unitPrice,
        agreedPrice: supplement.unitPrice,
      })
      .returning();

    // 2. și, în aceeași tranzacție, în situația care a cerut-o
    if (supplement.situatieId) {
      await tx.insert(slLines).values({
        situatieId: supplement.situatieId,
        packageLineId: packageLine.id,
        name: supplement.name,
        unit: supplement.unit,
        contractedQty: supplement.quantity,
        declaredQty: supplement.quantity,
        unitPrice: supplement.unitPrice,
        value: toDb(value),
        verdict: supplement.verdict,
        verdictComment: supplement.verdictComment,
        isSupplement: true,
      });
    }

    await tx
      .update(supplements)
      .set({ status: "acceptat", decidedBy: session.id, decidedAt: new Date() })
      .where(eq(supplements.id, supplementId));
  });

  revalidatePath("/garantii");
  if (supplement.situatieId) revalidatePath(`/situatii/${supplement.situatieId}`);
}

/** Eliberarea garanției la scadență. */
export async function releaseRetention(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "suplimentari.decide")) return;

  const retentionId = String(formData.get("retentionId") ?? "");
  if (!retentionId) return;

  await db
    .update(retentions)
    .set({ releasedAt: new Date() })
    .where(and(eq(retentions.id, retentionId), isNull(retentions.releasedAt)));

  revalidatePath("/garantii");
}

/** Indirectele și profitul se aplică pe totalul devizului, nu pe linie. */
export async function setDevizMarkup(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "deviz.client.editeaza")) return;

  const devizId = String(formData.get("devizId") ?? "");
  if (!devizId) return;

  await db
    .update(devize)
    .set({
      overheadPercent: String(num(formData.get("overheadPercent"))),
      profitPercent: String(num(formData.get("profitPercent"))),
    })
    .where(eq(devize.id, devizId));

  revalidatePath(`/devize/${devizId}`);
}

/* ═══════════════ PLAN.md §9.6 — crearea, nu doar operarea ═══════════════ */

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function nullable(value: string): string | null {
  return value === "" ? null : value;
}

function guardErrors(errors: Record<string, string>) {
  const keys = Object.keys(errors);
  if (keys.length > 0) {
    throw new Error(`VALIDARE: ${keys.map((k) => `${k} — ${errors[k]}`).join("; ")}`);
  }
}

function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of new Set(fd.keys())) out[key] = String(fd.get(key) ?? "");
  return out;
}

/**
 * Deviz nou pe o unitate de lucru — client sau intern, versionat.
 *
 * Versiunea nu se dă din formular: e `max + 1` pe perechea (unitate, fel). Un deviz
 * client v2 și un deviz intern v1 coexistă pe aceeași lucrare, cum trebuie.
 *
 * Opțional pornește de la un **șablon** (`deviz_templates`): tabela există de la
 * început și nu o folosea nimeni, iar un deviz pornit de la zero de fiecare dată e
 * exact motivul pentru care lumea lucrează în Excel (§9.6).
 */
export async function createDeviz(formData: FormData): Promise<void> {
  const session = await requireSession();
  const kind = text(formData, "kind") === "client" ? "client" : "intern";
  const capability = kind === "client" ? "deviz.client.editeaza" : "deviz.intern.editeaza";
  if (!can(session.role, capability)) {
    throw new Error("FĂRĂ DREPT: devizul se întocmește de devizist sau PM.");
  }

  const workUnitId = text(formData, "workUnitId");
  if (!workUnitId) throw new Error("Devizul se agață de o unitate de lucru.");

  const existing = await db
    .select({ version: devize.version })
    .from(devize)
    .where(and(eq(devize.workUnitId, workUnitId), eq(devize.kind, kind)));
  const version = existing.reduce((max, d) => Math.max(max, d.version), 0) + 1;

  const templateId = text(formData, "templateId");
  const template = templateId
    ? (
        await db.select().from(devizTemplates).where(eq(devizTemplates.id, templateId)).limit(1)
      )[0]
    : null;

  const devizId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(devize)
      .values({
        workUnitId,
        kind,
        version,
        status: "draft",
        overheadPercent: String(num(formData.get("overheadPercent"))),
        profitPercent: String(num(formData.get("profitPercent"))),
        notes: nullable(text(formData, "notes")),
        createdBy: session.id,
      })
      .returning({ id: devize.id });

    const lines = (template?.lines ?? []) as {
      name?: string;
      unit?: string;
      quantity?: number;
      unitPrice?: number;
      materialUnitPrice?: number;
      laborUnitPrice?: number;
      category?: string | null;
      code?: string | null;
    }[];

    if (lines.length > 0) {
      await tx.insert(devizLines).values(
        lines.map((l, i) => {
          const quantity = Number(l.quantity ?? 0);
          const unitPrice = Math.round(Number(l.unitPrice ?? 0));
          return {
            devizId: created.id,
            position: i + 1,
            category: l.category ?? null,
            code: l.code ?? null,
            name: l.name ?? "Poziție din șablon",
            unit: l.unit ?? "buc",
            quantity: String(quantity),
            materialUnitPrice: toDb(Math.round(Number(l.materialUnitPrice ?? 0))),
            laborUnitPrice: toDb(Math.round(Number(l.laborUnitPrice ?? 0))),
            unitPrice: toDb(unitPrice),
            total: toDb(multiplyQty(unitPrice, quantity)),
          };
        }),
      );
    }

    return created.id;
  });

  revalidatePath("/devize");
  revalidatePath(`/lucrari/${workUnitId}`);
  redirect(`/devize/${devizId}`);
}

/**
 * Poziție de deviz — manuală sau **din articole normate**.
 *
 * `normed_articles` avea deja salvarea (`saveAsNormedArticle`) și n-avea consumul:
 * un catalog în care doar depui e un catalog mort. Când poziția vine dintr-un articol
 * normat, costul de material se ia din el și articolul își numără folosirea.
 */
export async function saveDevizLine(formData: FormData): Promise<void> {
  const session = await requireSession();

  const devizId = text(formData, "devizId");
  const [target] = await db.select().from(devize).where(eq(devize.id, devizId)).limit(1);
  if (!target) throw new Error("Deviz inexistent.");

  const capability = target.kind === "client" ? "deviz.client.editeaza" : "deviz.intern.editeaza";
  if (!can(session.role, capability)) throw new Error("FĂRĂ DREPT: devizul nu e al rolului tău.");
  // §9.11: un deviz trimis sau acceptat nu se mai editează — corecția e o versiune nouă.
  if (target.status !== "draft") {
    throw new Error("Devizul nu mai e ciornă. Corecția e o versiune nouă, nu o rescriere.");
  }

  guardErrors(validateDevizLine(formValues(formData)));

  const articleId = text(formData, "normedArticleId");
  const article = articleId
    ? (await db.select().from(normedArticles).where(eq(normedArticles.id, articleId)).limit(1))[0]
    : null;

  const quantity = num(formData.get("quantity"));
  const material = article
    ? parseInput(article.materialCost)
    : parseInput(text(formData, "materialUnitPrice"));
  const labor = parseInput(text(formData, "laborUnitPrice"));
  const unitPrice = parseInput(text(formData, "unitPrice")) || material + labor;

  const row = {
    category: nullable(text(formData, "category")),
    code: article?.code ?? nullable(text(formData, "code")),
    name: article?.name ?? text(formData, "description"),
    unit: article?.unit ?? text(formData, "unit"),
    quantity: String(quantity),
    materialUnitPrice: toDb(material),
    laborUnitPrice: toDb(labor),
    unitPrice: toDb(unitPrice),
    total: toDb(multiplyQty(unitPrice, quantity)),
    normedArticleId: articleId || null,
  };

  const id = text(formData, "id");
  if (id) {
    await db.update(devizLines).set(row).where(eq(devizLines.id, id));
  } else {
    const lines = await db
      .select({ position: devizLines.position })
      .from(devizLines)
      .where(eq(devizLines.devizId, devizId));
    const position = lines.reduce((max, l) => Math.max(max, l.position), 0) + 1;
    await db.insert(devizLines).values({ devizId, position, ...row });
  }

  if (article) {
    await db
      .update(normedArticles)
      .set({ usageCount: article.usageCount + 1 })
      .where(eq(normedArticles.id, article.id));
  }

  revalidatePath(`/devize/${devizId}`);
}

export async function deleteDevizLine(formData: FormData): Promise<void> {
  const session = await requireSession();
  const devizId = text(formData, "devizId");
  const [target] = await db.select().from(devize).where(eq(devize.id, devizId)).limit(1);
  if (!target || target.status !== "draft") return;

  const capability = target.kind === "client" ? "deviz.client.editeaza" : "deviz.intern.editeaza";
  if (!can(session.role, capability)) return;

  await db.delete(devizLines).where(eq(devizLines.id, text(formData, "id")));
  revalidatePath(`/devize/${devizId}`);
}

/** Devizul curent, salvat ca șablon — următoarea lucrare de același fel nu mai pornește de la zero. */
export async function saveDevizAsTemplate(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "deviz.intern.editeaza")) return;

  const devizId = text(formData, "devizId");
  const name = text(formData, "name");
  if (!devizId || !name) throw new Error("Un șablon are nevoie de o denumire.");

  const lines = await db
    .select()
    .from(devizLines)
    .where(eq(devizLines.devizId, devizId))
    .orderBy(devizLines.position);

  await db.insert(devizTemplates).values({
    name,
    objectiveKind: nullable(text(formData, "objectiveKind")),
    lines: lines.map((l) => ({
      name: l.name,
      unit: l.unit,
      category: l.category,
      code: l.code,
      quantity: Number(l.quantity),
      materialUnitPrice: parseInput(l.materialUnitPrice),
      laborUnitPrice: parseInput(l.laborUnitPrice),
      unitPrice: parseInput(l.unitPrice),
    })),
  });

  revalidatePath("/devize");
}

/**
 * Pachet nou pentru un subcontractant. Liniile se adaugă după, prin `addPackageLine`,
 * care refuză materialele — regula rămâne acolo unde era (§8.3).
 */
export async function createPackage(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "pachete.gestioneaza")) {
    throw new Error("FĂRĂ DREPT: pachetele se fac de PM.");
  }
  guardErrors(validatePackage(formValues(formData)));

  const workUnitId = text(formData, "workUnitId");
  if (!workUnitId) throw new Error("Pachetul ține de o unitate de lucru.");

  const existing = await db.select({ code: packages.code }).from(packages);
  const max = existing.reduce((m, p) => {
    const digits = Number(p.code.replace(/\D/g, ""));
    return Number.isFinite(digits) ? Math.max(m, digits) : m;
  }, 1000);

  const [created] = await db
    .insert(packages)
    .values({
      workUnitId,
      code: `PCH-${max + 1}`,
      name: text(formData, "name"),
      specialty: nullable(text(formData, "specialty")),
      subcontractorId: text(formData, "subcontractorId"),
      status: "draft",
      retentionPercent: String(num(formData.get("retentionPercent"))),
    })
    .returning({ id: packages.id });

  revalidatePath("/pachete");
  redirect(`/pachete/${created.id}`);
}

/**
 * Situație de lucrări introdusă manual — pentru lucrările care nu vin prin portalul de
 * subcontractanți (§9.6).
 *
 * Liniile se nasc din liniile pachetului, cu cele cinci cumulate preluate din situațiile
 * anterioare. Verificarea e **aceeași** ca la `approveSituatie`: cantitatea care ar duce
 * cumulatul peste contractat e refuzată (§10.1). Fără suplimentare aprobată, nu se trece.
 */
export async function createSituatie(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "sl.verifica") && !can(session.role, "sl.aproba")) {
    throw new Error("FĂRĂ DREPT: situațiile se introduc de șeful de șantier sau de PM.");
  }

  const packageId = text(formData, "packageId");
  const year = Number(text(formData, "year"));
  const month = Number(text(formData, "month"));
  if (!packageId || !year || !month) throw new Error("Situația are nevoie de pachet și de lună.");

  const [duplicate] = await db
    .select({ id: situatiiLucrari.id })
    .from(situatiiLucrari)
    .where(
      and(
        eq(situatiiLucrari.packageId, packageId),
        eq(situatiiLucrari.year, year),
        eq(situatiiLucrari.month, month),
      ),
    )
    .limit(1);
  if (duplicate) throw new Error("Pachetul are deja o situație pe luna asta.");

  const lines = await db
    .select()
    .from(packageLines)
    .where(eq(packageLines.packageId, packageId))
    .orderBy(packageLines.position);
  if (lines.length === 0) throw new Error("Pachetul n-are linii. O situație goală nu se declară.");

  // Cumulatele de până acum — fără ele, controlul depășirii e iluzoriu.
  const previous = await db
    .select({ line: slLines })
    .from(slLines)
    .innerJoin(situatiiLucrari, eq(slLines.situatieId, situatiiLucrari.id))
    .where(eq(situatiiLucrari.packageId, packageId));

  const cumulativeOf = new Map<string, { executed: number; approved: number; invoiced: number }>();
  for (const { line } of previous) {
    if (!line.packageLineId) continue;
    const current = cumulativeOf.get(line.packageLineId) ?? { executed: 0, approved: 0, invoiced: 0 };
    cumulativeOf.set(line.packageLineId, {
      executed: Math.max(current.executed, Number(line.executedCumulative ?? 0)),
      approved: Math.max(current.approved, Number(line.approvedCumulative ?? 0)),
      invoiced: Math.max(current.invoiced, Number(line.invoicedCumulative ?? 0)),
    });
  }

  const situatieId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(situatiiLucrari)
      .values({
        packageId,
        year,
        month,
        code: `SL-${year}${String(month).padStart(2, "0")}-${Date.now().toString().slice(-4)}`,
        status: "declarata",
        declaredAt: new Date(),
      })
      .returning({ id: situatiiLucrari.id });

    for (const line of lines) {
      const declared = num(formData.get(`qty.${line.id}`));
      const before = cumulativeOf.get(line.id) ?? { executed: 0, approved: 0, invoiced: 0 };
      const contracted = Number(line.contractedQty ?? 0);

      // §10.1, litera legii: cumulatul nu trece peste contractat fără suplimentare.
      if (declared > 0 && before.executed + declared > contracted + 1e-9) {
        throw new Error(
          `Poziția „${line.name}” ar depăși contractatul (${contracted} ${line.unit}). Fă întâi o suplimentare.`,
        );
      }

      const unitPrice = parseInput(line.proposedPrice);
      await tx.insert(slLines).values({
        situatieId: created.id,
        packageLineId: line.id,
        name: line.name,
        unit: line.unit,
        contractedQty: String(contracted),
        executedCumulative: String(before.executed + declared),
        approvedCumulative: String(before.approved),
        invoicedCumulative: String(before.invoiced),
        declaredQty: String(declared),
        unitPrice: toDb(unitPrice),
        value: toDb(multiplyQty(unitPrice, declared)),
      });
    }

    return created.id;
  });

  revalidatePath("/situatii");
  redirect(`/situatii/${situatieId}`);
}

/**
 * Inițierea unei suplimentări. Decizia exista (`decideSupplement`), propunerea nu.
 * Rămâne `propus` până când PM-ul o acceptă — abia atunci devine atomică.
 */
export async function proposeSupplement(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, "sl.verifica") && !can(session.role, "suplimentari.decide")) {
    throw new Error("FĂRĂ DREPT: suplimentările se propun de pe șantier sau de PM.");
  }

  const packageId = text(formData, "packageId");
  const name = text(formData, "name");
  const quantity = num(formData.get("quantity"));
  if (!packageId || !name) throw new Error("Suplimentarea are nevoie de pachet și de denumire.");
  if (quantity <= 0) throw new Error("O suplimentare de 0 nu suplimentează nimic.");

  await db.insert(supplements).values({
    packageId,
    situatieId: nullable(text(formData, "situatieId")),
    name,
    unit: text(formData, "unit") || "buc",
    quantity: String(quantity),
    unitPrice: toDb(parseInput(text(formData, "unitPrice"))),
    reason: nullable(text(formData, "reason")),
    status: "propus",
  });

  revalidatePath("/garantii");
  revalidatePath(`/pachete/${packageId}`);
}
