# Plan de execuție — Modulul „Tichete" (kanban pe contract)

> **Pentru agentul care execută.** Documentul ăsta conține tot ce trebuie. Schema, semnăturile
> acțiunilor, structura fișierelor, regulile de UX. **Nu explora repo-ul.** Citește doar fișierele
> din §0.2 și scrie. Fiecare decizie de design a fost deja luată — dacă ceva pare ambiguu, alege
> varianta descrisă aici, nu inventa a doua.

---

## 0. Cum se execută

### 0.1 Reguli de eficiență (obligatorii)

1. **Nu citi `PLAN.md`, `PROGRESS.md`, `DaminaStructuraCapCoada FInal.md`.** Nimic din ele nu e
   necesar pentru blocul ăsta. Tot ce contează e mai jos.
2. **Nu face `grep` explorator.** Lista completă de fișiere de citit e în §0.2. Citește-le o dată,
   într-un singur batch de tool-uri paralele, apoi scrie.
3. **Scrie fișiere întregi dintr-o dată** (`Write`), nu 15 `Edit`-uri succesive. Excepție:
   fișierele existente (`schema.ts`, `permissions.ts`, `navigation.ts`, `Rail.tsx`), unde faci
   `Edit`-uri chirurgicale.
4. **Nu construi abstracții noi.** Fără `hooks/`, fără `types/`, fără barrel files, fără context
   providers în plus. Componentele UI există deja — refolosește-le (§0.3).
5. **Nu instala dependențe.** Drag & drop se face cu HTML5 nativ (§6.4). `lucide-react` și `clsx`
   sunt deja acolo.
6. **Verifică o singură dată, la final:** `npx tsc --noEmit` apoi `npm run build`. Nu rula build
   după fiecare fișier.
7. **Nu rula `npm run seed`** — șterge toată baza (~150s). Seed-ul de tichete e un script aditiv
   separat (§8).
8. Comentarii în cod: **rare și în română**, doar unde regula de business nu e evidentă. Codul din
   repo e scris așa; nu-l comenta linie cu linie.

### 0.2 Fișierele de citit înainte de a scrie (și numai astea)

| Fișier | De ce |
|---|---|
| `components/ui/primitives.tsx` | `Button`, `Badge`, `PageHeader`, `Toolbar`, `Chip`, `EmptyState`, `Kpi`, `Field`, `Input`, `Select`, `Textarea`, `SectionRule` |
| `components/ui/form.tsx` | `FormModal`, `Field`, `SubmitButton`, `FormErrors` |
| `components/ui/modal.tsx` | `Modal` (regula 4: nu se închide la click în afară) |
| `components/ui/table.tsx` | `Sheet`, `Table`, `TR`, `TD`, `TH`, `THead`, `TBody` |
| `app/(office)/cereri/page.tsx` | tiparul exact de pagină server: `requireSession`, `searchParams`, filtre `SQL[]`, `export const dynamic = "force-dynamic"` |
| `app/actions/requests.ts` | tiparul exact de server action: `"use server"`, `requireSession`, `can(...)`, `revalidatePath` |
| `lib/db/schema.ts` — **doar liniile 1–235 și 608–645** | helperii `id()/money()/qty()/createdAt()`, enum-urile, tabelul `requests` |
| `lib/permissions.ts` | `Capability`, `MATRIX`, `can` |
| `lib/navigation.ts` | `NavIcon`, `NAVIGATION` |
| `lib/pickers.ts` | `Opt`, `contractOptions`, `partnerOptions`, `userOptions` |
| `components/shell/Rail.tsx` — **doar `const ICONS`** | maparea nume → iconiță `lucide-react` |
| `seed/index.ts` — **doar funcția `wipe()`** | ca să adaugi tabelele noi la ștergere |

Atât. **Nu deschide alt fișier** decât dacă TypeScript îți dă o eroare care te trimite acolo.

### 0.3 Ce refolosești, nu rescrii

- Butoane, pastile, antet, toolbar, cîmpuri, modal → `components/ui/*`. **Nu scrie al doilea `Button`.**
- Culorile: clasele Tailwind mapate pe tokeni OKLCH — `bg-sheet`, `bg-sunk`, `text-ink`, `text-ink-2`,
  `text-ink-3`, `border-rule`, `bg-blueprint-soft`, `text-blueprint-ink`, `border-blueprint-line`,
  la fel pentru `fill` (verde), `warn` (galben), `over` (roșu). Radius: `rounded-sheet`, `rounded-ctl`,
  `rounded-chip`. Umbre: `shadow-flat`, `shadow-lift`, `shadow-float`.
  **Nu scrie culori hardcodate** (`#hex`, `bg-blue-500`).
- Tonurile de `Badge`: `"neutral" | "blueprint" | "fill" | "warn" | "over"`. Astea sunt singurele.

### 0.4 Ordinea de execuție

```
1. schema.ts            (§2)   → npm run db:push
2. lib/tickets.ts       (§3)
3. lib/permissions.ts   (§4)
4. app/actions/tickets.ts (§5)
5. components/domain/TicketBoard.tsx + TicketForms.tsx + TicketFilters.tsx + TicketDetail.tsx (§6)
6. app/(office)/tichete/page.tsx + [contractId]/page.tsx (§6.1, §6.2)
7. lib/navigation.ts + Rail.tsx (§7)
8. seed/tickets.ts      (§8)   → rulează-l
9. tsc + build + plimbare în browser (§9)
```

---

## 1. Deciziile luate (nu se renegociază)

| Întrebare | Decizie |
|---|---|
| Tabel nou sau pe ce există? | **Se construiește peste `requests`.** Tichetele sunt `requests.kind = 'tichet'`. Adaug coloane noi (etapă, tip, urgență, subcontractant). `/cereri` rămâne funcțional. |
| Etapele kanban | **Per contract** (`ticket_stages.contract_id`). Adminul poate **importa** setul de etape dintr-un alt contract. |
| Tipurile (electric, sanitar…) | **Nomenclator în DB** (`ticket_types`), creat/editat **doar de admin**. Restul îl aleg dintr-un select. |
| Urgența | **Enum fix** în cod: `scazuta / normala / ridicata / critica`. |
| Navigare | `/tichete` = grilă de **carduri de contract** → click → `/tichete/[contractId]` (contractul e în URL). |
| Documente | **Doar UI** — se salvează metadatele (nume, tip, mărime, autor, dată), **nu fișierul**. Bucketul vine mai târziu. Card-ul de document afișează explicit „fișier neîncărcat". |
| Import din e-mail | **Nu acum.** `requests.source` are deja valoarea `email` — atât. Nu construi nimic pentru el. |

---

## 2. Schema — `lib/db/schema.ts`

### 2.1 Enum-uri noi

Adaugă în blocul de enum-uri (după `orderUrgency`, ~linia 217):

```ts
/** Cât de tare arde tichetul. Ordinea contează — sortarea pe board o folosește. */
export const ticketUrgency = pgEnum("ticket_urgency", ["scazuta", "normala", "ridicata", "critica"]);

/** Ce s-a întâmplat cu tichetul. Dă firul de istoric din panoul de detaliu. */
export const ticketEventKind = pgEnum("ticket_event_kind", [
  "creat",
  "mutat",
  "atribuit",
  "comentariu",
  "document",
  "camp",
]);
```

### 2.2 Tabele noi

Adaugă o secțiune nouă la finalul fișierului, înainte de `notifications`, cu antetul de secțiune în
stilul existent (`/* ═══ N. TICHETE ═══ */`):

```ts
/**
 * Tipurile de tichet (electric, sanitar, construcții…). Nomenclator, nu enum:
 * adminul adaugă unul nou fără să treacă prin cod.
 */
export const ticketTypes = pgTable(
  "ticket_types",
  {
    id: id(),
    name: text("name").notNull(),
    /** ton de Badge: neutral | blueprint | fill | warn | over */
    tone: text("tone").notNull().default("neutral"),
    /** nume de iconiță lucide, opțional — dă recunoaștere din privire pe card */
    icon: text("icon"),
    position: integer("position").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ticket_types_name_uq").on(sql`lower(${t.name})`)],
);

/**
 * Coloanele board-ului. PER CONTRACT — fiecare contract își are fluxul lui.
 * `isFinal` marchează coloanele de ieșire (Rezolvat, Anulat): board-ul le poate ascunde.
 */
export const ticketStages = pgTable(
  "ticket_stages",
  {
    id: id(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    tone: text("tone").notNull().default("neutral"),
    isFinal: boolean("is_final").notNull().default(false),
    /** limită de lucru simultan; null = fără limită. Doar semnal vizual, nu blochează. */
    wipLimit: integer("wip_limit"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ticket_stages_contract_name_uq").on(t.contractId, sql`lower(${t.name})`)],
);

/**
 * Documentele care urmăresc tichetul, indiferent de etapă.
 * NU există fișier: nu e legat niciun bucket. Se rețin doar metadatele — vezi §7 din PLAN.md.
 */
export const ticketDocuments = pgTable("ticket_documents", {
  id: id(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  note: text("note"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: createdAt(),
});

/** Firul de istoric: mutări, atribuiri, comentarii. Se scrie din acțiuni, nu din UI. */
export const ticketEvents = pgTable("ticket_events", {
  id: id(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  kind: ticketEventKind("kind").notNull(),
  fromStageId: uuid("from_stage_id").references(() => ticketStages.id, { onDelete: "set null" }),
  toStageId: uuid("to_stage_id").references(() => ticketStages.id, { onDelete: "set null" }),
  note: text("note"),
  authorId: uuid("author_id").references(() => users.id),
  createdAt: createdAt(),
});
```

### 2.3 Coloane noi pe `requests`

Adaugă în definiția tabelului `requests` (după `requestedBy`, înainte de `createdAt`):

```ts
  /* ── tichete pe board (§ modulul Tichete) ── */
  /** coloana de kanban; null pentru cererile care nu sunt tichete */
  stageId: uuid("stage_id").references(() => ticketStages.id, { onDelete: "set null" }),
  ticketTypeId: uuid("ticket_type_id").references(() => ticketTypes.id, { onDelete: "set null" }),
  urgency: ticketUrgency("urgency").notNull().default("normala"),
  /** subcontractantul căruia i s-a dat tichetul */
  assignedPartnerId: uuid("assigned_partner_id").references(() => partners.id),
  /** responsabilul intern */
  assigneeId: uuid("assignee_id").references(() => users.id),
  dueDate: date("due_date"),
  /** poziția în coloană — mic, se rescrie coloana întreagă la mutare */
  boardOrder: integer("board_order").notNull().default(0),
  /** de când stă în etapa curentă — dă „de 6 zile aici" pe card */
  stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }),
```

> **Atenție la ordinea declarațiilor.** `ticketStages` e definit *după* `requests` în fișier.
> Referințele Drizzle sunt lambda (`() => ticketStages.id`), deci hoisting-ul funcționează —
> nu muta tabelele. Dacă TypeScript se plânge de referință circulară de tipuri, mută definiția
> `ticketTypes` + `ticketStages` **înainte** de `requests` (nu depind de el).

### 2.4 După schemă

```bash
npm run db:push
```

---

## 3. `lib/tickets.ts` — logica pură

Un singur fișier, fără acces la DB (etichete, tonuri, validatori, grupare). Îl folosesc și
acțiunile, și componentele client.

```ts
import type { BadgeTone } from "@/components/ui/primitives"; // dacă nu e exportat, tipează local

export type TicketUrgency = "scazuta" | "normala" | "ridicata" | "critica";

export const URGENCY_ORDER: TicketUrgency[] = ["critica", "ridicata", "normala", "scazuta"];

export const URGENCY_LABELS: Record<TicketUrgency, string> = {
  scazuta: "Scăzută",
  normala: "Normală",
  ridicata: "Ridicată",
  critica: "Critică",
};

export const URGENCY_TONE: Record<TicketUrgency, "neutral" | "blueprint" | "warn" | "over"> = {
  scazuta: "neutral",
  normala: "blueprint",
  ridicata: "warn",
  critica: "over",
};

/** dunga colorată din stânga cardului */
export const URGENCY_BAR: Record<TicketUrgency, string> = {
  scazuta: "bg-rule",
  normala: "bg-blueprint",
  ridicata: "bg-warn",
  critica: "bg-over",
};

export const STAGE_TONES: { value: string; label: string }[] = [
  { value: "neutral", label: "Neutru" },
  { value: "blueprint", label: "Albastru" },
  { value: "fill", label: "Verde" },
  { value: "warn", label: "Galben" },
  { value: "over", label: "Roșu" },
];

/** Setul implicit propus când un contract nu are nicio etapă. */
export const DEFAULT_STAGES = [
  { name: "Primit", tone: "neutral", isFinal: false },
  { name: "În evaluare", tone: "blueprint", isFinal: false },
  { name: "Atribuit", tone: "blueprint", isFinal: false },
  { name: "În lucru", tone: "warn", isFinal: false },
  { name: "Verificare", tone: "warn", isFinal: false },
  { name: "Rezolvat", tone: "fill", isFinal: true },
  { name: "Anulat", tone: "neutral", isFinal: true },
];

export function validateTicket(v: Record<string, string>): Record<string, string> { /* titlu ≥3, contract obligatoriu */ }
export function validateStage(v: Record<string, string>): Record<string, string> { /* nume ≥2 */ }
export function validateTicketType(v: Record<string, string>): Record<string, string> { /* nume ≥2 */ }

/** „de 6 zile în etapa asta" — se afișează doar peste 2 zile, altfel e zgomot. */
export function daysIn(since: Date | string | null): number | null { ... }

/** Codul tichetului: TCK-0042. Se calculează în acțiune, din count. */
export function ticketCode(n: number): string {
  return `TCK-${String(n).padStart(4, "0")}`;
}
```

---

## 4. `lib/permissions.ts`

Adaugă trei capabilități în `Capability`:

```ts
  | "tichete.vezi"
  | "tichete.opereaza"      // creează, mută, atribuie, adaugă documente
  | "tichete.configureaza"  // etape și tipuri — DOAR admin
```

În `MATRIX`:

- `pm`: `"tichete.vezi", "tichete.opereaza"`
- `sef_santier`: `"tichete.vezi", "tichete.opereaza"`
- `devizist`, `achizitii`, `magazie`, `flota`: `"tichete.vezi"`
- `client`: nimic
- `admin`: are deja `"*"` → primește automat și `tichete.configureaza`. **Nu-l lista explicit.**

> `tichete.configureaza` **nu apare în lista niciunui rol în afară de admin (prin `*`)**. Asta e
> tot mecanismul cerut: „doar administratorul poate crea etape noi".
>
> Tichetele **nu au lei** → nu e nevoie de nicio verificare `canSeePrices` în modulul ăsta.
> Nu afișa `estimatedValue` pe board.

---

## 5. `app/actions/tickets.ts`

Un singur fișier. `"use server"` sus. Fiecare funcție: `requireSession()` → `can(...)` → scriere →
`revalidatePath(...)`. Cele apelate din client cu argumente tipate (nu `FormData`) sunt marcate.

```ts
// ── tichete ──
createTicket(data: FormData): Promise<void>
  // câmpuri: contractId, title, description, ticketTypeId, urgency, objectiveId?,
  //          assignedPartnerId?, assigneeId?, dueDate?, source (default "manual")
  // scrie requests{ kind:"tichet", code: ticketCode(n+1), status:"neprocesata",
  //   stageId: prima etapă a contractului (position asc), boardOrder: 0,
  //   stageEnteredAt: now, requestedBy: session.id }
  // + ticketEvents{ kind:"creat" }
  // împinge cu 1 boardOrder-ul celorlalte din coloană (cardul nou intră sus)

updateTicket(data: FormData): Promise<void>       // titlu, descriere, tip, urgență, termen, obiectiv
deleteTicket(ticketId: string): Promise<void>     // doar tichete.configureaza

// ── mutare (apelată din client, argumente tipate) ──
moveTicket(input: {
  ticketId: string;
  toStageId: string;
  /** id-ul cardului înaintea căruia se așază; null = la coadă */
  beforeTicketId: string | null;
}): Promise<void>
  // 1. citește tichetul + etapa țintă (verifică același contract!)
  // 2. rescrie boardOrder pentru TOATE cardurile din coloana țintă (0..n) — coloanele sunt mici
  // 3. dacă stageId s-a schimbat: stageEnteredAt = now + ticketEvents{ kind:"mutat", from, to }
  // 4. revalidatePath(`/tichete/${contractId}`)

assignTicket(input: {
  ticketId: string;
  partnerId: string | null;
  assigneeId: string | null;
}): Promise<void>   // + ticketEvents{ kind:"atribuit" }

addTicketComment(data: FormData): Promise<void>   // ticketEvents{ kind:"comentariu", note }

// ── documente (doar metadate) ──
addTicketDocument(data: FormData): Promise<void>
  // câmpuri: ticketId, name, mimeType, sizeBytes, note
  // + ticketEvents{ kind:"document", note: name }
removeTicketDocument(documentId: string): Promise<void>

// ── configurare (tichete.configureaza = admin) ──
createStage(data: FormData): Promise<void>        // contractId, name, tone, isFinal, wipLimit?
updateStage(data: FormData): Promise<void>
reorderStages(input: { contractId: string; stageIds: string[] }): Promise<void>
deleteStage(input: { stageId: string; moveToStageId: string | null }): Promise<void>
  // NU șterge etapa cu tichete în ea fără destinație: dacă are tichete și moveToStageId e null,
  // ieși fără să faci nimic. UI-ul cere destinația.
importStages(input: { toContractId: string; fromContractId: string }): Promise<void>
  // copiază numele/tonul/poziția/isFinal. Sare peste numele care există deja (case-insensitive).
seedDefaultStages(contractId: string): Promise<void>   // scrie DEFAULT_STAGES

createTicketType(data: FormData): Promise<void>   // name, tone, icon?
updateTicketType(data: FormData): Promise<void>
archiveTicketType(typeId: string): Promise<void>  // active = false; NU delete (tichetele îl referă)
```

**Reguli:**
- Fiecare acțiune care mută/scrie iese tăcut (`return`) dacă `can(...)` e fals — exact ca
  `decideRequest` în `app/actions/requests.ts`.
- `moveTicket` verifică că etapa țintă aparține aceluiași contract ca tichetul. Altfel `return`.
- Fără `try/catch` decorativ. Fără logging.

---

## 6. UI

### 6.1 `/tichete` — alegerea contractului

`app/(office)/tichete/page.tsx`, server component, `export const dynamic = "force-dynamic"`.

- `PageHeader` — titlu „Tichete", eyebrow „Operațional". La dreapta: buton **„Tipuri de tichet"**
  (doar admin, deschide modalul din §6.6).
- O singură interogare: contractele + agregate pe tichete
  (`count(*) filter (where stage.is_final = false)`, `count(*) filter (where urgency in ('ridicata','critica') and is_final = false)`,
  `count(*)` total, `max(requests.created_at)`).
- **Grilă de carduri**: `grid gap-4 sm:grid-cols-2 xl:grid-cols-3`.
  Fiecare card e un `<Link href={/tichete/${c.id}}>` cu:
  - sus: numărul contractului + `Badge` cu tipul de contract; dedesubt numele firmei/clientului, `text-ink-2`
  - în mijloc, trei cifre mari aliniate pe rând (folosește `Kpi` dacă se potrivește, altfel
    `text-2xl font-semibold tabular-nums`): **Deschise · Urgente · Total**
  - „Urgente" e `text-over` când > 0, altfel `text-ink-3`
  - jos: „ultimul tichet acum N zile" sau, dacă contractul nu are etape configurate,
    `Badge tone="warn"` — **„Fără etape"**
  - stil card: `rounded-sheet border border-rule bg-sheet p-4 shadow-flat transition
    hover:border-blueprint-line hover:shadow-lift focus-visible:outline-2 focus-visible:outline-blueprint`
- Câmp de căutare deasupra grilei (client, filtrează pe nume/număr — lista de contracte e mică,
  filtrare în memorie, fără server round-trip).
- `EmptyState` dacă nu există contracte.

### 6.2 `/tichete/[contractId]` — board-ul

`app/(office)/tichete/[contractId]/page.tsx`, server component.

```ts
export default async function Page({
  params, searchParams,
}: {
  params: Promise<{ contractId: string }>;
  searchParams: Promise<{
    q?: string; tip?: string; urgenta?: string; subcontractant?: string;
    responsabil?: string; termen?: string; ale_mele?: string; finale?: string; tichet?: string;
  }>;
})
```

Face **exact 5 interogări, în `Promise.all`**:
1. contractul (+ firma) — `notFound()` dacă lipsește
2. etapele contractului, `order by position`
3. tichetele contractului: `requests` `where kind='tichet' and contract_id=…` + filtrele din URL,
   `leftJoin` pe `ticketTypes`, `partners` (subcontractant), `users` (responsabil), `objectives`;
   `order by boardOrder asc`. **Un singur query pentru tot board-ul**, grupat în memorie pe `stageId`.
4. opțiunile de filtru: tipuri active, subcontractanți (`partnerOptions("subcontractant")`), useri
5. dacă `searchParams.tichet` există: documentele + evenimentele acelui tichet

Structura paginii:

```
PageHeader  eyebrow="Tichete"  title=<numărul contractului>
            ← „Toate contractele" (Link discret spre /tichete, cu ChevronLeft)
            dreapta: [Tichet nou] (primary)  [Etape] (doar admin)  [Tipuri] (doar admin)
Toolbar     filtrele (§6.3)
Board       coloanele (§6.4)
Drawer      panoul de detaliu, dacă ?tichet=<id> (§6.5)
```

Dacă contractul **nu are etape**: `EmptyState` cu titlu „Contractul nu are încă etape", text scurt,
și — doar pentru admin — două butoane: **„Folosește setul implicit"** (`seedDefaultStages`) și
**„Importă din alt contract"** (modalul din §6.6). Pentru non-admin: „Cere-i administratorului să
configureze etapele." Fără board gol cu zero coloane.

### 6.3 Filtre — `components/domain/TicketFilters.tsx` (client)

Toate filtrele trăiesc în URL (`useRouter` + `useSearchParams`), deci sunt shareable și filtrarea
se face pe server. Un singur `Toolbar`:

| Control | Param | Comportament |
|---|---|---|
| Căutare (titlu / cod / descriere) | `q` | input cu iconiță `Search`, **debounce 250 ms**, `router.replace` (nu `push` — nu umple istoricul) |
| Tip | `tip` | `Select` din tipurile active |
| Urgență | `urgenta` | `Select`, ordinea din `URGENCY_ORDER` |
| Subcontractant | `subcontractant` | `Select`; include opțiunea **„Neatribuit"** (`valoare = "none"`) |
| Responsabil | `responsabil` | `Select` din useri + „Neatribuit" |
| Termen | `termen` | `Select`: toate / depășit / azi / 7 zile |
| Doar ale mele | `ale_mele=1` | `Chip` comutabil |
| Arată etapele finale | `finale=1` | `Chip` comutabil, **implicit ascunse** |

Sub toolbar, când există filtre active: un rând de `Chip`-uri cu filtrul aplicat și „×" pentru
fiecare, plus **„Șterge filtrele"** la dreapta. Fără el, utilizatorul se pierde în board filtrat.

Restul e text: „**N tichete** din M" la dreapta toolbar-ului, `text-ink-3 tabular-nums`.

### 6.4 Board-ul — `components/domain/TicketBoard.tsx` (client)

**Layout**

```
<div class="-mx-4 overflow-x-auto px-4 pb-4">
  <div class="flex min-h-[60vh] gap-3">
     {coloane}   // fiecare: w-[300px] shrink-0
  </div>
</div>
```

Coloana:
- antet **sticky** (`sticky top-0 z-10 bg-paper/95 backdrop-blur`), cu: punct colorat (tonul etapei),
  numele etapei, contorul `tabular-nums` într-o pastilă `bg-sunk`, și — dacă `wipLimit` e depășit —
  contorul devine `text-over`
- corp: `rounded-sheet bg-sunk/50 border border-rule p-2 flex flex-col gap-2`
- când se trage un card deasupra: `border-blueprint-line bg-blueprint-soft/40` (tranziție 120 ms)
- coloană goală: text discret centrat, `text-ink-3 text-xs` — „Nimic aici"

Cardul de tichet:
- `<article draggable role="button" tabIndex={0}>`, `rounded-ctl border border-rule bg-sheet p-3
  shadow-flat cursor-grab active:cursor-grabbing hover:shadow-lift hover:border-rule-strong`
- dunga de urgență: `<span class="absolute inset-y-0 left-0 w-[3px] rounded-l-ctl {URGENCY_BAR[u]}" />`
  (cardul e `relative overflow-hidden`)
- rândul 1: codul (`text-[11px] text-ink-3 tabular-nums`) + la dreapta meniul „⋯" (§ mai jos)
- rândul 2: titlul, `text-[0.8125rem] font-medium leading-snug line-clamp-2`
- rândul 3: `Badge` tip (cu tonul tipului) + `Badge` urgență **doar dacă e ridicata/critica**
- rândul 4 (meta, `text-[11px] text-ink-3`, flex, gap-3):
  - subcontractant: iconiță `Building2` + nume scurtat; dacă lipsește → `Neatribuit` în `text-warn`
  - termen: iconiță `CalendarDays` + data; **`text-over` dacă e depășit**
  - documente: iconiță `Paperclip` + număr, doar dacă > 0
  - „de N zile" (din `daysIn(stageEnteredAt)`), doar dacă N ≥ 2
- click pe card → `router.push(?tichet=<id>)`, păstrând filtrele. Enter/Space fac același lucru.

**Drag & drop — HTML5 nativ, fără dependențe**

- `onDragStart`: `e.dataTransfer.setData("text/plain", id)`, `effectAllowed="move"`, marchează
  cardul `opacity-40`.
- `onDragOver` pe coloană și pe card: `e.preventDefault()`; calculează dacă cursorul e în jumătatea
  de sus sau de jos a cardului → afișează o **linie-indicator de 2px `bg-blueprint`** deasupra sau
  dedesubt. Fără linie, mutarea „ghicește" și utilizatorul nu are încredere.
- `onDrop`: calculează `beforeTicketId`, aplică **mutarea optimistă local** (`useState` peste lista
  primită din props), apoi `await moveTicket(...)` și `router.refresh()`. Dacă acțiunea aruncă,
  revii la starea dinainte.
- `onDragEnd`: curăță toate stările de highlight. **Obligatoriu** — altfel rămân coloane colorate.

**Alternativa fără mouse (obligatorie, nu opțională)**

Meniul „⋯" de pe card (buton `Button variant="quiet" size="sm"`, iconiță `MoreHorizontal`) deschide
un popover cu:
- **„Mută în ▸"** — lista etapelor, cea curentă bifată și dezactivată
- „Atribuie…" → deschide detaliul pe secțiunea de atribuire
- „Deschide" → `?tichet=<id>`

Popover-ul se închide la Escape și la click în afară (**e popover, nu modal** — regula 4 din
`CLAUDE.md` vizează modalele cu date nesalvate, iar aici nu sunt).

**Detalii de finisaj care fac diferența**

- `@media (prefers-reduced-motion: reduce)` → fără tranziții pe carduri. Adaugă `motion-reduce:transition-none`.
- Focus vizibil pe card: `focus-visible:outline-2 focus-visible:outline-blueprint focus-visible:outline-offset-2`.
- `aria-label` pe coloană: `"{nume}, {n} tichete"`. Pe card: `"{cod}: {titlu}"`.
- Board-ul e singurul lucru care scrollează orizontal — **pagina nu**. Verifică pe 1280px lățime.
- Nu pune scroll vertical separat pe coloană; lasă pagina să crească. E mai puțin obositor.

### 6.5 Panoul de detaliu — `components/domain/TicketDetail.tsx`

Se randează când `?tichet=<id>` e prezent. **Drawer lateral**, nu modal centrat: `fixed inset-y-0
right-0 w-full max-w-xl bg-sheet border-l border-rule shadow-float z-40`, cu un backdrop
`bg-black/20`. Închiderea: buton „×" și Escape → `router.push` fără `?tichet`. **Backdrop-ul NU
închide** dacă vreun formular din interior are modificări — folosește același tipar ca `Modal`.

Conținut, în ordine:
1. **Antet**: cod + titlu; sub el o linie de meta (etapa curentă ca `Badge` cu tonul ei, tipul,
   urgența, contractul). La dreapta: `Select` de etapă — mutarea din detaliu, nu doar prin drag.
2. **Descriere** — text, cu buton „Editează" care schimbă în `Textarea` + Salvează/Renunț.
3. **Atribuire** — două `Select`-uri (subcontractant, responsabil) + termen (`date`). Se salvează
   la schimbare, fără buton, cu confirmare discretă (textul „Salvat" apare 2 s lângă câmp).
4. **Documente** — lista + zonă de adăugare:
   - `Note` (primitiva existentă) sus, o dată: „Fișierele nu se încarcă încă — se rețin doar
     numele, tipul și mărimea. Bucketul de stocare vine mai târziu."
   - zonă de drop `border-dashed border-rule rounded-ctl p-4 text-center` cu `<input type="file"
     multiple>` ascuns; la selectare citește `file.name / file.type / file.size` și cheamă
     `addTicketDocument` pentru fiecare. **Nu citi conținutul fișierului.**
   - fiecare document: iconiță după `mimeType` (`FileText`, `Image`, `FileSpreadsheet`, `File`),
     nume, mărime formatată (`12,4 kB`), autor, dată, buton „Elimină".
   - documentele sunt legate de tichet, nu de etapă — spune asta o dată în textul zonei goale:
     „Documentele rămân pe tichet indiferent de etapă."
5. **Istoric** — `Trail` (primitiva existentă) cu evenimentele, cel mai nou sus: „Mutat din X în Y —
   Autor · acum 2 ore". Sub el, câmp de comentariu (`Textarea` + „Comentează").

### 6.6 Modalele de configurare — `components/domain/TicketForms.tsx`

Toate cu `FormModal` din `components/ui/form.tsx`. **Nu scrie formular de la zero.**

- **`NewTicketForm`** — `FormModal` cu 2 coloane: Titlu (`full`), Descriere (`textarea`, `full`),
  Tip (`select`), Urgență (`select`), Obiectiv (`select`, opțional), Subcontractant (`select`,
  opțional), Responsabil (`select`, opțional), Termen (`date`, opțional).
  `validate={validateTicket}`. `contractId` — `<input type="hidden">`.
- **`StagesModal`** (admin) — `Modal` propriu, nu `FormModal`, fiindcă e o listă editabilă:
  - lista etapelor, fiecare rând: mâner de reordonare (`GripVertical`, drag pe rând), nume editabil
    inline, `Select` de ton, comutator „etapă finală", câmp WIP, buton „Șterge"
  - la ștergerea unei etape cu tichete: cere destinația într-un rând care apare sub ea
    („Cele 4 tichete se mută în: [select]"), apoi confirmă
  - jos: „+ Adaugă etapă" și, separat, **„Importă dintr-un contract"** → `Select` cu contractele care
    au etape (arată câte: „C-2024-118 — 6 etape") + buton „Importă". După import, mesaj scurt:
    „S-au adăugat 4 etape; 2 existau deja."
  - **Reordonarea salvează la `onDragEnd`**, printr-un singur `reorderStages`.
- **`TicketTypesModal`** (admin) — listă simplă: nume, `Select` de ton, iconiță (text liber, nume
  lucide), „Arhivează". Plus rând de adăugare. Tipurile arhivate apar gri, sub o `SectionRule`
  „Arhivate", și nu se mai oferă în select-uri.

---

## 7. Navigare

`lib/navigation.ts`:
- adaugă `"tichete"` în uniunea `NavIcon`
- în grupul **Operațional**, **imediat după `/cereri`**:
  ```ts
  { href: "/tichete", label: "Tichete", needs: "tichete.vezi", icon: "tichete" },
  ```

`components/shell/Rail.tsx`: în `const ICONS`, `tichete: KanbanSquare` (import din `lucide-react`).

`app/(office)/cereri/page.tsx` — **o singură modificare, 3–5 linii**: pe rândurile cu
`kind === "tichet"` care au `stageId` și `contractId`, codul devine `Link` spre
`/tichete/{contractId}?tichet={id}`. Nimic altceva nu se atinge în `/cereri`.

---

## 8. Seed aditiv — `seed/tickets.ts`

Script separat, **care nu șterge nimic**. Rulare:

```bash
npx tsx --env-file=.env.local seed/tickets.ts
```

Ce scrie (idempotent — sare peste ce există deja):
1. **7 tipuri**: Electric (`warn`), Sanitar (`blueprint`), Construcții (`neutral`), HVAC
   (`blueprint`), Acoperiș (`neutral`), Curățenie (`fill`), Urgențe (`over`).
2. Pentru **fiecare contract**: `DEFAULT_STAGES`, dacă nu are deja etape. La 2 contracte, un set
   diferit (ex. „Sesizare / Deviz / Aprobare client / Execuție / Recepție"), ca funcția de import
   să aibă ce importa și demo-ul să arate că fluxurile diferă.
3. **~8–14 tichete per contract**, distribuite realist: mai multe în primele etape, câteva în cele
   finale, urgențe amestecate (~15% `critica`, 25% `ridicata`), ~60% cu subcontractant atribuit,
   ~40% cu termen (din care câteva depășite, ca să se vadă roșul). Titluri în română, credibile:
   „Tablou electric etaj 2 — siguranță declanșată", „Infiltrație în casa scării", „Robinet spart la
   grupul sanitar bărbați", „Verificare centrală termică — zgomot la pornire".
4. Pentru fiecare tichet: `ticketEvents{ kind: "creat" }` + 1–3 evenimente de mutare cu date
   crescătoare, ca istoricul să nu fie gol. La ~30% dintre tichete, 1–3 rânduri în `ticketDocuments`
   (nume gen `deviz-reparatie.pdf`, `foto-tablou.jpg`, mărimi plauzibile).

`seed/index.ts` — în `wipe()`, adaugă **înaintea** ștergerii lui `requests` (ordinea contează
pentru FK): `ticketEvents`, `ticketDocuments`, apoi după `requests`: `ticketStages`, `ticketTypes`.

---

## 9. Verificare finală

```bash
npx tsc --noEmit
npm run build
```

Ambele trebuie să fie **curate**. Apoi, în browser (`npm run dev`, login `admin@damina.ro`):

| Verifică | Așteptare |
|---|---|
| `/tichete` | grilă de carduri, cifre corecte, căutarea filtrează |
| click pe un card | URL devine `/tichete/<uuid>`, board-ul se încarcă |
| drag un card între coloane | linia-indicator apare, cardul se mută instant, rămâne mutat după F5 |
| meniul „⋯" → Mută în | aceeași mutare, fără mouse-drag |
| filtrele | se reflectă în URL; copiat într-un tab nou, dă același board |
| „Tichet nou" | apare în prima coloană, sus |
| `?tichet=` | drawer-ul se deschide; Escape îl închide; documentele se adaugă și rămân |
| comută perspectiva pe **PM** | butoanele „Etape" și „Tipuri" **dispar**; drag-ul funcționează |
| comută pe **Devizier** | vede board-ul, **nu poate** muta, crea sau atribui |
| comută pe **Șef de șantier** | vede și operează; **nicăieri lei** |
| 1280px lățime | doar board-ul scrollează orizontal, pagina nu |

La final, actualizează `PROGRESS.md`: un rând nou în tabelul din §1 („Tichete — kanban pe contract |
✅ gata") și o intrare de câteva linii în §6, **fapte, nu narațiune**.

---

## 10. Ce NU se construiește în blocul ăsta

- Import din e-mail (vine mai târziu; `requests.source = 'email'` există deja și e destul).
- Upload real de fișiere / bucket de stocare.
- Notificări, SLA, escaladare automată, timere.
- Legarea tichetului de o unitate de lucru sau de registrul de cost. Tichetul e evidență, **nu bani.**
  Dacă un tichet trebuie să devină lucrare, drumul rămâne cel existent — `/cereri` și rutarea.
- Portal pentru subcontractanți (există ca aplicație separată — `CLAUDE.md`).
- Etape globale, șabloane de flux, automatizări între etape.
