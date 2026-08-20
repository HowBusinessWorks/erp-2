# Damina ERP (erp-2) — progres

> **Sesiune nouă?** Citește §1 și §2. Atât. Restul e istoric, deschide-l doar când ai o întrebare punctuală.

## Regula de scurtime — se aplică și ție

Fișierul ăsta **nu are voie să treacă de 300 de linii.** Când se apropie, comprimi istoricul vechi
în una-două linii per sesiune.

Fiecare intrare: **fapte, nu narațiune.** Ce a intrat, ce s-a stricat, ce a rămas. Dacă o
observație nu schimbă ce face următoarea sesiune, nu o scrie.

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

**`.env.local` NU e în repo** (e în `.gitignore`, intenționat). Vezi `.env.local.example` pentru
chei și pentru ce port merge pe fiecare. Două capcane, amândouă în §5: host-ul direct
`db.<ref>.supabase.co` e IPv6-only și nu e rutabil din multe rețele, iar aplicația trebuie să
meargă pe **6543**, nu pe 5432.

**Ordinea de citit:** `CLAUDE.md` (regulile care nu se negociază) → §1 și §2 de mai jos →
secțiunea blocului tău din `PLAN.md` §3 și §5.

**Sursa de adevăr pentru business:** `DaminaStructuraCapCoada FInal.md`. Referințele de tip §4.2,
§13.1, §18.1.4 din cod și din plan trimit acolo. **Nu e în repo** — cere-o separat.

---

## 1. Unde suntem

**Stare:** *toate cele șase blocuri sunt gata și plimbate. Teren → cerere → rutare → lucrare → cost → raport → **factură**, plus flota, stocul și cele 3 canale de achiziție. A început ziua 3.*

Pornire: `npm run dev` → http://localhost:3000 · login `admin@damina.ro` / `damina`

| Bloc | Stare |
|---|---|
| Fundație (schemă, seed, design system, shell, auth) | ✅ **gata** — schemă împinsă, seed rulat, verificat în browser |
| A — Banii (contracte, plafoane, obiective, registru de cost, panou PM) | ✅ **gata** — ecranele 1–6, 14, 15 |
| B — Operațional (cereri, rutare, UL, fișe, teren, raport lunar) | ✅ **gata** — ecranele 7–13, 34, 36, T1–T6 |
| C — Resurse (utilaje, unelte, transporturi, fișiere, PV) | ✅ **gata** — ecranele 26–33, T7 |
| A2 — Deviz, pachete, SL, suplimentări, garanții | ✅ **gata** — ecranele 16–21, T8 |
| B2 — Execuția lucrării (Gantt, buget pe etapă, jurnal) | ✅ **gata** — ecranul 22 |
| C2 — Stoc și achiziții | ✅ **gata** — ecranele 23–25, plimbate în browser |
| Integrare și lustruire | 🟨 **în lucru** — facturi, clopoțel viu, schelete declarate. Rămâne plimbarea pe cele 8 reguli |

Legendă: ⬜ neînceput · 🟨 în lucru · ✅ gata

**Ce există concret:**

- Next.js 16.3.1 · React 19.2 · Tailwind 4 · Drizzle + postgres.js · tsx. `npm install` rulat.
- `lib/db/schema.ts` — **toate cele ~49 de tabele**, cu enum-uri și relații.
- `lib/`: `money` · `permissions` · `session` · `cost-ledger` · `budget` · `navigation` · `period` ·
  `routing` (§7) + `routing-types` (partea pură) · `work-units` (creare + promovare) ·
  `monthly-report` (§20.1) · `equipment` (scadențe pe dată **și** pe ore, imobilizare) · `pv-templates` ·
  `deviz` (materialele nu intră în pachet, cumulatul nu depășește contractatul, trasabilitate) ·
  `execution` (stare de etapă, derivă bani-vs-timp, geometria barelor, verificări de închidere) ·
  `stock` (CMP, disponibil = cantitate − rezervat, NIR, bon de consum, cele 3 canale) ·
  `notifications` (semnalele clopoțelului, calculate la fiecare încărcare) + `notification-types`
  (partea pură) · `invoicing` (abonamentul lunii, TVA, vechimea creanței)
- `app/actions/`: `session` · `periods` · `requests` · `work-units` · `field` · `reports` ·
  `equipment` · `documents` · `deviz` · `stock` · `invoices`
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
  cumulate) · `/garantii` (suplimentare atomică + scadențar) ·
  `/lucrari/[id]/executie` (Gantt pe consum, jurnal, necesar pe etape, închidere) ·
  `/stoc` (disponibil, semnale, transfer, inventar) · `/stoc/consum` (bon de consum, ecranul 23) ·
  `/achizitii` (cele 3 canale, filtrul de 24h) · `/achizitii/[id]` (analitică pe linie, lansare) ·
  `/receptii` (recepție + NIR, ecranul 25) ·
  `/facturi` (emitere din raportul înghețat, vechimea creanței) · `/integrari` (scheletele, §7)
- Ecrane teren: `/teren` (Azi + ＋) · `/teren/[id]` (inspecție sau intervenție) · `/teren/necesar` ·
  `/teren/pontaj` · `/teren/jurnal` · `/teren/constatare` · `/teren/utilaje` (T7) ·
  `/teren/situatii` + `/teren/situatii/[id]` (T8 — cantități, zero lei)

---

## 2. Ce blochează acum

**Nimic.** Baza a revenit (pooler-ul se dezmorțise), iar cele 5 rute din C2 au fost plimbate:
`/stoc`, `/stoc/consum`, `/achizitii`, `/receptii` — toate 200. Primul `/stoc` a dat 500, dar la
a doua cerere a mers: era prima compilare peste un pooler abia trezit, nu o regresie.

**Ce a mai rămas din ziua 3** — singura zonă neterminată din tot planul:

1. **Plimbarea cap-coadă pe cele 8 reguli de la §4 din documentul de business**, cu ochii, în
   aplicație. Punctul explicit din `PLAN.md` §5, ziua 3. Nefăcut.
2. **Date demo acolo unde ecranele arată gol** — de umblat după plimbare, când se vede care sunt.
3. **Lustruire**: aliniere, spațiere, stări goale, stări de încărcare.

`npm run seed` nu s-a rerulat după ce s-au scos notificările statice din seed — nu e nevoie
(clopoțelul nu le mai citește), dar la următorul seed tabela va rămâne goală, cum e intenția.

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
| 2026-08-20 | **Clopoțelul calculează semnalele la fiecare încărcare**, din aceleași interogări din care se desenează ecranele. Tabela `notifications` nu mai e citită și nu mai e seedată. | Un tabel de notificări are nevoie de un job, iar un job care nu rulează face clopoțelul să mintă: „3 situații de aprobat" a doua zi după ce au fost aprobate. Un semnal calculat nu poate fi desincronizat, pentru că nu există un al doilea loc unde e scris. |
| 2026-08-20 | **`lib/notification-types.ts`** — tipurile și etichetele semnalelor, separate de interogări. | Aceeași capcană ca la `routing-types`: `NotificationBell` e componentă de client, iar `lib/notifications.ts` importă `lib/db`. Fără separare, Turbopack pune `postgres` în pachetul de browser și cade **tot shell-ul**, pe toate ecranele. `tsc` trece curat. |
| 2026-08-20 | **Factura se naște din raportul lunar înghețat**, iar acțiunea refuză un raport neînghețat. | §20.1: banii se primesc în baza unui raport. Dacă documentul pe care îl are clientul se mai poate schimba, factura emisă pe el n-are acoperire. |
| 2026-08-20 | **Factura NU trece prin `lib/cost-ledger.ts`.** | Regula 1 spune că fiecare leu de **cost** trece pe acolo. Factura către client e venit; scrisă în `cost_entries` ar strica exact analiza pe care o apără regula. |
| 2026-08-20 | Scheletele au **ecran propriu** (`/integrari`), cu numărul de documente care ar trece azi prin fiecare. | Un prototip care se preface că are e-Factura e mai rău decât unul care n-are: cineva planifică pe o funcție inexistentă. `PLAN.md` §7 e adevărul, dar nu-l citește nimeni în timp ce se uită la ecran. |
| 2026-08-20 | **Materialul devine cost la CONSUM, nu la recepție.** NIR-ul mută marfa în gestiune și recalculează CMP-ul, dar nu scrie nicio linie de cheltuială. | În magazie materialul e activ, nu cheltuială. Dacă ar scrie și NIR-ul, și bonul de consum, `consumedByComponent` (care însumează recepționat + consumat) ar număra aceiași bani de două ori. |
| 2026-08-20 | **`releaseCommitment` în `lib/cost-ledger.ts`** — comanda lansată scrie `angajat`, recepția completă îl șterge. | Un angajament există ca să avertizeze *înainte*. După ce marfa a intrat, el nu mai avertizează, doar umflă componenta. Ștergerea stă în cost-ledger, ca regula 1 să fie adevărată în ambele sensuri: nimeni altcineva nu atinge tabela. |
| 2026-08-20 | Valoarea de pe bonul de consum e la **CMP-ul gestiunii**, nu la prețul ultimei facturi. | Cu trei livrări la trei prețuri, ultima factură ar rescrie retroactiv costul lucrărilor de luna trecută. |
| 2026-08-20 | „Am pe stoc" pe filtrul de 24h (§16) **rezervă**, nu transferă. Comanda trece în `anulata` + `warehouseCoveredFromStock`. | Mutarea fizică are nevoie de transport și de o zi. Rezervarea e ce se poate promite pe loc — și e exact ce înseamnă `disponibil = cantitate − rezervat` (§17). |
| 2026-08-20 | Inventarul scrie o mișcare `inventar` cu diferența, nu doar `UPDATE` pe cantitate. | O cantitate care se schimbă fără document e o cantitate pe care nimeni nu o mai poate explica peste trei luni. |
| 2026-08-20 | **Bara din Gantt arată consumul din buget, nu durata.** Poziția și lățimea vin din date, umplerea din bani. | Un grafic care spune că etapa e la zi, dar tace despre faptul că a mâncat 94% din buget în 40% din durată, te minte politicos. |
| 2026-08-20 | Ecranul 22 e rută proprie (`/lucrari/[id]/executie`), nu al șaselea tab. Tabul „Etape” a rămas, cu link către el. | Tabul răspunde la „ce etape are”, ecranul la „cum merge execuția”. Graficul, jurnalul, necesarul și închiderea nu încap într-un tab fără să-l facă ilizibil. |
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

**Portul 6543, nu 5432.** 5432 e *session mode*: fiecare conexiune ține blocată una pe server, plafon
15, iar Next.js încarcă `lib/db` o dată per graf de module. 6543 e *transaction mode* — conexiunea
se întoarce în bazin după fiecare tranzacție. `DATABASE_URL` pe 6543, `DIRECT_URL` (`db:push`, seed)
pe 5432, fiindcă `drizzle-kit` are nevoie de stare pe sesiune. `lib/db/index.ts` avertizează dacă
cineva pune iar 5432 pe `DATABASE_URL`.

**Nu da rafale de conexiuni către pooler.** 24–30 de cereri simultane l-au făcut pe Supavisor să
răspundă `password authentication failed` pe ambele porturi, cu credențiale corecte. Leacul:
Database → Connection pooling → **Restart pooler**, sau ~15 minute. Baza nu e afectată, doar
pooler-ul. Prima cerere după trezire poate da un 500 izolat — a doua merge.

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

### 2026-08-20 — ziua 3, partea 1: facturi, clopoțel viu, schelete declarate

**Baza a revenit.** Cele 5 rute din C2, neplimbate sesiunea trecută, dau acum 200 pe `admin`:
`/stoc`, `/stoc/consum`, `/achizitii`, `/receptii`. (Primul `/stoc` a dat 500; la a doua cerere,
200 — prima compilare peste un pooler abia trezit.)

**A intrat:**

- `lib/notifications.ts` + `lib/notification-types.ts` — opt familii de semnale calculate din
  date: buget la 80%, Delta neumplută, SL de aprobat, PV rămas deschis, revizie scadentă (pe dată
  **și** pe ore), contract care expiră, stoc sub minim, solicitări de utilaj. Fiecare familie e
  sărită complet dacă rolul n-are dreptul — clopoțelul nu scapă lei către cine nu vede lei.
- `components/shell/NotificationBell.tsx` — popover cu semnalele, grupate pe severitate, fiecare
  cu link către ecranul unde se rezolvă. Fără „marchează ca citit": n-ai ce citi, ai ce rezolva.
  Pe `admin`, cu datele din seed: **12 semnale**.
- `/facturi` (`lib/invoicing.ts`, `app/actions/invoices.ts`) — coada „de facturat" (rapoarte
  înghețate fără factură) cu emitere într-o apăsare, registrul cu stare și e-Factura, și vechimea
  creanței pe patru cupe. Numărul de factură e următorul din serie, per firmă.
- `/integrari` — cele șase cusături din `PLAN.md` §7 care au corespondent în aplicație, fiecare cu
  ce face prototipul azi, ce ar însemna în producție și câte documente ar trece prin ea acum.
- Intrările `/facturi` și `/integrari` au ieșit din starea `stub` în bara de navigație.

**S-a scos:** blocul de notificări statice din `seed/operations.ts` (8 rânduri inventate).

**Verificat:** `tsc`, `eslint`, `next build` (**51 de rute**) curate; cele 7 rute atinse, plimbate
cu sesiune de admin — toate 200.

**Rămâne din ziua 3:** plimbarea pe cele 8 reguli de la §4, date demo unde ecranele arată gol,
lustruirea. Vezi §2.

### 2026-08-20 — blocul C2 (stoc și achiziții) — GATA, plimbat în sesiunea următoare

`lib/stock.ts`, `app/actions/stock.ts`, `releaseCommitment` în `lib/cost-ledger.ts`, ecranele 23–25.

- **23** `/stoc` — coloana centrală e **disponibil** (cantitate − rezervat), nu cantitate; semnale
  epuizat / sub minim / peste maxim; transfer pe rând; inventar cu mișcare scrisă; consignația
  marcată, cu valoarea neraportată. `/stoc/consum` — bon de consum, blocaj peste disponibil, zero
  preț în formular (prețul e CMP-ul).
- **24** `/achizitii` — cele 3 canale ca file separate, fiindcă sunt trei fluxuri, nu trei
  etichete. Canalul C arată ceasul de 24h și două butoane opuse: „acopăr din stoc" (rezervă,
  comanda moare) sau lansarea comenzii. Canalul A propune singur ce a scăzut sub minim, ordonat
  după lead time. `/achizitii/[id]` ține analitica **pe linie**.
- **25** `/receptii` — recepție la prețul de pe factură, CMP recalculat, angajament stins la
  recepția completă, auto-consum unde lucrarea o cere (§22.1).

### 2026-08-20 — B2, A2 și plimbarea pe A+B — GATA (comprimat)

- **B2** `lib/execution.ts` + `/lucrari/[id]/executie`. Două defecte prinse doar pe ecran, nu de
  `tsc`: o etapă încheiată la 98% apărea „Atenție" (ordinea din `stageState` corectată:
  `depasita` → `incheiata` → `atentie`); „fără blocaje deschise ✓" apărea pe o lucrare **fără
  jurnal** — absența notărilor nu e absența blocajelor, verificarea cere acum `hasJournal`.
- **A2** `lib/deviz.ts` + ecranele 16–21 și T8: mapare N:M cu bară de trasabilitate, materialele
  fără buton de adăugare în pachet, aprobare de SL blocată pe depășire, suplimentare atomică,
  scadențar de garanții. T8 cu zero prețuri.
- **Plimbarea pe A+B:** 31 de rute, 4 roluri. Regula 5 ține — 0 apariții de „lei"/„RON" pe cele 7
  ecrane de teren; `sef_santier` → 307 spre `/teren` pe tot biroul.

**Cele două accidente care se repetă și de care merită să-ți amintești:**
1. `RoutingForm.tsx` (client) importa din `lib/routing.ts` → `lib/db` → `postgres`. **Tot blocul B
   dădea 500**, cu `tsc` curat. De aici vin `lib/routing-types.ts` și `lib/notification-types.ts`.
2. Ghilimelele `„…"` închise cu `"` drept **închid atributul JSX**. `„` se închide cu `”`.

### 2026-08-20 — blocul C (resurse) — GATA (comprimat)

`lib/equipment.ts` (scadențe pe dată **și** pe ore, imobilizare), `lib/pv-templates.ts`,
`SignaturePad`, ecranele 26–33 și T7: registru + Gantt de flotă, dosar de utilaj cu 7 file,
solicitări, PV cu semnătură pe canvas și tipar A4, unelte, transporturi, arbore de documente,
șabloane cu câmpuri poziționate procentual. Regula 1 ține — motorina, reparațiile și orele trec
prin `recordCost`. Regula 5 ține — 0 apariții de „lei" pe T7. Cele 10 intrări de navigație fără
ecran nu mai dau 404: se văd, marcate „urmează". 14 rute plimbate pe `admin`, `flota`,
`sef_santier`.

### 2026-08-20 — fundația, blocul A și blocul B — GATA (comprimat)

Next.js 16 + Tailwind 4, schema completă într-un fișier, nucleul din `lib/`, design system, shell,
login, comutator de perspectivă, seed în două părți. Apoi ecranele 2–6, 14, 15 (banii) și 7–13,
34, 36, T1–T6 (operațional): rutarea din §7 pe cifre, backlogul Delta, UL cu 5 tab-uri, mutarea
finanțării, raportul lunar, toată interfața de teren.

Reparate atunci: panoul se încărca în 15s (N+1) → 0,7s după ce `budgetsForMonth` a devenit 5
interogări în lot; stratul „angajat" lipsea la mentenanță (gauge-ul lui 4700 arăta 87% în loc de
95%); adminul comutat pe „șef de șantier" rămânea blocat în teren; marjele din seed sunt acum
16,7%–36,5% cu media 29,3%, ceea ce încadrează exemplul de 33,9% din documentul de business.
