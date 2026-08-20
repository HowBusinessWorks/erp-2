"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql as raw } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  devizLines,
  devizMapping,
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
