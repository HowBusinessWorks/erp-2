# Damina ERP (erp-2) — progres

> **Sesiune nouă?** Citește §1 și §2. Atât. Restul e istoric, deschide-l doar când ai o întrebare punctuală.

## Regula de scurtime — se aplică și ție

Fișierul ăsta **nu are voie să treacă de 600 de linii.** Când se apropie, comprimi istoricul vechi
în una-două linii per sesiune.

Fiecare intrare: **fapte, nu narațiune.** Dacă o observație nu schimbă ce face următoarea
sesiune, nu o scrie. Planul e în `PLAN.md` și e **sursa de adevăr**. Fișierul ăsta spune doar unde am ajuns în el.


---

## 0. Predare — citește asta prima dată pe o mașină nouă

**Repo:** https://github.com/HowBusinessWorks/erp-2 (privat)

```bash
git clone https://github.com/HowBusinessWorks/erp-2.git && cd erp-2
npm install
cp .env.local.example .env.local     # completează valorile
npm run db:push                      # împinge schema (idempotent)
npm run seed                         # ~150s; ȘTERGE tot și repopulează
npm run dev                          # http://localhost:3000
```

Login: `admin@damina.ro` / parola din `SEED_PASSWORD`. Contul de admin comută perspectiva din bara
de sus — așa se verifică în 10 secunde că șeful de șantier nu vede prețuri.

`.env.local` **nu e în repo**, intenționat. Două capcane, amândouă în §5: host-ul direct
`db.<ref>.supabase.co` e IPv6-only și nu e rutabil din multe rețele, iar aplicația trebuie să meargă
pe **6543**, nu pe 5432.

**Ordinea de citit:** `CLAUDE.md` → §1 și §2 de mai jos → secțiunea blocului tău din `PLAN.md` §3 și
§5. **Sursa de adevăr pentru business:** `DaminaStructuraCapCoada FInal.md`, în rădăcina repo-ului —
referințele de tip §4.2, §13.1, §18.1.4 din cod și din plan trimit acolo.

---

## 1. Unde suntem

**Stare:** *toate cele șase blocuri sunt gata și plimbate. Teren → cerere → rutare → lucrare → cost → raport → **factură**, plus flota, stocul și cele 3 canale de achiziție. A început ziua 3.*

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
| E — Operabilitate (introducerea datelor) | ✅ **gata** — ecranul 37 + §9.2–§9.10. Rămâne plimbarea cap-coadă a contractului nou |
| Aplicația de teren (3 tab-uri) + concedii | ✅ **gata ca și cod** — `tsc` și `build` curate. **Neplimbată în browser** |
| Redesign birou (sistemul vizual din `erp-mockup.html`) | ✅ **gata** — tokens, primitive, tabel, rail cu icoane, bară de sus cu Ctrl+K, temă și densitate. Componentele noi (`Kpi`, `Toolbar`, `Note`, `Pipeline`, `Trail`, `DetailHeader`) există, dar **nu sunt încă adoptate în pagini** |
| F — Teren, funcțiile din mockup-ul v3 (mentenanță, timp, lucrare pe file, comenzi, acte) | ✅ **gata ca și cod** — 15 rute noi, `tsc` și `build` curate. **Neplimbată în browser**, `db:push` de rulat |
| Inspecții — catalog de puncte, liste moștenite, lună de raportare | ✅ **gata ca și cod** — `tsc` și `build` curate. **`db:push` de rulat**, apoi seed și plimbare |
| Tichete — kanban pe contract (`/tichete`) | ✅ **gata** — schemă, acțiuni, board, filtre, drawer, etape/tipuri de admin, seed aditiv. `tsc` și `build` curate; grilă, board, drawer și mutarea plimbate în browser |

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
- Ecrane birou (48 de rute): panou · contracte (+ ani, + `/contracte/nou`) · obiective · cost
  (dubla analitică) · perioade · cereri + rutare · backlog · lucrări (5 file + execuție) ·
  realocări · rapoarte (+ inspecții) · utilaje (registru, Gantt, solicitări, PV) · unelte ·
  transporturi · documente (+ șabloane) · devize (client/intern, mapare N:M) · pachete ·
  situații · garanții · stoc (+ consum) · achiziții · recepții · facturi · integrări · concedii ·
  nomenclatoare.
- **Aplicația de teren — 3 tab-uri (Azi · Locuri · Eu)**, limbaj vizual propriu în
  `app/(field)/teren/field.css` (clase cu prefix `f-`), `components/domain/{FieldUI,FieldKit,FieldIcons,FieldTabs,LeaveWizard}.tsx`,
  date în `lib/field.ts`:
  - Azi: `/teren` (checklist al zilei + următoarea acțiune) · `/teren/notificari` ·
    `/teren/cereri` + `/teren/cereri/[id]` (fir cronologic peste PO și request)
  - Locuri: `/teren/locuri` + `/teren/locuri/[id]` (meniul locului) · `/teren/[id]` ·
    `/teren/jurnal` · `/teren/necesar` · `/teren/constatare` · `/teren/inventar` ·
    `/teren/consum` (bon de consum) · `/teren/utilaje` (T7) · `/teren/situatii` + `[id]` (T8)
  - Eu: `/teren/eu` · `/teren/pontaj` · `/teren/concediu` + `/teren/concediu/nou` (wizard 3 pași)

---

## 2. Ce blochează acum

**Un singur lucru:** `npm run db:push` **nu a fost rulat** după blocul F. Până rulează, ecranele
noi de teren dau eroare pe coloanele și tabelele care nu există încă (`subcontractor_attendance`,
`media_slots`, coloanele noi de pe `work_units` și `purchase_orders`). `tsc` și `build` trec curat.

**Ce a mai rămas, în ordine:**

1. **`npm run db:push`**, apoi plimbarea blocului F în browser: inspecție cu „nu am rezolvat pe
   loc" → intervenția născută din ea → fir → finalizare.
2. **Verificarea blocului E, în browser:** un contract nou dus cap-coadă până la factură, fără să
   atingi seed-ul (`PLAN.md` §9.12). Codul compilează, drumul nu s-a plimbat.
3. **Plimbarea cap-coadă pe cele 8 reguli de la §4 din documentul de business.** Nefăcută.
4. **Stocarea fișierelor pe Cloudflare R2.** `media_slots` există și se umple, dar `storage_key`
   rămâne gol: interfața de poze, filmări și semnături e gata, legătura cu R2 nu. Separat, la birou
   `uploadFile` încă merge pe Supabase Storage și are nevoie de bucket-ul `fisiere`.
5. **Lustruire**: aliniere, spațiere, stări goale, stări de încărcare.

De clarificat când e momentul, fără să blocheze:

1. **Structura tabelei de linii declarate din portalul de subcontractanți** — `sl_lines` se
   modelează compatibil fără rescriere.
2. **Cifrele reale ale celor 9 contracte** — seed-ul merge pe cifre inventate, dintre care
   contractul `4700` reproduce exact exemplul din §4.3 al documentului de business.

## 3. Decizii luate pe parcurs

*Aici intră doar deciziile care se abat de la `PLAN.md` sau completează ceva ce planul nu specifica.*

| Data | Decizie | De ce |
|---|---|---|
| 2026-08-24 | Din mockup-urile noi (`santierappv3.html`, `santierappmockup.html`) se iau **doar funcțiile**, nu designul Material 3. `v3` e canonic unde diferă. | Decizia utilizatorului. Două limbaje vizuale în aceeași aplicație de teren ar fi însemnat două seturi de componente de întreținut, pentru zero funcționalitate în plus. |
| 2026-08-24 | **Inspecția și intervenția au ecrane separate.** Inspecția se închide într-o trimitere; intervenția stă deschisă și primește ore, materiale și însemnări pe parcurs. | Un singur ecran pentru amândouă ar fi însemnat ori o inspecție care nu se închide, ori o intervenție care nu poate fi completată a doua zi. Sunt două ritmuri de lucru, nu două forme ale aceluiași lucru. |
| 2026-08-24 | Firul de lucru al intervenției se **împletește la citire** din `site_journal_entries`, `timesheets` și `intervention_details`. Nicio tabelă de mesaje. | Evenimentele există deja în cele trei tabele. O a patra, care le-ar copia ca să le pună în ordine, ar fi al doilea adevăr despre aceeași zi de lucru. |
| 2026-08-24 | Intervenția născută dintr-o inspecție se creează **în același apel** cu fișa, prin `source_unit_id`. | Așa regula „fiecare NOK are o ieșire" chiar ține: urmarea nu depinde de faptul că își amintește cineva să o creeze mai târziu. |
| 2026-08-24 | **Tabelă nouă `subcontractor_attendance`** pentru pontajul firmelor. Nu produce cost. | `timesheets` e pe OM — o firmă care vine cu unsprezece oameni nu încape acolo. Manopera subcontractantului intră prin situația de lucrări, nu prin pontaj; ce ținem aici e ore-om, singura cifră cu care se poate contrazice situația la sfârșit de lună. |
| 2026-08-24 | Pontajul de firme **rescrie ziua**, nu adaugă la ea. | Șeful care corectează la ora 16 „au fost 9, nu 11" trebuie să schimbe cifra, nu să o dubleze. |
| 2026-08-24 | **Tabelă nouă `media_slots`** — poze și filmări declarate, `storage_key` gol până la R2. | „6 poze la ÎNAINTE" trebuie să fie o cifră reală, nu una desenată în interfață. Rândul există din clipa apăsării; conținutul vine când se leagă stocarea. |
| 2026-08-24 | Fișierele de teren merg pe **Cloudflare R2**, nu pe Supabase Storage. Deocamdată doar interfața. | Decizia utilizatorului. Anulează, pentru teren, rândul de mai jos din 2026-08-20. |
| 2026-08-24 | Treptele unei comenzi se **derivă din status**, fără tabelă de istoric. | Un jurnal de tranziții ar fi a doua sursă de adevăr pentru același lucru și s-ar desincroniza la prima recepție parțială făcută manual. |
| 2026-08-24 | Semnătura de pe teren scrie în **`pv_documents.signatureImage`**, același câmp folosit de semnarea prin link tokenizat. | Un al doilea mecanism de semnat, doar pentru că omul e pe telefon, ar da două răspunsuri diferite la întrebarea „cine a semnat". |
| 2026-08-24 | Filele lucrării (`?f=jurnal\|echipa\|depozit\|acte`) sunt **linkuri**, nu stare de client. | Ca și la ecranul 11: o filă se dă mai departe ca link, iar paginile rămân componente de server, fiecare filă aducând doar datele ei. |
| 2026-08-21 | Un „loc" din teren e un **obiectiv**, nu o unitate de lucru. | Omul spune „sunt la Bloc A2", nu „sunt pe UL-2411". Pe obiectiv se adună lucrarea, inspecțiile, intervențiile, inventarul și actele — altfel aceleași ecrane s-ar cere de cinci ori, cu alt filtru de fiecare dată. |
| 2026-08-21 | Terenul are **CSS propriu** (`field.css`, clase `f-`), nu clasele Tailwind din birou. | Biroul se citește ca un registru; terenul se apasă cu mănuși, în soare, cu o mână. Prefixul `f-` garantează că foaia nu atinge niciun ecran de birou, deși CSS-ul e global odată încărcat. |
| 2026-08-21 | `workingDays` se **îngheață la depunere** pe cererea de concediu. | Sărbătorile legale se schimbă de la an la an. O cerere aprobată în 2026 nu are voie să-și schimbe numărul de zile fiindcă cineva a corectat lista în 2028. |
| 2026-08-21 | Concediile **nu trec prin `lib/cost-ledger.ts`**. | Regula 1 vorbește despre costuri. O zi liberă nu e o cheltuială înregistrată acolo — manopera intră în cost prin pontaj, iar în concediu nu există pontaj. |
| 2026-08-21 | Soldul de concediu se verifică **la depunere**, nu la aprobare. `pending` se scade din rămas. | Discuția e cu omul care tocmai a ales datele, nu cu PM-ul peste trei zile. Iar dacă cererile în aprobare n-ar scădea din rămas, cineva ar cere de două ori aceleași zile. |
| 2026-08-21 | `FIELD_NAVIGATION` a fost **scos** din `lib/navigation.ts`. | Bara de teren are trei tab-uri și trăiește în `FieldTabs.tsx`. O a doua listă în `navigation.ts` ar fi fost al doilea adevăr despre aceeași bară. |
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

*Lucruri care s-au stricat o dată și se pot strica din nou. Scurt, doar simptomul și leacul.*

| Simptom | Leac |
|---|---|
| Interogări care nu se mai întorc; „Failed to fetch RSC payload" pe toate paginile | Rețeaua s-a schimbat sub aplicație (Tailscale, sleep, wifi): socket-urile către pooler sunt `ESTABLISHED` local, dar celălalt capăt nu mai există. Verifică `netstat -ano \| grep 6543`. `lib/db/index.ts` se apără singur: 20s fără răspuns ⇒ bazinul se aruncă și se redeschide. |
| Aplicația merge, dar e lentă / plafon de conexiuni | `DATABASE_URL` trebuie să fie pe **6543** (transaction mode), nu 5432 (session mode, plafon 15). `DIRECT_URL` (`db:push`, seed) rămâne pe 5432 — `drizzle-kit` are nevoie de stare pe sesiune. |
| `password authentication failed` pe ambele porturi, cu credențiale corecte | Rafală de 24–30 de cereri simultane l-a doborât pe Supavisor. Database → Connection pooling → **Restart pooler**, sau ~15 minute. Baza nu e afectată. |
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

### 2026-08-26 — Inspecții: catalog de puncte, liste moștenite, lună de raportare

Schema: `inspection_checks` (catalog global de puncte, cu cod), `contract_checklists` și
`objective_checklists` (setul contractului / setul propriu), `contract_objectives.inspection_source`,
`checklist_templates.ticket_type_id`, `checklist_items.check_id`, pe `inspection_answers` (`check_id`,
`na`, `measured_value`), pe `work_units` (`ticket_type_id`, `report_year`, `report_month`,
`monthly_report_id`).

Tipul de inspecție **refolosește `ticket_types`** — nomenclatorul de la tichete, nu al doilea.

`lib/inspections.ts`: `effectiveLists(day)` rezolvă moștenirea (contract → obiectiv, legătură nu copie,
cu cădere pe vechiul `checklist_template_id`), `isDueInMonth`, `reportPeriodFor`.

Fișa de inspecție are patru pași (Unde · Ce verifici · Ce ai găsit · Trimite). Pasul 2: tipul filtrează
listele obiectivului, bifezi punctele verificate. Pasul 3: OK / Problemă / N/A per punct + notă + valoare
măsurată; verdictul fișei **iese din puncte**, nu se mai declară global.

**Acoperirea se măsoară pe luna de raportare, nu pe data faptei** — decizia utilizatorului: mentenanța
se face „când are cineva timp în luna aia". `/rapoarte/inspectii` numără după `report_year/month`, cu
cădere pe date pentru fișele vechi.

Birou: filă nouă `/nomenclatoare?fila=puncte`; în listă, o linie care e un COD din catalog leagă punctul,
orice altceva rămâne text liber. Pe contract, secțiunea „Liste de inspecție"; pe rândul obiectivului,
comutatorul moștenit/propriu (la desprindere, setul contractului se copiază o dată).

`tsc` și `next build` curate. **`db:push` NU a rulat** — conexiunea la Supabase nu răspunde din mediul
sesiunii (§5). De rulat înainte de orice plimbare în browser, apoi `npm run seed` pentru catalogul nou.

### 2026-08-26 — Tichete: kanban pe contract

Construit peste `requests` (`kind = 'tichet'`), nu pe un tabel nou. Schema: enum-urile
`ticket_urgency` și `ticket_event_kind`; tabelele `ticket_types` (nomenclator), `ticket_stages`
(**per contract**), `ticket_documents` (doar metadate — nu există bucket), `ticket_events` (firul de
istoric); pe `requests` opt coloane noi (`stage_id`, `ticket_type_id`, `urgency`,
`assigned_partner_id`, `assignee_id`, `due_date`, `board_order`, `stage_entered_at`).

`lib/tickets.ts` (pur: etichete, tonuri, validatori, formatări) · `app/actions/tickets.ts` (o singură
poartă: `requireSession` → `can` → scriere → `revalidatePath`) · trei capabilități noi în
`permissions.ts`, dintre care `tichete.configureaza` **doar prin `*` de admin** · `/tichete` (grilă de
contracte) și `/tichete/[contractId]` (board) · `TicketBoard`, `TicketFilters`, `TicketDetail`,
`TicketForms`, `TicketContracts`. Drag & drop HTML5 nativ, cu linie-indicator și mutare optimistă;
alternativa fără mouse e meniul „⋯" de pe card. Filtrele trăiesc în URL. Seed aditiv:
`seed/tickets.ts` (nu șterge nimic, se poate rula de mai multe ori) — 7 tipuri, etape pe fiecare
contract (două fluxuri diferite, ca importul de etape să aibă ce copia), ~10 tichete pe contract,
plus adoptarea tichetelor vechi din `/cereri` în prima etapă.

**Capcana care a costat cel mai mult:** într-un `select` **fără join**, Drizzle emite coloana
outer-ului **fără prefix de tabel** (`"id"`), deci o subinterogare corelată se leagă tăcut de tabelul
ei (`r.id`) și întoarce mereu 0. Fix: `sql.raw('"ticket_stages"."id"')`. Cu join, Drizzle
califică singur — de-aia agregatele de pe `/tichete` mergeau, iar contorul de etape nu.

A doua: `clsx` nu e `tailwind-merge`. `Input`/`Select` au `w-full` în clasa de bază, deci un `w-40`
adăugat prin `className` nu câștigă — rândurile din modalele de configurare stau pe `grid` cu coloane
fixe, nu pe `flex` cu lățimi pe control.

`db:push` a atârnat (drizzle-kit cere confirmare pe adăugările de coloane), așa că DDL-ul a fost
aplicat direct, idempotent. `tsc --noEmit` și `npm run build` curate. Rămâne de plimbat în browser
modalul „Etape"/„Tipuri" după trecerea pe grid — pool-ul Supabase a început să pice intermitent
(cădeau și interogări din `layout.tsx`), deci verificarea s-a oprit acolo.


### 2026-08-25 — listă de alegere proprie, peste tot

`components/ui/select.tsx` (nou) înlocuiește dropdown-ul browserului în toate cele 31 de locuri.
Sub el stă **tot un `<select>` nativ**, invizibil (`opacity-0`, nu `display:none` — altfel `required`
ar deveni „invalid, dar nefocusabil"), întins peste declanșator: poartă `name`, deci acțiunile de
server nu s-au atins, și primește alegerea prin setter-ul nativ + `change` care urcă, deci
`value`/`defaultValue`/`onChange` din apelurile vechi au rămas neschimbate. Opțiunile se citesc din
DOM-ul lui, nu din `children` prin React — merg și `<UnitOptions />`, `<OptionList>`, orice `.map()`;
pentru randarea de server se deduc și din `children`, altfel fiecare câmp ar clipi pe „Alege…".
Butonul stă **înaintea** select-ului în DOM (un `<label>` care împachetează câmpul își leagă primul
descendent focusabil; altfel un click pe etichetă ar deschide lista sistemului peste a noastră), și
tot el poartă `id`.

Două înfățișări: `tone="office"` (38/32/28px prin `size`, panou `fixed` ca să nu-l taie `overflow`
de tabel, căutare de la 8 opțiuni în sus) și `tone="field"` (tipografia de 17.5px din `.f-fld`,
panou care urcă de jos sub 640px). Tastatură completă; animații `.pop-panel`/`.pop-sheet` în
`globals.css`, oprite la `prefers-reduced-motion`. `Select` din `primitives.tsx` e acum re-export —
de-aici, cele 14 fișiere de birou n-au avut nevoie de nicio schimbare. Singura excepție:
`className` folosit pentru înălțime a devenit `size="xs" | "sm" | "md"`, `className` rămâne doar
pentru lățime (9 apeluri).

Verificat: `tsc`/`eslint` curate (rămân erorile dinainte din `rapoarte/inspectii` și `modal.tsx`);
15 ecrane răspund 200 și randează `role="combobox"` cu eticheta corectă în HTML-ul de server.
**Neverificat vizual** — extensia de browser nu era conectată.

### 2026-08-25 — redesign birou după `erp-mockup.html` (comprimat)

Paleta trece în variabile brute (`--bg --surf --sunk --line --tx --acc --ok --warn --bad --rail*`,
umbre `--sh-1/2/3`, raze 10/7/5px) în `app/globals.css`; numele Tailwind (`paper`, `sheet`, `rule`,
`ink`, `blueprint`…) sunt indirecții către ele, deci **nicio pagină nu s-a atins**. Temă închisă pe
`[data-theme="dark"]`, densitate pe `[data-density]`, puse de un script inline din `app/layout.tsx`
care **sare peste `/teren`**. `primitives.tsx` a primit `Kpi` (cu sparkline SVG), `Note`,
`Toolbar`/`Segments`/`Chip`, `Pipeline`, `Trail`, `DetailHeader`; `table.tsx` densitate din
`--row-y`/`--tbl-fs`; `Rail` 244px cu icoane `lucide-react` (numele iconiței în `lib/navigation.ts`,
nu componenta — altfel nu trece granița server→client); `TopBar`; `CommandPalette.tsx` (Ctrl/⌘K).

Ce **nu** s-a făcut: paginile încă folosesc KPI/toolbar/note scrise de mână — adoptarea
componentelor noi ecran cu ecran e o sesiune separată.

### 2026-08-24 — bara de jos a terenului + blocul F (comprimat)

Fâșia de sub `.f-tabs` pe iOS instalat: `FieldViewportFit` măsoară `screen.height − innerHeight`
(clamp 0–80px) în `--f-extra`, `.f-app` primește `bottom: calc(-1 * var(--f-extra))`, `.f-tabs`
padding `max(env(safe-area-inset-bottom), var(--f-extra))`, `html`/`body` sub `.f-app` fundal
`#10151f`; tastatura nu mai împinge bara (`visualViewport`). Tab nou **Mentenanță**,
„Locuri"→„Lucrări" (ruta rămâne `/teren/locuri`), coș de comandă la `/teren/catalog`, zero prețuri.

Blocul F — 15 rute noi din `santierappv3.html` (**doar funcțiile**; `v3` e canonic unde diferă;
media e doar interfață). Schemă: `subcontractor_attendance`, `media_slots`,
`work_units.inspection_type/discipline/source_tag/source_unit_id`,
`purchase_orders.needed_by/drop_point/urgency/field_note`. Mentenanța ca două fluxuri
(`/teren/mentenanta`: inspecție-wizard care se închide cu verdict, intervenție care rămâne deschisă
și își împletește firul din `site_journal_entries`+`timesheets`+`intervention_details`); pontaj
echipă/firme; lucrarea pe file `?f=jurnal|echipa|depozit|acte`; PV cu semnătură canvas. Piese:
`FieldParts.tsx`, `InspectionWizard.tsx`. `/teren/[id]` redirectează la `/teren/interventii/[id]`.

### 2026-08-21 — aplicația de teren; concedii (comprimat)

Limbaj vizual propriu (`field.css`, prefix `f-`), bara de tab-uri (`FieldTabs.tsx`, apartenența pe
prefixul căii), `lib/field.ts` ca sursă unică a cifrelor. Meniul unui **loc** (obiectiv, nu UL),
cererile ca fir peste `purchase_orders` **și** `requests`, inventarul echipei (disponibil, nu
cantitate), bon de consum, notificări. **Concedii:** `leave_requests` + `users.annual_leave_days`,
`lib/leave.ts` pur, wizard 3 pași pe teren, `/concedii` la birou.

### 2026-08-21 și mai devreme — restul blocurilor (comprimat)

- **Hartă/bazin:** `map-picker.tsx` (slippy OSM, fără Leaflet) · `lib/db/index.ts`, termen 20s (§5).
- **E** (§9.2–§9.10): `/contracte/nou` (asistent 3 pași, o tranzacție, pagină nu modal),
  `ObjectiveForm`, `OperabilityForms`, `DevizForms`, `lib/pickers.ts`.
- **Facturi/clopoțel:** `lib/notifications.ts` (semnale calculate) · `/facturi` + `lib/invoicing.ts`.
- **C2** `lib/stock.ts` + 23–25: disponibil = cantitate − rezervat, 3 canale, CMP · **B2**
  `lib/execution.ts` + `/lucrari/[id]/executie` · **A2** `lib/deviz.ts` + 16–21, T8 (N:M, SL blocată
  pe depășire, garanții) · **C** `lib/equipment.ts`, `pv-templates.ts`, ecranele 26–33.
- **Fundația+A+B**: Next.js 16, Tailwind 4, design system, shell, login, seed, 2–15, 34, 36, T1–T6.

**Accidentul care se repetă:** un fișier client care importă `lib/` cu `lib/db` în spate dă 500
pe tot blocul, `tsc` curat — de-aici `lib/*-types.ts`.
