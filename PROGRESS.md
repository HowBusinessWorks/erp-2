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

**Stare:** *fundația, banii, operaționalul și resursele merg cap-coadă. Teren → cerere → rutare → lucrare → cost → raport, plus flota cu PV și registrul de cost al utilajelor.*

Pornire: `npm run dev` → http://localhost:3000 · login `admin@damina.ro` / `damina`

| Bloc | Stare |
|---|---|
| Fundație (schemă, seed, design system, shell, auth) | ✅ **gata** — schemă împinsă, seed rulat, verificat în browser |
| A — Banii (contracte, plafoane, obiective, registru de cost, panou PM) | ✅ **gata** — ecranele 1–6, 14, 15 |
| B — Operațional (cereri, rutare, UL, fișe, teren, raport lunar) | ✅ **gata** — ecranele 7–13, 34, 36, T1–T6 |
| C — Resurse (utilaje, unelte, transporturi, fișiere, PV) | ✅ **gata** — ecranele 26–33, T7 |
| A2 — Deviz, pachete, SL, suplimentări, garanții | ✅ **gata** — ecranele 16–21, T8 |
| B2 — Execuția lucrării (Gantt, buget pe etapă, jurnal) | ⬜ |
| C2 — Stoc și achiziții | ⬜ |
| Integrare și lustruire | ⬜ |

Legendă: ⬜ neînceput · 🟨 în lucru · ✅ gata

**Ce există concret:**

- Next.js 16.3.1 · React 19.2 · Tailwind 4 · Drizzle + postgres.js · tsx. `npm install` rulat.
- `lib/db/schema.ts` — **toate cele ~49 de tabele**, cu enum-uri și relații.
- `lib/`: `money` · `permissions` · `session` · `cost-ledger` · `budget` · `navigation` · `period` ·
  `routing` (§7) + `routing-types` (partea pură) · `work-units` (creare + promovare) ·
  `monthly-report` (§20.1) · `equipment` (scadențe pe dată **și** pe ore, imobilizare) · `pv-templates` ·
  `deviz` (materialele nu intră în pachet, cumulatul nu depășește contractatul, trasabilitate)
- `app/actions/`: `session` · `periods` · `requests` · `work-units` · `field` · `reports` ·
  `equipment` · `documents` · `deviz`
- Design system „Registru": `app/globals.css` (tokeni OKLCH) + `components/ui/{primitives,table,gauge,modal,tabs}.tsx`
- Shell: `components/shell/{Rail,TopBar}.tsx`, `app/(office)/layout.tsx`, login + comutator de perspectivă
- Seed: `seed/{index,operations,run}.ts` — 5 firme, 9 contracte, 124 obiective, 756 unități de lucru,
  1.671 linii de cost, 1.400 puncte de checklist, 467 ponturi, 129 însemnări de jurnal, 15 utilaje, SL-uri, comenzi
- Ecrane birou: `/panou` · `/contracte` · `/contracte/[id]` (§4.3) · `/contracte/[id]/ani` (§22.6) ·
  `/obiective` · `/obiective/[id]` (§5) · `/cost` (dubla analitică, §12) · `/perioade` (§13.1) ·
  `/cereri` · `/cereri/[id]` (rutarea din §7) · `/backlog` (Delta) · `/lucrari` · `/lucrari/[id]`
  (5 tab-uri + mutarea finanțării) · `/realocari` (§13.1) · `/rapoarte` (§20.1) · `/rapoarte/inspectii` (§22.2) ·
  `/utilaje` (registru + Gantt + decalare în masă + PV deschise) · `/utilaje/[id]` (7 file) ·
  `/utilaje/solicitari` (§18.1.2) · `/pv/[id]` (2 etape, semnătură, A4) · `/unelte` · `/transporturi` ·
  `/documente` (arbore) · `/documente/sabloane` (câmpuri procentuale, ecranul 33) ·
  `/devize` + `/devize/[id]` (client / intern / mapare N:M cu bară de trasabilitate) ·
  `/devize/articole` · `/pachete` + `/pachete/[id]` · `/situatii` + `/situatii/[id]` (cele 5
  cumulate) · `/garantii` (suplimentare atomică + scadențar)
- Ecrane teren: `/teren` (Azi + ＋) · `/teren/[id]` (inspecție sau intervenție) · `/teren/necesar` ·
  `/teren/pontaj` · `/teren/jurnal` · `/teren/constatare` · `/teren/utilaje` (T7) ·
  `/teren/situatii` + `/teren/situatii/[id]` (T8 — cantități, zero lei)

---

## 2. Ce blochează acum

**Nimic.** B2 (execuția lucrării, ecranul 22) și C2 (stoc și achiziții, 23–25) pot porni în paralel.

Plimbarea prin browser s-a făcut pe A, B și C — 31 + 14 rute, pe patru roluri. Vezi §6.

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
| 2026-08-20 | **Regula „materialele nu intră în pachet" e impusă în `addPackageLine`**, nu doar desenată pe ecran. Liniile de material nu au buton de adăugare. | Un avertisment pe care îl închizi nu e o regulă. Un pachet cu material în el înseamnă că plătești aceeași țeavă de două ori — o dată la furnizor, o dată în prețul subcontractantului (§8.3). |
| 2026-08-20 | **`approveSituatie` refuză** dacă vreo linie ar depăși contractatul sau e marcată suspect. | Blocajul la introducere înseamnă că discuția e cu omul care tocmai a scris cifra. La factură, ai deja o lună de întârziere (§10.1). |
| 2026-08-20 | **Garanția se naște din situația aprobată**, în aceeași acțiune, cu scadență la 1 an. | O tabelă de garanții completată de mână se desincronizează de situații în prima lună. |
| 2026-08-20 | `formatShort` se importă direct în componentele de client, nu se pasează ca prop. | Funcțiile nu trec granița server/client. `lib/money.ts` e pur, deci se poate importa de ambele părți. A costat un 500 pe `/devize/[id]?fila=mapare`. |
| 2026-08-20 | **`lib/routing-types.ts`** — tipurile și etichetele rutării, separate de interogări. | `RoutingForm.tsx` e componentă de client și importa din `lib/routing.ts`, care importă `lib/db`. Turbopack încerca să pună `postgres` în pachetul de browser și **tot blocul B dădea 500**. `tsc` trecea curat — se vedea doar deschizând ecranul. |
| 2026-08-20 | **Solicitarea de utilaj din teren e o `request` cu `kind=solicitare_utilaj`**, nu o tabelă nouă. Sursa e `manual` (enumerarea nu are `teren`). | Cererea de utilaj e o cerere ca oricare alta: are autor, dată, decizie și devine planificare. O tabelă proprie ar fi însemnat al doilea inbox. |
| 2026-08-20 | **Orele de utilaj intră în registrul de cost la închiderea PV-ului**, din diferența celor două citiri de contor, la rata internă. | E singurul moment în care știi sigur câte ore a lucrat. Un pontaj de utilaj separat ar fi fost o a doua sursă de adevăr pentru același număr. |
| 2026-08-20 | **Tipar prin `@media print` + `data-print="hide"`**, nu un layout separat pentru PV. | PV-ul trebuie să rămână în shell-ul aplicației: are nevoie de sesiune, de navigație și de acțiunile de semnare. Un al doilea layout ar fi dublat autentificarea. |
| 2026-08-20 | Intrările de navigație fără ecran se **afișează, dar nu sunt linkuri** — poartă eticheta „urmează". | Câmpul `stub` exista în `NavItem` și nu era folosit nicăieri: 10 intrări din bară dădeau 404. Un link mort e mai rău decât unul care spune că vine. |
| 2026-08-20 | **Tabelă nouă `site_journal_entries`** pentru jurnalul de șantier (T6). | Ecranul e cerut în `PLAN.md` §3, dar jurnalul nu era în §2 și nu încape în nicio tabelă existentă fără să o deformeze. Nu produce bani ⇒ nu trece prin registrul de cost. |
| 2026-08-20 | **Necesarul de material din teren (T4) e un `purchase_orders` draft fără furnizor**, cu `warehouse_check_until` la +24h. `supplier_id` a devenit nullable. | E exact intrarea canalului C din §16: necesar → filtrul de 24h la magazie → PO. O tabelă nouă de „necesar" ar fi fost aceeași tabelă cu alt nume. |
| 2026-08-20 | Modalul deduce singur starea „modificat", ascultând `input`/`change` din interior. | Altfel fiecare ecran și-ar fi ținut propriul `useState` pentru regula 4 și s-ar fi uitat de ea într-un loc. |
| 2026-08-20 | Tab-urile din ecranul 11 sunt pe URL, nu pe stare locală. | Un tab se poate da mai departe ca link și paginile rămân componente de server — fiecare tab își aduce doar datele lui. |
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
| D2 | Raportul lunar: șablon per client cu branding, sau unul singur? | ecranul 34 | deschisă — momentan unul singur, pe ecran; export PDF nu există încă |
| D6 | Blocajul din §10.1 (cumulat > contractat) **nu are caz vizibil în seed** — toate liniile au rest pozitiv. Ecranul îl implementează, dar la demo nu se vede. | demo | deschisă — de forțat o linie în seed |
| D4 | Operațiunile din seed se aleg fără să se uite la tipul obiectivului: „Înlocuire gresie deteriorată" pe o gură de canal, „Montaj schelă" pe o gură de canal, „Reabilitare fațadă" pe un rezervor. | nimic acum | deschisă — de filtrat pe `objectives.kind` la lustruire; un om din construcții vede din prima |
| D5 | `reallocations` are 0 rânduri, deci `/realocari` — ecranul obligatoriu din §13.1 — e gol la demo. `pv_documents` la fel, gol. | demo | deschisă — de generat câteva în seed |
| D3 | Ponturile din seed nu produc linii de cost (costul e generat cu ținte per componentă, ca marja să iasă în bandă). Pe fluxul viu, orele produc cost prin `recordCost`. De aliniat dacă cineva compară orele cu manopera. | nimic acum | deschisă |

---

## 5. Capcane cunoscute

**Pooler-ul Supabase are 15 conexiuni.** Cu `next dev` pornit de câteva ore, scripturile
`tsx` separate primesc `EMAXCONNSESSION: max clients reached in session mode`. Nu e o eroare de
cod — se repornește serverul de dev sau se iau datele din aplicație, prin `curl`.


*Lucruri care s-au stricat o dată și se pot strica din nou. Scurt, doar simptomul și leacul.*

| Simptom | Leac |
|---|---|
| `TS1382: Unexpected token` într-un atribut JSX (`meta="…"`, `hint="…"`) | Ghilimeaua românească de închidere s-a scris `"` drept, care închide atributul. `„` se închide cu `”`. A rupt două ecrane în blocul A2. |
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

### 2026-08-20 — blocul A2 (deviz, pachete, SL, garanții) — GATA

**A intrat:** `lib/deviz.ts`, `app/actions/deviz.ts`, plus ecranele 16–21 și T8.

- **16 + 17** `/devize/[id]` cu trei file: client, intern, **mapare N:M**. Bara de trasabilitate
  arată cât din ofertă are cost calculat și cât din cost a intrat în pachete; partea nemapată e
  hașurată cu roșu, nu lăsată goală.
- **18** `/devize/articole` — biblioteca, ordonată după numărul de folosiri.
- **19** `/pachete` + `/pachete/[id]` — materialele **nu au buton de adăugare**, cu motivul scris
  lângă fiecare.
- **20** `/situatii/[id]` — cele cinci cumulate, una lângă alta; aprobarea e blocată dacă vreo
  linie depășește contractatul sau e suspectă, cu motivul scris deasupra butonului.
- **21** `/garantii` — suplimentare atomică (pachet + SL în aceeași tranzacție) și scadențar pe
  patru găleți.
- **T8** `/teren/situatii` — două butoane cât o falangă, „Nu e așa" cere motiv. **Zero prețuri.**

**S-a stricat / reparat:**
- `/devize/[id]?fila=mapare` dădea 500: pasam `formatShort` ca prop către o componentă de client.
  Funcțiile nu trec granița server/client.
- Ghilimelele românești `„…"` închise cu `"` drept **închid atributul JSX**. A rupt două ecrane;
  reparat în 13 fișiere printr-o trecere cu regex. `„` se închide cu `”`, nu cu `"`.

**Verificat:** `tsc` curat · `eslint` curat pe fișierele blocului · `next build` trece cu toate
cele 40 de rute · 10 rute noi plimbate pe `admin` și `sef_santier` · **0 apariții de „lei" pe T8**.


### 2026-08-20 — plimbarea prin browser pe A și B — GATA

**S-a stricat / reparat:**
- **Tot blocul B dădea 500.** `/cereri/[id]`, `/backlog`, `/lucrari`, `/lucrari/[id]`, `/rapoarte`,
  `/rapoarte/inspectii`. O singură cauză: `RoutingForm.tsx` (client) importa din `lib/routing.ts`,
  care importă `lib/db` → `postgres` → `fs`/`net`/`tls`/`perf_hooks`. După prima eroare de
  rezolvare, **orice** pagină cerută dădea 500 (`application-code: 7ms` — pagina nici nu rula).
  Reparat prin `lib/routing-types.ts`. `tsc --noEmit` trecea curat înainte și după.

**Verificat, nu presupus:** 31 de rute pe 4 roluri. Regula 5 ține — **0 apariții** de „lei"/„RON"
pe cele 7 ecrane de teren. `sef_santier` → 307 spre `/teren` pe toate ecranele de birou.

### 2026-08-20 — blocul C (resurse) — GATA

**A intrat:** `lib/equipment.ts` (scadențe pe dată **și** pe ore, imobilizare, intervale),
`lib/pv-templates.ts`, `app/actions/equipment.ts`, `app/actions/documents.ts`,
`components/domain/SignaturePad.tsx`, plus ecranele 26–33 și T7:

- **26** `/utilaje` — registru + calendar Gantt pe 3 săptămâni + decalare în masă + PV deschise.
- **27** `/utilaje/[id]` — dosar cu 7 file: Detalii / Accesorii / Motorină / Reparații /
  Planificări / PV / Poze. Lei / oră la reparații, ca să se compare utilajele între ele.
- **28** `/utilaje/solicitari` — biroul alege bucata concretă; utilajele ocupate se văd marcate,
  nu dispar din listă.
- **29** `/pv/[id]` — un document, două etape, semnătură pe canvas, tipar A4.
- **30** `/unelte` · **31** `/transporturi` · **32** `/documente` · **33** `/documente/sabloane`
  (câmpuri poziționate procentual, clic pe foaie ca să le așezi).
- **T7** `/teren/utilaje` — doar ce am pe șantier, contor și zile rămase. Cerere și observație
  în două atingeri.

**Reguli respectate, verificat pe ecran:**
- Regula 1 — motorina, reparațiile și orele de utilaj trec prin `recordCost`. Zero `insert` în
  `cost_entries`.
- Regula 5 — **0 apariții** de „lei"/„RON" pe cele 3 stări ale lui T7.
- Utilajul imobilizat nu produce cost de exploatare la închiderea PV-ului.

**Bară de navigație:** cele 10 intrări fără ecran nu mai dau 404 — se văd, marcate „urmează".

**Verificat:** `tsc --noEmit` curat · `eslint` curat pe fișierele blocului C · `next build` trece
cu toate cele 30 de rute · 14 rute noi plimbate pe `admin`, `flota` și `sef_santier`.


### 2026-08-20 — fundația — GATA

Next.js 16 + Tailwind 4, schema completă (~48 tabele într-un fișier), cele 5 fișiere de nucleu din
`lib/`, design system, shell, login, comutator de perspectivă, seed în două părți. Schema împinsă,
seed rulat. Reparat pe parcurs: panoul se încărca în 15s (N+1) → 0,7s după ce `budgetsForMonth` a
devenit 5 interogări în lot; stratul „angajat” lipsea la mentenanță, fără el gauge-ul lui 4700
arăta 87% în loc de 95%.

### 2026-08-20 — blocul A (banii) — GATA

`lib/period.ts`, `MonthNav`, ecranele 2–6, 14, 15. Reparat: adminul comutat pe „șef de șantier”
rămânea blocat în teren (adăugat `backToOffice()`); marjele din seed erau greșite, banda e acum
16,7%–36,5% cu media 29,3%, ceea ce încadrează exemplul de 33,9% din documentul de business.

### 2026-08-20 — blocul B (operațional) — GATA

Ecranele 7–13, 34, 36 și T1–T6: rutarea din §7 cu cele 3 ramuri calculate pe cifre, backlogul
Delta, unitățile de lucru cu 5 tab-uri, mutarea finanțării, raportul lunar, acoperirea
inspecțiilor, plus toată interfața de teren.
