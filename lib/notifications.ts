/**
 * Clopoțelul — semnale calculate din date, nu rânduri scrise de cineva.
 *
 * Un tabel de notificări trebuie umplut de un job, iar un job care nu rulează lasă
 * clopoțelul să mintă: arată „3 situații de aprobat" a doua zi după ce au fost
 * aprobate. Aici semnalele se recalculează la fiecare încărcare de pagină, din
 * aceleași interogări din care se desenează ecranele. Nu pot fi desincronizate,
 * pentru că nu există un al doilea loc unde să fie scrise.
 *
 * Tabela `notifications` rămâne în schemă pentru mesajele *trimise* de un om către
 * altul (nu există încă un ecran care le scrie). Clopoțelul nu o citește.
 *
 * Cele șase familii cerute în PLAN.md §5, ziua 3:
 *   buget la 80% · Delta neumplută · SL de aprobat · PV rămas deschis ·
 *   revizie scadentă (pe dată SAU pe ore) · contract care expiră
 * plus două care ies gratis din aceleași tabele: stoc sub minim, solicitări de utilaj.
 */

import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { budgetsForMonth } from "./budget";
import { db } from "./db";
import {
  contracts,
  equipment,
  products,
  pvDocuments,
  requests,
  situatiiLucrari,
  stock,
  warehouses,
} from "./db/schema";
import { equipmentAlerts, today } from "./equipment";
import { formatShort } from "./money";
import { can, type Role } from "./permissions";
import { stockSignal } from "./stock";

import { SEVERITY_ORDER, type Signal } from "./notification-types";

export type { Severity, Signal, SignalKind } from "./notification-types";
export { SIGNAL_LABEL } from "./notification-types";

/** o lună are ~30,44 de zile; pentru un prag de 6 luni, precizia e mai mult decât suficientă */
function monthsUntil(date: string, from: string): number {
  const a = Date.parse(date + "T00:00:00Z");
  const b = Date.parse(from + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return Infinity;
  return (a - b) / (86_400_000 * 30.44);
}

/**
 * Semnalele vizibile pentru un rol. Fiecare familie e sărită complet dacă rolul
 * n-are dreptul s-o vadă — șeful de șantier nu primește un clopoțel cu lei în el.
 */
export async function liveSignals(role: Role, firmId: string | null): Promise<Signal[]> {
  const now = new Date();
  const day = today();
  const out: Signal[] = [];

  const seesMoney = can(role, "cost.vezi");
  const seesFleet = can(role, "flota.gestioneaza");
  const seesStock = can(role, "stoc.vezi");

  const jobs: Promise<void>[] = [];

  if (seesMoney) jobs.push(budgetSignals(now, firmId, out));
  if (can(role, "sl.aproba")) jobs.push(slSignals(out));
  if (seesFleet) jobs.push(fleetSignals(day, out));
  if (seesMoney) jobs.push(contractSignals(day, firmId, out));
  if (seesStock) jobs.push(stockSignals(firmId, out));

  await Promise.all(jobs);

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

async function budgetSignals(now: Date, firmId: string | null, out: Signal[]) {
  const ids = firmId
    ? (await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.firmId, firmId))).map(
        (c) => c.id,
      )
    : undefined;
  if (ids && ids.length === 0) return;

  const budgets = await budgetsForMonth(now.getFullYear(), now.getMonth() + 1, ids);
  const codes = new Map(
    (await db.select({ id: contracts.id, code: contracts.code }).from(contracts)).map((c) => [
      c.id,
      c.code,
    ]),
  );

  for (const b of budgets.values()) {
    const code = codes.get(b.contractId) ?? "—";
    for (const v of b.views) {
      if (v.direction === "umple") {
        // Delta: venit pierdut fără cost. Se pierde tăcut dacă nu-l spune nimeni.
        if (v.unfilled && v.unfilled > 0 && v.cap > 0) {
          out.push({
            kind: "delta_neumpluta",
            title: `Delta ${code} — ${formatShort(v.unfilled)} lei neumpluți`,
            body: `Plafonul lunii e umplut ${Math.round(v.percent)}%. Delta nu se reportează.`,
            href: "/backlog",
            severity: v.percent < 60 ? "critic" : "atentie",
          });
        }
        continue;
      }
      if (v.cap > 0 && v.percent >= 80) {
        out.push({
          kind: "buget_80",
          title: `${v.name} ${code} — ${Math.round(v.percent)}% din plafon`,
          body: v.over
            ? `Depășit cu ${formatShort(-v.remaining)} lei.`
            : `Au mai rămas ${formatShort(v.remaining)} lei din plafonul lunii.`,
          href: `/contracte/${b.contractId}`,
          severity: v.over ? "critic" : "atentie",
        });
      }
    }
  }
}

async function slSignals(out: Signal[]) {
  const rows = await db
    .select({ id: situatiiLucrari.id, status: situatiiLucrari.status })
    .from(situatiiLucrari)
    .where(inArray(situatiiLucrari.status, ["declarata", "verificata"]));

  const verified = rows.filter((r) => r.status === "verificata").length;
  const declared = rows.length - verified;

  if (verified > 0) {
    out.push({
      kind: "sl_de_aprobat",
      title: `${verified} ${verified === 1 ? "situație verificată așteaptă" : "situații verificate așteaptă"} aprobarea`,
      body: "Verificarea din teren e făcută. Rămâne semnătura care le face facturabile.",
      href: "/situatii?stare=verificata",
      severity: "atentie",
    });
  }
  if (declared > 0) {
    out.push({
      kind: "sl_de_aprobat",
      title: `${declared} ${declared === 1 ? "situație declarată" : "situații declarate"} fără verificare`,
      body: "Nimeni n-a confirmat încă în teren cantitățile declarate.",
      href: "/situatii?stare=declarata",
      severity: "info",
    });
  }
}

async function fleetSignals(day: string, out: Signal[]) {
  const [fleet, openPv] = await Promise.all([
    db.select().from(equipment),
    db
      .select({ id: pvDocuments.id, code: pvDocuments.code })
      .from(pvDocuments)
      .where(and(ne(pvDocuments.status, "semnat"), isNull(pvDocuments.signedAt))),
  ]);

  const due: { code: string; name: string; label: string; expired: boolean; detail: string }[] = [];
  for (const eq of fleet) {
    for (const a of equipmentAlerts(eq, day)) {
      if (a.kind !== "revizie_data" && a.kind !== "revizie_ore") continue;
      due.push({
        code: eq.code,
        name: eq.name,
        label: a.label,
        expired: a.severity === "expirat",
        detail:
          a.hours != null
            ? a.hours < 0
              ? `depășit cu ${-a.hours} ore`
              : `${a.hours} ore rămase`
            : a.days != null && a.days < 0
              ? `depășită cu ${-a.days} zile`
              : `în ${a.days} zile`,
      });
    }
  }

  if (due.length > 0) {
    const expired = due.filter((d) => d.expired);
    const first = expired[0] ?? due[0];
    out.push({
      kind: "revizie_scadenta",
      title:
        due.length === 1
          ? `${first.code} — ${first.label.toLowerCase()}, ${first.detail}`
          : `${due.length} utilaje cu revizia scadentă`,
      body:
        due.length === 1
          ? first.name
          : `${expired.length} deja depășite. Revizia se numără și în ore, nu doar în zile.`,
      href: "/utilaje",
      severity: expired.length > 0 ? "critic" : "atentie",
    });
  }

  if (openPv.length > 0) {
    out.push({
      kind: "pv_deschis",
      title: `${openPv.length} ${openPv.length === 1 ? "PV rămas deschis" : "PV-uri rămase deschise"}`,
      body: "Un PV nesemnat înseamnă un utilaj a cărui predare nu o poate dovedi nimeni.",
      href: "/documente",
      severity: openPv.length > 3 ? "atentie" : "info",
    });
  }

  const pending = await db
    .select({ id: requests.id })
    .from(requests)
    .where(and(eq(requests.kind, "solicitare_utilaj"), eq(requests.status, "neprocesata")));

  if (pending.length > 0) {
    out.push({
      kind: "solicitare_utilaj",
      title: `${pending.length} ${pending.length === 1 ? "solicitare de utilaj" : "solicitări de utilaj"} în așteptare`,
      body: "Fiecare zi de așteptare e o zi de echipă care stă.",
      href: "/utilaje/solicitari",
      severity: "atentie",
    });
  }
}

async function contractSignals(day: string, firmId: string | null, out: Signal[]) {
  const rows = await db
    .select()
    .from(contracts)
    .where(firmId ? eq(contracts.firmId, firmId) : undefined);

  for (const c of rows) {
    const months = monthsUntil(c.endDate, day);
    if (months > c.expiryAlertMonths) continue;
    out.push({
      kind: "contract_expira",
      title:
        months < 0
          ? `Contract ${c.code} — expirat de ${Math.abs(Math.round(months))} luni`
          : `Contract ${c.code} expiră în ${Math.max(0, Math.round(months))} luni`,
      body: `${c.name}. Pragul de alertă e ${c.expiryAlertMonths} luni — timpul de renegociere, nu de constatare.`,
      href: `/contracte/${c.id}`,
      severity: months < 0 ? "critic" : months < c.expiryAlertMonths / 2 ? "atentie" : "info",
    });
  }
}

async function stockSignals(firmId: string | null, out: Signal[]) {
  const rows = await db
    .select({
      quantity: stock.quantity,
      reserved: stock.reserved,
      minStock: products.minStock,
      maxStock: products.maxStock,
      name: products.name,
    })
    .from(stock)
    .innerJoin(products, eq(stock.productId, products.id))
    .innerJoin(warehouses, eq(stock.warehouseId, warehouses.id))
    .where(firmId ? eq(warehouses.firmId, firmId) : undefined);

  let below = 0;
  let empty = 0;
  let firstName = "";
  for (const r of rows) {
    const signal = stockSignal(r.quantity, r.reserved, r.minStock, r.maxStock);
    if (signal === "epuizat") empty += 1;
    else if (signal === "sub_minim") below += 1;
    else continue;
    if (!firstName) firstName = r.name;
  }

  const total = below + empty;
  if (total === 0) return;

  out.push({
    kind: "stoc_minim",
    title:
      total === 1
        ? `${firstName} — ${empty ? "epuizat" : "sub stocul minim"}`
        : `${total} articole sub stocul minim`,
    body: empty > 0 ? `${empty} dintre ele sunt pe zero disponibil.` : undefined,
    href: "/stoc?semnal=sub_minim",
    severity: empty > 0 ? "critic" : "atentie",
  });
}
