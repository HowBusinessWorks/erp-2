/**
 * Seed aditiv pentru modulul de tichete. NU șterge nimic și se poate rula de mai multe ori:
 * sare peste ce există deja.
 *
 * Rulează: npx tsx --env-file=.env.local seed/tickets.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { asc, eq, sql } from "drizzle-orm";

import { db } from "../lib/db";
import * as s from "../lib/db/schema";
import { DEFAULT_STAGES, ticketCode } from "../lib/tickets";

let seedState = 20260826;
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

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/* ─────────────────────────── date de demo ─────────────────────────── */

const TYPES = [
  { name: "Electric", tone: "warn", icon: "Zap" },
  { name: "Sanitar", tone: "blueprint", icon: "Droplets" },
  { name: "Construcții", tone: "neutral", icon: "Hammer" },
  { name: "HVAC", tone: "blueprint", icon: "Wind" },
  { name: "Acoperiș", tone: "neutral", icon: "Home" },
  { name: "Curățenie", tone: "fill", icon: "Sparkles" },
  { name: "Urgențe", tone: "over", icon: "TriangleAlert" },
];

/** Al doilea flux: două contracte îl primesc, ca importul de etape să aibă ce copia. */
const CLIENT_FLOW = [
  { name: "Sesizare", tone: "neutral", isFinal: false },
  { name: "Deviz", tone: "blueprint", isFinal: false },
  { name: "Aprobare client", tone: "warn", isFinal: false },
  { name: "Execuție", tone: "warn", isFinal: false },
  { name: "Recepție", tone: "fill", isFinal: true },
];

const TITLES = [
  "Tablou electric etaj 2 — siguranță declanșată",
  "Infiltrație în casa scării",
  "Robinet spart la grupul sanitar bărbați",
  "Verificare centrală termică — zgomot la pornire",
  "Corp de iluminat ars pe holul de la parter",
  "Ușă de acces blocată — broască defectă",
  "Coloană de canalizare înfundată la subsol",
  "Tencuială desprinsă pe fațada nordică",
  "Termostat nefuncțional în sala de ședințe",
  "Jgheab desprins pe latura de est",
  "Priză arsă în biroul 214",
  "Pompă de recirculare oprită",
  "Geam spart la casa liftului",
  "Ventiloconvector cu scurgeri de condens",
  "Trapă de fum blocată",
  "Balustradă slăbită pe scara exterioară",
  "Hidrant interior fără presiune",
  "Grup pompare — manometru defect",
  "Pardoseală umflată în arhivă",
  "Panou de comandă fără alimentare",
  "Ventilator de desfumare cu vibrații",
  "Rost de dilatație deteriorat în parcare",
];

const NOTES = [
  "Semnalat de administratorul clădirii, la raportul de dimineață.",
  "Constatat la inspecția lunară. Necesită verificare cu aparat.",
  "Sesizare telefonică de la client. Se cere intervenție rapidă.",
  "Reluare a unei probleme rezolvate parțial luna trecută.",
  "Zona a fost izolată provizoriu până la remediere.",
];

const DOCS = [
  { name: "deviz-reparatie.pdf", mimeType: "application/pdf", sizeBytes: 184_320 },
  { name: "foto-tablou.jpg", mimeType: "image/jpeg", sizeBytes: 1_248_576 },
  { name: "masuratori.xlsx", mimeType: "application/vnd.ms-excel", sizeBytes: 42_112 },
  { name: "proces-verbal-constatare.pdf", mimeType: "application/pdf", sizeBytes: 96_500 },
  { name: "foto-dupa-interventie.jpg", mimeType: "image/jpeg", sizeBytes: 964_300 },
  { name: "oferta-subcontractant.pdf", mimeType: "application/pdf", sizeBytes: 210_944 },
];

const URGENCIES = ["scazuta", "normala", "ridicata", "critica"] as const;
function rollUrgency(): (typeof URGENCIES)[number] {
  const r = rnd();
  if (r < 0.15) return "critica";
  if (r < 0.4) return "ridicata";
  if (r < 0.85) return "normala";
  return "scazuta";
}

/* ─────────────────────────── rulare ─────────────────────────── */

async function main() {
  /* ── tipuri ── */
  const existingTypes = await db.select().from(s.ticketTypes);
  if (existingTypes.length === 0) {
    await db
      .insert(s.ticketTypes)
      .values(TYPES.map((t, i) => ({ ...t, position: i })))
      .onConflictDoNothing();
    console.log(`→ ${TYPES.length} tipuri de tichet`);
  } else {
    console.log("→ tipurile există deja");
  }
  const types = await db.select().from(s.ticketTypes).orderBy(asc(s.ticketTypes.position));

  /* ── context ── */
  const [contracts, allUsers, subcontractors, links] = await Promise.all([
    db.select().from(s.contracts).orderBy(asc(s.contracts.code)),
    db.select().from(s.users).where(eq(s.users.active, true)),
    db
      .select()
      .from(s.partners)
      .where(sql`${s.partners.active} = true and 'subcontractant' = any(${s.partners.types})`),
    db.select().from(s.contractObjectives),
  ]);

  if (contracts.length === 0) {
    console.log("Nu există contracte. Rulează întâi npm run seed.");
    process.exit(0);
  }

  const operators = allUsers.filter((u) => ["admin", "pm", "sef_santier"].includes(u.role));
  const author = operators[0] ?? allUsers[0];

  /* ── etape per contract ── */
  let stagesAdded = 0;
  for (const [i, contract] of contracts.entries()) {
    const existing = await db
      .select()
      .from(s.ticketStages)
      .where(eq(s.ticketStages.contractId, contract.id));
    if (existing.length > 0) continue;

    const flow = i % 5 === 1 || i % 5 === 3 ? CLIENT_FLOW : DEFAULT_STAGES;
    await db
      .insert(s.ticketStages)
      .values(flow.map((st, p) => ({ contractId: contract.id, ...st, position: p })))
      .onConflictDoNothing();
    stagesAdded += flow.length;
  }
  console.log(`→ ${stagesAdded} etape adăugate`);

  /* ── tichete ── */
  const [{ n }] = await db
    .select({ n: sql<string>`count(*)` })
    .from(s.requests)
    .where(eq(s.requests.kind, "tichet"));
  let counter = Number(n);

  let created = 0;
  let adopted = 0;
  for (const contract of contracts) {
    const stages = await db
      .select()
      .from(s.ticketStages)
      .where(eq(s.ticketStages.contractId, contract.id))
      .orderBy(asc(s.ticketStages.position));
    if (stages.length === 0) continue;

    const live = stages.filter((st) => !st.isFinal);
    const finals = stages.filter((st) => st.isFinal);
    const contractObjectives = links.filter((l) => l.contractId === contract.id);

    // Tichetele vechi din /cereri n-au etapă. Intră în prima coloană, nu rămân invizibile.
    const orphans = await db
      .select()
      .from(s.requests)
      .where(
        sql`${s.requests.kind} = 'tichet' and ${s.requests.contractId} = ${contract.id}
            and ${s.requests.stageId} is null`,
      );
    for (const [k, orphan] of orphans.entries()) {
      await db
        .update(s.requests)
        .set({
          stageId: stages[0].id,
          boardOrder: k,
          stageEnteredAt: orphan.createdAt,
          urgency: rollUrgency(),
          ticketTypeId: types.length > 0 ? pick(types).id : null,
          assignedPartnerId:
            subcontractors.length > 0 && chance(0.5) ? pick(subcontractors).id : null,
        })
        .where(eq(s.requests.id, orphan.id));
      await db.insert(s.ticketEvents).values({
        ticketId: orphan.id,
        kind: "creat",
        toStageId: stages[0].id,
        authorId: author?.id ?? null,
        createdAt: orphan.createdAt,
      });
      adopted += 1;
    }

    const [{ have }] = await db
      .select({ have: sql<string>`count(*)` })
      .from(s.requests)
      .where(sql`${s.requests.kind} = 'tichet' and ${s.requests.contractId} = ${contract.id}`);

    const howMany = Math.max(0, int(9, 14) - Number(have));
    const perStage = new Map<string, number>();
    for (const st of stages) perStage.set(st.id, orphans.length);

    for (let k = 0; k < howMany; k += 1) {
      // Mai multe în etapele de început, câteva ieșite pe final — cum arată un board real.
      const toFinal = finals.length > 0 && chance(0.2);
      const stage = toFinal
        ? pick(finals)
        : live[Math.min(live.length - 1, Math.floor(Math.abs(rnd() - rnd()) * live.length))];

      const order = perStage.get(stage.id) ?? 0;
      perStage.set(stage.id, order + 1);

      const createdAt = new Date(Date.now() - int(1, 70) * DAY);
      const enteredAt = new Date(createdAt.getTime() + int(0, 8) * DAY);
      const hasDue = chance(0.4);
      const dueOffset = chance(0.3) ? int(-14, -1) : int(1, 25);

      counter += 1;
      const [ticket] = await db
        .insert(s.requests)
        .values({
          code: ticketCode(counter),
          kind: "tichet",
          source: chance(0.3) ? "email" : chance(0.5) ? "telefon" : "manual",
          title: pick(TITLES),
          description: pick(NOTES),
          firmId: contract.firmId,
          contractId: contract.id,
          objectiveId:
            contractObjectives.length > 0 ? pick(contractObjectives).objectiveId : null,
          stageId: stage.id,
          ticketTypeId: types.length > 0 ? pick(types).id : null,
          urgency: rollUrgency(),
          assignedPartnerId:
            subcontractors.length > 0 && chance(0.6) ? pick(subcontractors).id : null,
          assigneeId: operators.length > 0 && chance(0.7) ? pick(operators).id : null,
          dueDate: hasDue ? ymd(new Date(Date.now() + dueOffset * DAY)) : null,
          boardOrder: order,
          stageEnteredAt: enteredAt,
          requestedBy: author?.id ?? null,
          createdAt,
        })
        .returning();

      /* ── istoric ── */
      const events: (typeof s.ticketEvents.$inferInsert)[] = [
        {
          ticketId: ticket.id,
          kind: "creat",
          toStageId: stages[0].id,
          authorId: author?.id ?? null,
          createdAt,
        },
      ];

      const stageIndex = stages.findIndex((st) => st.id === stage.id);
      let at = createdAt.getTime();
      for (let step = 0; step < Math.min(stageIndex, 3); step += 1) {
        at += int(1, 5) * DAY;
        events.push({
          ticketId: ticket.id,
          kind: "mutat",
          fromStageId: stages[step].id,
          toStageId: stages[step + 1].id,
          authorId: operators.length > 0 ? pick(operators).id : null,
          createdAt: new Date(Math.min(at, Date.now())),
        });
      }
      if (chance(0.35)) {
        at += int(1, 3) * DAY;
        events.push({
          ticketId: ticket.id,
          kind: "comentariu",
          note: pick([
            "Am sunat subcontractantul, vine mâine dimineață.",
            "Materialul e comandat, termen de livrare 3 zile.",
            "Verificat la fața locului — e nevoie de o piesă de schimb.",
            "Clientul cere să se lucreze după program.",
          ]),
          authorId: operators.length > 0 ? pick(operators).id : null,
          createdAt: new Date(Math.min(at, Date.now())),
        });
      }
      await db.insert(s.ticketEvents).values(events);

      /* ── documente, la ~30% dintre tichete ── */
      if (chance(0.3)) {
        const docs = Array.from({ length: int(1, 3) }, () => pick(DOCS));
        const unique = [...new Map(docs.map((d) => [d.name, d])).values()];
        await db.insert(s.ticketDocuments).values(
          unique.map((d) => ({
            ticketId: ticket.id,
            ...d,
            uploadedBy: operators.length > 0 ? pick(operators).id : null,
          })),
        );
      }

      created += 1;
    }
  }

  console.log(`→ ${adopted} tichete vechi mutate pe board`);
  console.log(`→ ${created} tichete create`);
  console.log("gata.");
  process.exit(0);
}

main();
