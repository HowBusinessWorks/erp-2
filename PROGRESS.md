# Damina ERP (erp-2) — progres

> **Sesiune nouă?** Citește §1 și §2. Atât. Restul e istoric, deschide-l doar când ai o întrebare punctuală.

## Regula de scurtime — se aplică și ție

Fișierul ăsta **nu are voie să treacă de 300 de linii.** Când se apropie, comprimi istoricul vechi
în una-două linii per sesiune și ștergi detaliile care nu mai ajută pe nimeni.

Fiecare intrare: **fapte, nu narațiune.** Ce a intrat, ce s-a stricat, ce a rămas. Fără povești
despre cum ai ajuns acolo. Dacă o observație nu schimbă ce face următoarea sesiune, nu o scrie.

Planul e în `PLAN.md` și e **sursa de adevăr**. Fișierul ăsta spune doar unde am ajuns în el.


---

## 0. Predare — citește asta prima dată pe o mașină nouă

**Repo:** https://github.com/HowBusinessWorks/erp-2 (privat)

```bash
git clone https://github.com/HowBusinessWorks/erp-2.git && cd erp-2
npm install
cp .env.local.example .env.local     # completează valorile, vezi mai jos
npm run db:push                      # împinge schema (idempotent)
npm run seed                         # ~150s; ȘTERGE tot și repopulează
npm run dev                          # http://localhost:3000
```

Login: `admin@damina.ro` / parola din `SEED_PASSWORD`. Contul de admin comută perspectiva
din bara de sus — așa se verifică în 10 secunde că șeful de șantier nu vede prețuri.

**`.env.local` NU e în repo** (e în `.gitignore`, intenționat). Cere-i valorile proprietarului
proiectului sau ia-le din Supabase → Project Settings → Database / API. Sunt patru:
`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SEED_PASSWORD`.

**Atenție la `DATABASE_URL`:** host-ul direct `db.<ref>.supabase.co` e IPv6-only și nu e rutabil
din multe rețele. Folosește pooler-ul — vezi capcana din §5.

**Ordinea de citit:** `CLAUDE.md` (regulile care nu se negociază) → §1 și §2 de mai jos →
secțiunea blocului tău din `PLAN.md` §3 și §5.

**Sursa de adevăr pentru business:** `DaminaStructuraCapCoada FInal.md`. Referințele de tip §4.2,
§13.1, §18.1.4 din cod și din plan trimit acolo. **Nu e în repo** — cere-o separat.

---

## 1. Unde suntem

**Stare:** *fundația e completă și rulează pe Supabase. Panoul PM și interfața de teren merg.*

Pornire: `npm run dev` → http://localhost:3000 · login `admin@damina.ro` / `damina`

| Bloc | Stare |
|---|---|
| Fundație (schemă, seed, design system, shell, auth) | ✅ **gata** — schemă împinsă, seed rulat, verificat în browser |
| A — Banii (contracte, plafoane, obiective, registru de cost, panou PM) | ✅ **gata** — ecranele 1–6, 14, 15 |
| B — Operațional (cereri, rutare, UL, fișe, teren, raport lunar) | ⬜ |
| C — Resurse (utilaje, unelte, transporturi, fișiere, PV) | ⬜ |
| A2 — Deviz, pachete, SL, suplimentări, garanții | ⬜ |
| B2 — Execuția lucrării (Gantt, buget pe etapă, jurnal) | ⬜ |
| C2 — Stoc și achiziții | ⬜ |
| Integrare și lustruire | ⬜ |

Legendă: ⬜ neînceput · 🟨 în lucru · ✅ gata

**Ce există concret:**

- Next.js 16.3.1 · React 19.2 · Tailwind 4 · Drizzle + postgres.js · tsx. `npm install` rulat.
- `lib/db/schema.ts` — **toate cele ~48 de tabele**, cu enum-uri și relații.
- `lib/money.ts` · `lib/permissions.ts` · `lib/session.ts` · `lib/cost-ledger.ts` · `lib/budget.ts` · `lib/navigation.ts`
- Design system „Registru": `app/globals.css` (tokeni OKLCH) + `components/ui/{primitives,table,gauge}.tsx`
- Shell: `components/shell/{Rail,TopBar}.tsx`, `app/(office)/layout.tsx`, login + comutator de perspectivă
- Seed: `seed/{index,operations,run}.ts` — 5 firme, 9 contracte, 124 obiective, 756 unități de lucru, ~1.900 linii de cost, 15 utilaje, PV-uri, SL-uri, comenzi
- Ecrane gata: `/panou` · `/contracte` · `/contracte/[id]` (§4.3) · `/contracte/[id]/ani` (§22.6) ·
  `/obiective` · `/obiective/[id]` (istoric, §5) · `/cost` (dubla analitică, §12) · `/perioade` (§13.1) ·
  `/teren` (schelet)

---

## 2. Ce blochează acum

**Nimic.** Se poate continua cu blocurile A, B, C în paralel.

De clarificat când e momentul, fără să blocheze:

1. **Structura tabelei de linii declarate din portalul de subcontractanți** — dacă vine înainte de
   blocul A2, `sl_lines` se modelează compatibil fără rescriere.
2. **Cifrele reale ale celor 9 contracte** — seed-ul merge pe cifre inventate, dintre care
   contractul `4700` reproduce exact exemplul din §4.3 al documentului de business.

---

## 3. Decizii luate pe parcurs

*Aici intră doar deciziile care se abat de la `PLAN.md` sau completează ceva ce planul nu specifica.*

| Data | Decizie | De ce |
|---|---|---|
| 2026-08-20 | Portalul de subcontractanți **nu se construiește** — există deja ca aplicație separată. Tabelele `packages` / `sl_lines` rămân ca punct de cusătură. | Decizia utilizatorului |
| 2026-08-20 | Se pornește curat în `erp-2`, nu se simplifică DUO-ERP. | Codul de acolo e împletit cu `withActor()` / RLS / pachete. DUO-ERP rămâne referință — `packages/domain` merită recitit la plafoane. |
| 2026-08-20 | **npm**, nu pnpm. | O singură aplicație, fără workspace-uri. Zero configurare. |
| 2026-08-20 | Fișiere pe **Supabase Storage**, nu R2. | Suntem deja pe Supabase; scade cu un serviciu de configurat. |
| 2026-08-20 | Direcția vizuală: **„Registru"** — hârtie caldă, linii de cotă, cifre tabulare, albastru de planșă, teracotă la depășiri, bară de navigație închisă la culoare. | Un ERP cu multe cifre se citește ca un registru, nu ca un dashboard. Diferențiază demo-ul de orice șablon. |
| 2026-08-20 | La Delta, partea **neumplută** a gauge-ului se desenează hașurat, nu gol. | Golul se citește „e bine"; hașura se citește „lipsește". Delta neumplută e venit pierdut. |
| 2026-08-20 | Seed-ul folosește **ținte de umplere per contract**, nu valori aleatorii. | Un gauge la 89% convinge; unul la 3% pentru că baza e goală, nu. |
| 2026-08-20 | Ultimele **două luni rămân deschise** în seed, restul închise. | Fără o lună închisă și una deschisă nu se poate demonstra regula §13.1 de mutare a costurilor. |

---

## 4. Întrebări deschise

*Lucruri pe care o sesiune le-a întâlnit și nu le-a putut decide singură. Regula: nu inventa —
scrie aici și alege varianta cea mai simplă și mai ușor de schimbat.*

| # | Întrebare | Blochează | Stare |
|---|---|---|---|
| D1 | Utilaj și transport în pachetul de subcontractant — intră sau nu? Momentan pachetul e doar manoperă, ca în §8.3. | nimic acum | deschisă |
| D2 | Raportul lunar: șablon per client cu branding, sau unul singur? | ecranul 34 | deschisă |

---

## 5. Capcane cunoscute

*Lucruri care s-au stricat o dată și se pot strica din nou. Scurt, doar simptomul și leacul.*

| Simptom | Leac |
|---|---|
| `TS1127: Invalid character` într-un string cu ghilimele românești | Ghilimelele de închidere „…” ies uneori ASCII. Folosește apostrof simplu pentru stringul din jur. |
| Drizzle refuză un `insert` cu ternar pe o coloană de enum | Ternarul dă `string`. Pune `as "a" \| "b"` pe expresie. |
| Import circular între `seed/index.ts` și `seed/operations.ts` | Punctul de intrare e `seed/run.ts`; `index.ts` nu are efecte secundare. |
| `Top-level await is not supported with the "cjs" output format` la `tsx` | Nu există `"type": "module"`. Pune codul într-un `async function run()` și cheamă-l. |
| `DATABASE_URL lipsește` deși `.env.local` există | În CJS importurile se evaluează înaintea lui `config()`. Rulează cu `tsx --env-file=.env.local`. |
| `ECONNREFUSED` la `db.<ref>.supabase.co` | Host-ul direct e **IPv6-only**. Folosește pooler-ul: `aws-1-eu-west-1.pooler.supabase.com:5432`, user `postgres.<ref>`. |
| Pagină care se încarcă în 15 secunde | N+1 prin pooler. Agregă într-o singură interogare cu `groupBy`, nu una per componentă. Vezi `budgetsForMonth`. |
| Server action folosit ca `form action` refuzat de typecheck | Acțiunile de formular trebuie să întoarcă `Promise<void>`. Nu întoarce `{ error }`. |
| Marjă de 50%+ pe ecran | Plafonul de cost e 75% din venit. Consum la 70% din plafon ⇒ marjă 48%, cifră inexistentă în construcții. Consumul trebuie să stea la 85–105%. |
| Marjă spectaculoasă pe un an cu puține date | Verifică acoperirea (luni cu date / luni scurse). Sub 60% ⇒ afișează „date parțiale", nu un procent. |

---

## 6. Istoric pe sesiuni

### 2026-08-20 — fundația — GATA

**A intrat:**
- Scheletul Next.js 16 + Tailwind 4, `npm install` (5 vulnerabilități, toate în lanțul de dev al
  `drizzle-kit`/esbuild — nu ajung în aplicație).
- Schema completă, ~48 tabele, într-un singur fișier, cu comentarii care trimit la secțiunile din
  documentul de business (§4.2, §11, §12, §13, §18.1.4 etc.).
- Cele 5 fișiere de nucleu din `lib/`. `cost-ledger.ts` implementă și regula §13.1 completă
  (`moveWorkUnitFunding`), cu cele două comportamente după cum luna e închisă sau nu.
- Design system + shell + login + comutator de perspectivă.
- Seed în două părți, cu ținte de umplere per contract.
- `/panou` — primul ecran real.

- Schema împinsă pe Supabase (`drizzle-kit push`), seed rulat: **756 unități de lucru, ~1.900 linii
  de cost**, 124 obiective, 15 utilaje, SL-uri, comenzi, notificări.
- Verificat în browser: login → panou → comutator de perspectivă → teren.

**S-a stricat / reparat:**
- Cinci capcane, toate în §5 de mai sus. Cea mai costisitoare: host-ul direct Supabase e IPv6-only.
- Panoul se încărca în ~15s (N+1). Rescris `budgetsForMonth` ca 5 interogări în lot → **0,7s**.
- Stratul „angajat" era gol la mentenanță; adăugat în seed. Fără el, gauge-ul lui 4700 arăta 87%
  în loc de 95%, adică exact minciuna pe care o previne P6.

### 2026-08-20 — blocul A (banii) — GATA

**A intrat:** `lib/period.ts`, `components/domain/MonthNav.tsx`, plus ecranele 2–6, 14, 15:
lista de contracte cu gauge-uri inline și alertă de expirare · detaliul de contract (aranjamentul
din §4.3, cu marjă lunară și cumulată pe an contractual) · curba de marjă pe 4 ani cu ipoteză de
creștere comutabilă · obiective cu filtre · istoricul obiectivului pe analitica **folosit** ·
registrul de cost cu comutator descărcat/folosit și raportul de reconciliere · închiderea de lună
pe firmă × lună.

**S-a stricat / reparat:**
- Adminul comutat pe „șef de șantier" rămânea **blocat** în interfața de teren, fără drum înapoi.
  Adăugat `backToOffice()`.
- Marje de 50% și 59,5% pe ecran — aritmetică greșită a țintelor din seed. Corectate; banda e
  acum 16,7%–36,5%, cu media 29,3%, ceea ce încadrează exemplul de 33,9% din documentul de business.
- Anul 1 al contractelor arăta 96,8% marjă din 1 lună de date. Adăugată detecția de acoperire:
  sub 60% ⇒ „date parțiale", fără procent.

**Timpi:** `/contracte` 0,6s · `/panou` 1,0s · `/obiective` 1,5s · `/cost` 2,2s.

**Rămâne:** blocurile B (operațional) și C (resurse) — pot porni în paralel, nu se ating de
aceleași tabele. Apoi A2, B2, C2 și integrarea.
