# Damina ERP — plan de prototip

**Scopul acestui document.** Un plan de construcție pentru un ERP funcțional de demonstrație,
care acoperă toate zonele de business din `DaminaStructuraCapCoada` la adâncime de prototip.
Nu e un plan de produs. Ținta e: **arată bine, funcționează cap-coadă cu date credibile, se poate
pune în fața unui programator ca specificație vie.**

Estimare: **2–3 zile** cu 3 sesiuni Claude Code care lucrează în paralel după fundație.

---

## 0. Deciziile luate

| Decizie | Alegere |
|---|---|
| Stivă | O singură aplicație **Next.js** (App Router, TypeScript) |
| Bază de date | **Supabase Postgres**, conexiune directă cu Drizzle. **Fără RLS, fără roluri Postgres.** |
| Autentificare | Proprie — tabelă `users`, parolă, cookie de sesiune. **Fără Supabase Auth, fără 2FA.** |
| Perspective | Login normal + **comutator de rol în bară** pentru contul de admin |
| Design | **Design system propriu** — tokeni + componente dense de ERP |
| Fișiere | **Supabase Storage**, upload simplu într-un singur request |
| Acoperire | Toate cele 10 zone de business, la adâncime de demo |
| Portal subcontractant | **NU se construiește** — există deja ca aplicație separată |
| Limbă | Cod și DB în engleză; termeni intraductibili în română fără diacritice (`deviz`, `pontaj`, `nir`); UI 100% română, scrisă direct în componente |

### Ce NU se construiește, deliberat

Fiecare punct de mai jos e o decizie de producție corectă pe care o amânăm conștient. Toate ajung
în §7, lista de cusături pentru programatori.

- RLS, roluri Postgres, grant-uri per coloană. Permisiunile se verifică **într-un singur fișier**,
  `lib/permissions.ts`. Izolarea prețului rămâne demonstrabilă pe ecran, nu impusă la nivel de date.
- 2FA, revocare de sesiune, rate limiting.
- Monorepo, pachete separate, Turbo. O aplicație, foldere.
- Worker, cozi, pg-boss, joburi asincrone. Tot ce e greu se calculează sincron — la volumele de demo
  se termină în sub o secundă.
- PWA offline, service worker, outbox, sincronizare, ecran de conflicte. Aplicația de teren e
  **web responsive pe telefon**. Ăsta singur e ~5 zile în planul vechi.
- Upload multipart, URL-uri presemnate, retry per-parte, thumbnails, OCR.
- Teste, CI, Playwright, buget de tap-uri impus automat. Bugetul de 3 atingeri rămâne **regulă de
  proiectare**, verificată cu degetul, nu cu test blocant.
- Migrări numerotate imutabile. O singură schemă, regenerată când e nevoie.
- Audit trail cu triggere. Există un câmp `created_by` / `updated_by` unde contează, atât.
- ANAF/SPV/e-Factura, conector Saga, import Excel, inbox de email, e-Transport, SSM, deșeuri, WMS.
- `Decimal.js`, UUID v7, i18n prin dicționar.

**Banii:** `numeric(14,2)` în Postgres, număr întreg de bani în TypeScript. Niciodată `float`.
Asta e singura disciplină de producție pe care o păstrăm, fiindcă e ieftină și fără ea cifrele din
demo nu se adună.

---

## 1. Structura aplicației

```
erp-2/
  app/
    (auth)/login/
    (office)/                     ← interfața de birou, densă, desktop
      panou/                      ← panoul PM
      contracte/
      obiective/
      cereri/
      lucrari/                    ← unitățile de lucru (toate 3 tipuri)
      devize/
      situatii/
      stoc/
      achizitii/
      utilaje/
      unelte/
      transporturi/
      documente/
      facturi/
      rapoarte/
      nomenclatoare/
    (field)/teren/                ← interfața de teren, mobil-first, atingeri puține
    api/
  components/
    ui/                           ← design system: Button, Table, Gauge, Money, Badge, …
    domain/                       ← componente de business refolosite pe mai multe ecrane
  lib/
    db/schema.ts                  ← schema Drizzle, toată, într-un fișier
    db/index.ts
    permissions.ts                ← singura poartă de permisiuni
    money.ts
    cost-ledger.ts                ← singurul loc care scrie în registrul de cost
    budget.ts                     ← plan / angajat / consumat / rest / proiecție
    session.ts
  seed/
    index.ts                      ← date demo: 5 firme, 9 contracte, ~120 obiective, …
  PLAN.md
```

**Două reguli de arhitectură, singurele care nu se negociază:**

1. **Fiecare leu trece prin `lib/cost-ledger.ts`.** Nicio altă bucată de cod nu scrie în
   `cost_entries`. Dacă un modul nou are nevoie să înregistreze un cost, cheamă funcția existentă
   sau adaugă un `source_type` nou în ea. Ăsta e P3 din documentul de business și e motivul pentru
   care toate rapoartele se leagă între ele.
2. **Finanțarea e o legătură, nu un câmp.** O unitate de lucru nu are `contract_id` pentru
   finanțare. Are rânduri în `funding_allocations`. Fără asta, Delta pe 3 luni și mutările între
   contracte cer cod nou la fiecare caz.

---

## 2. Schema — ~48 de tabele

Grupate pe module. Toate au `id`, `created_at`; unde contează, `created_by`.

**Organizare (5)**
`firms` · `users` (cu `role`, `firm_id`) · `partners` (client | furnizor | subcontractant | angajat — un singur nomenclator cu `type[]`) · `objectives` (cod, tip, adresă, GPS) · `contract_objectives` (legătura, cu perioadă + `inspection_profile_id`)

**Contracte și bani (4)**
`contracts` (tip, perioadă, valoare, termen plată, indexare %, prag Delta, PM proprietar) ·
`contract_years` (abonament istoricizat pe an de contract) ·
`contract_components` (tip: mentenanta | lucrari | delta | individual; venit alocat; plafon) ·
`component_budgets` (per componentă × lună: `plan`, `manual_cap` pentru Delta)

**Unitatea de lucru (4)**
`work_units` (tip: inspectie | interventie | lucrare; obiectiv; firmă; status; responsabil; executant; estimat; buget) ·
`work_unit_stages` (etape, doar lucrări: ordine, perioadă, buget material, buget manoperă, % din lucrare) ·
`funding_allocations` (UL × componentă × lună × valoare × status × motiv) ·
`reallocations` (mutări în luni închise: din ce componentă, în ce componentă, cine, de ce)

**Registrul de cost (2)**
`cost_entries` — **tabela centrală**, exact structura din §11 a documentului de business:
`data_document`, `data_efect`, analitica *folosit* și analitica *descărcat* separate,
`tip_cheltuiala`, `stadiu` (angajat | receptionat | consumat | facturat), `document_tip` + `document_id` ·
`periods` (firmă × lună × `closed_at` — buton de închidere, fără triggere de blocare)

**Cereri și rutare (3)**
`requests` (tip: tichet | solicitare | constatare | propunere | solicitare_utilaj | observatie_utilaj; sursă; obiectiv; valoare estimată; decizie + cine + când) ·
`operation_catalog` (tip operațiune → normă de timp → materiale tipice → cost estimat) ·
`operation_catalog_materials`

**Fișe de lucru (6)**
`checklist_templates` · `checklist_items` · `inspection_answers` (per punct: ok/nok, notă, ieșire impusă la NOK) ·
`intervention_details` (ore declarate, descriere) · `timesheets` (pontaj, ziua împărțită pe mai multe UL) ·
`labor_rates` (rate card per calificare, **istoricizat**)

**Deviz (5)**
`devize` (tip client | intern, versiune, status) · `deviz_lines` · `deviz_mapping` (N:M client↔intern, cu coeficient) ·
`normed_articles` (biblioteca) · `deviz_templates` (șabloane pe tip de obiectiv)

**Pachete și situații de lucrări (6)** — *fără ecrane de subcontractant*
`packages` (din devizul intern, per specialitate) · `package_lines` (cu preț — vizibil PM, ascuns șefului de șantier) ·
`situatii_lucrari` (lunare, per pachet, cu cod SL generat) ·
`sl_lines` (cele 5 cumulate: contractat / executat / aprobat / facturat / rest, plus `verified` ok|suspect + comentariu) ·
`supplements` (suplimentări, cu aprobare separată) · `retentions` (garanții de bună execuție, ambele sensuri)

**Stoc și achiziții (9)**
`warehouses` (tip: centrala | santier | echipa | subcontractant | consignatie | unelte) · `products` ·
`stock` (gestiune × produs: cantitate, rezervat, CMP) · `stock_movements` ·
`consumption_notes` + `consumption_lines` (bon de consum) ·
`purchase_orders` + `po_lines` (cu analitică pe linie: contract + componentă + UL + etapă) ·
`goods_receipts` (recepție → NIR)

**Utilaje, unelte, transport (8)**
`equipment` (registru, tarif orar intern, contor, expirări ITP/RCA/ISCIR, activitățile pe care le poate face) ·
`equipment_plannings` (calendar, validare de suprapunere pe server) ·
`handover_protocols` (PV predare-primire — **un document, două etape**, datele de predare blocate după creare) ·
`fuel_logs` + `fuel_prices` (prețul motorinei pe zi) · `repairs` (tip: interventie | revizie | gresare | capitala) ·
`tools` · `transports` (o entitate, mai multe tipuri, coadă centrală)

**Fișiere și PV (4)**
`file_nodes` (arbore în Postgres, listă de adiacență — mutarea unui folder = un UPDATE) ·
`file_versions` (append-only, `current_version_id`) ·
`pv_templates` (PDF + câmpuri poziționate procentual) · `pv_documents` (draft → trimis → semnat, cu semnătură desenată)

**Rapoarte, facturare, notificări (4)**
`monthly_reports` (versionat, înghețat la emitere) · `invoices` + `invoice_lines` · `notifications`

---

## 3. Ecranele — ~37 birou + 8 teren

### Birou (desktop, dens)

| # | Ecran | Ce demonstrează |
|---|---|---|
| 1 | **Panou PM** | Gauge-urile pe componentă, Delta care **se umple** (nu se golește), alerta de neumplut, marja lunii și cumulată pe an contractual |
| 2 | Contracte — listă | Cele 9 abonamente, an de contract curent, indexare, alertă expirare |
| 3 | Contract — detaliu | Ecranul din §4.3: abonament, cele 3 componente cu venit / plafon / angajat / consumat / rest, marjă |
| 4 | Contract — marjă pe ani | Curba pe 4 ani + proiecție cu ipoteze editabile (§22.6) |
| 5 | Obiective — listă + hartă | ~120 obiective demo, filtre pe tip și contract |
| 6 | Obiectiv — istoric | Ecranul din §5: tot ce s-a întâmplat, pe luni, cu costuri, total anual |
| 7 | Cereri — inbox | Tichete / solicitări / constatări, cu triere |
| 8 | **Cerere — decizia de rutare** | Cele 3 ramuri din §7, calculate din catalogul de operațiuni, cu autor și dată |
| 9 | Backlog Delta | Propuneri evaluate, filtrate după cât mai e liber în Delta lunii |
| 10 | Unități de lucru — listă | Toate 3 tipurile, cu filtre |
| 11 | UL — detaliu | Tab-uri: finanțare (alocările), cost, fișe, fișiere, etape |
| 12 | **Mutarea finanțării** | Realocare, cu cele două comportamente după cum luna e deschisă sau închisă (§13.1) |
| 13 | Lista de realocări a lunii | Ecranul obligatoriu din §13.1 |
| 14 | Registrul de cost | Tabelul central, cu **comutator folosit / descărcat** vizibil pe ecran |
| 15 | Închiderea de lună | Buton + verificări afișate |
| 16 | Deviz client | Versionat, poziții, indirecte + profit |
| 17 | **Deviz intern + maparea N:M** | Panoul de mapare, bara de trasabilitate (§8.4) |
| 18 | Articole normate | Biblioteca + „salvează poziția ca articol" |
| 19 | Pachete | Din devizul intern, pe specialitate. **Materialele nu intră în pachet** — impus de sistem |
| 20 | Situații de lucrări | Cele 5 cumulate, blocaj la depășirea cantității contractate |
| 21 | Suplimentări și garanții | Suplimentare atomică (deviz + SL în aceeași tranzacție), sold de garanții, scadențar |
| 22 | Execuția lucrării — Gantt | Etape, buget vs consum pe etapă, alertă la 80% |
| 23 | Gestiuni și stoc | Pe locație fizică, cu rezervări |
| 24 | Achiziții — cele 3 canale | Necesar → filtrul de 24h la magazie → PO cu analitică pe linie |
| 25 | Recepție + NIR | |
| 26 | **Utilaje — flotă** | Registru, calendar Gantt, decalare în masă, PV-uri deschise evidențiate |
| 27 | Utilaj — dosar | File: Detalii / Accesorii / Motorină / Reparații / Planificări / PV / Poze |
| 28 | Solicitări de utilaj — inbox | Alocarea utilajului concret de către birou (§18.1.2) |
| 29 | PV predare-primire | Un document, două etape, cu semnătură pe ecran, printabil A4 |
| 30 | Unelte | Predare / retur cu PV, status, istoric |
| 31 | Transporturi | Coadă centrală + hartă; cele generate automat intră singure |
| 32 | Documente | Arborele de foldere, folder auto pe fiecare UL |
| 33 | Șabloane de PV | Poziționarea câmpurilor procentual pe PDF |
| 34 | **Raportul lunar către client** | Agregare din fișe, versionat, înghețat la emitere, export |
| 35 | Facturi | Lunar fix la mentenanță, din SL la individual; schelet e-Factura |
| 36 | Acoperirea inspecțiilor | Câte obiective au fost inspectate luna asta (§22.2) — măsori fără să hărțuiești |
| 37 | Nomenclatoare | Firme, parteneri, produse, calificări + rate card, catalog de operațiuni |

> **Cele 37 de ecrane de mai sus arată și decid, dar în mare parte nu creează.** Datele vin din
> seed. Ce trebuie adăugat ca aplicația să poată fi și *operată*, nu doar demonstrată, e în **§9**.

### Teren (mobil, atingeri puține)

| # | Ecran | Regula |
|---|---|---|
| T1 | Azi | Lista + butonul ＋ cu 4 acțiuni |
| T2 | Inspecție | Checklist, NOK cu ieșire impusă, poze pe punct |
| T3 | Intervenție | Materiale din gestiunea echipei, ore, poze înainte / după |
| T4 | Necesar material | **Trei atingeri cap-coadă**, unitate precompletată, câmp focalizat |
| T5 | Pontaj | Ziua împărțită pe mai multe UL |
| T6 | Jurnal de șantier | Se deschide gata de scris, Trimite e singura atingere |
| T7 | Utilajele mele | Doar ce am pe șantier. **Cantități, nu bani.** Solicitare + observație în 2 atingeri |
| T8 | Verificare SL | Cantități linie cu linie, ok / suspect + comentariu. **Zero prețuri pe ecran** |

**Regula bugetului de atingeri:** ＋ costă o atingere, alegerea acțiunii încă una. Ținta e 3, deci
un ecran de sub ＋ are voie la **o singură atingere** — cea de Trimite. Nu se impune cu test, se
respectă la proiectare.

#### Blocul F — ce a adus mockup-ul `santierappv3.html` (2026-08-24)

Din cele două mockup-uri noi se iau **doar funcțiile**. Designul rămâne cel existent (clase `f-`),
bara rămâne pe trei tab-uri. `santierappv3.html` e canonic acolo unde diferă de `santierappmockup.html`.

| # | Ecran | Regula |
|---|---|---|
| F1 | Mentenanță | File pe **stări** (de făcut · în lucru · gata · inspecții), nu pe tipul fișei — omul se gândește la ce mai are de rezolvat, nu la ce fel de document e |
| F2 | Fișă de inspecție nouă | Trei pași. „Nu am rezolvat pe loc" **naște intervenția în același apel** |
| F3 | Fișă de inspecție (citire) | Se termină cu „ce s-a întâmplat mai departe" — altfel constatarea n-are urmă |
| F4 | Fișă de intervenție nouă | „Mă apuc acum" / „doar o planific". Fișa **nu se închide** aici |
| F5 | Fișă de intervenție (fir) | Cronologie, nu patru liste. Trei stări: planificată → în lucru → finalizată. După finalizare nu se mai adaugă nimic |
| F6 | Pontaj echipă | Mai mulți oameni deodată; orele ies din intrare − plecare. Un rând de pontaj **per om**, la calificarea lui |
| F7 | Pontaj subcontractanți | Ore-om pe firmă și pe zi. **Nu produce cost.** Ziua se rescrie, nu se adaugă |
| F8 | Lucrare, patru file | Jurnal · Echipă · Depozit · Acte. Filele sunt **linkuri**, nu stare de client |
| F9 | Înainte / După | Două seturi de poze cu unghi (N/S/E/V), nu două etape de lucru |
| F10 | Comenzi | Materiale, unelte și transporturi într-o listă. Treptele derivă din status |
| F11 | Catalog + coș | Se răsfoiește, nu se caută pe de rost. **Zero prețuri.** Un coș = o comandă |
| F12 | Cerere utilaj | Cerere de **rutat**, nu comandă — trece prin PM. Categoria, nu utilajul anume |
| F13 | Cerere transport | O singură coadă centrală, oricare ar fi tipul cursei (§18) |
| F14 | PV nou | Semnătură pe canvas, în **același câmp** folosit de semnarea prin link de la birou |
| F15 | PV unelte | Primire → starea se **blochează** → predare, comparată cu ea |

**Media:** pozele, filmările și semnăturile se declară ca rânduri în `media_slots`, cu `storage_key`
gol. Conținutul se leagă separat, pe **Cloudflare R2** — nu pe Supabase Storage.

---

## 4. Cele 8 reguli de business care fac demo-ul credibil

Astea sunt lucrurile pe care un ERP de pe piață nu le face și de-aia construiți unul. Dacă ceva
trebuie tăiat sub presiune de timp, **nu de aici**.

1. **Delta e inversul celorlalte.** Gauge care se umple. Alertă la mijlocul lunii dacă e sub prag.
   Nu se reportează.
2. **Dubla analitică folosit / descărcat**, cu comutator vizibil pe fiecare raport.
3. **Costurile urmează unitatea de lucru** la mutare — rescriere dacă luna e deschisă, document de
   realocare dacă e închisă.
4. **Un singur registru de cost.** Toate rapoartele sunt filtre pe el.
5. **Stratul „angajat".** O comandă lansată e bani cheltuiți. Fără el, afli de depășire cu 3
   săptămâni întârziere.
6. **Izolarea prețului.** Șeful de șantier nu vede lei nicăieri — nici la SL, nici la utilaje.
7. **Promovarea intervenție → lucrare** păstrează id-ul, pozele, orele și consumurile.
8. **Cine are nevoie de resursă, acela deschide cererea; biroul alocă.** Se aplică identic la
   utilaje, unelte, transport și material. Aprobarea produce direct obiectul următor.

---

## 5. Execuția — cum se împarte pe sesiuni

### Ziua 1, dimineața — FUNDAȚIA (o singură sesiune, nimeni în paralel)

Până nu e gata, celelalte două sesiuni nu pornesc. Livrează:

- proiect Next.js, conexiune Supabase, Drizzle
- **`lib/db/schema.ts` — toate cele ~48 de tabele deodată.** Nu pe bucăți. Asta e ce permite
  paralelizarea de după.
- `lib/money.ts`, `lib/permissions.ts`, `lib/session.ts`, `lib/cost-ledger.ts`, `lib/budget.ts`
- login + comutator de rol în bară
- **design system**: tokeni de culoare / spațiere / tipografie + `Button`, `Input`, `Select`,
  `Table`, `Card`, `Badge`, `Money`, `Gauge`, `Tabs`, `Modal`, `DateRange`, `EmptyState`
- shell: bară, navigație pe module, clopoțel de notificări
- **`seed/index.ts`** — 5 firme, 9 contracte cu componente și plafoane pe 12 luni, ~120 obiective,
  ~40 parteneri, ~200 produse, ~15 utilaje, catalog cu ~60 de operațiuni, ~300 de unități de lucru
  împrăștiate pe ultimele 8 luni, cu costuri care se adună la cifre credibile

**Regula modală, aplicată global de la început:** fereastra nu se închide la click în afara ei.
Doar buton explicit, cu confirmare dacă există modificări nesalvate. S-au pierdut date reale așa.

### Ziua 1, după-amiaza — 3 sesiuni paralele

| Sesiune | Zonă | Ecrane | Tabele pe care le atinge |
|---|---|---|---|
| **A — Banii** | contracte, componente, plafoane, indexare, obiective, registrul de cost, dubla analitică, închiderea lunii, panoul PM | 1–6, 14, 15 | `contracts*`, `component_budgets`, `objectives`, `cost_entries`, `periods` |
| **B — Operațional** | cereri, catalog, rutare, backlog, UL, alocări, mutări, fișe, teren, raport lunar | 7–13, 34, 36, T1–T6 | `requests`, `operation_catalog`, `work_units`, `funding_allocations`, fișe, `monthly_reports` |
| **C — Resurse** | utilaje (fluxul complet §18.1), unelte, transporturi, fișiere, PV cu semnătură | 26–33, T7 | `equipment*`, `tools`, `transports`, `file_*`, `pv_*` |

### Ziua 2 — aceleași 3 sesiuni, zone noi

| Sesiune | Zonă | Ecrane |
|---|---|---|
| **A** | deviz client + intern + mapare N:M, articole normate, pachete, SL, suplimentări, garanții | 16–21, T8 |
| **B** | execuția lucrării: Gantt, buget pe etapă, jurnal, necesar pe etape, închiderea lucrării | 22 |
| **C** | stoc, gestiuni, cele 3 canale de achiziție, PO, recepție, consum, CMP simplu | 23–25 |

### Ziua 3 — integrare și lustruire (1–2 sesiuni)

- facturare + schelete marcate vizibil: e-Factura, SPV, conector Saga, import Excel, inbox email
- notificări reale în clopoțel (buget la 80%, SL de aprobat, PV rămas deschis, revizie scadentă pe
  dată **sau** pe ore de funcționare, contract care expiră în 6 luni)
- **plimbare cap-coadă pe fiecare din cele 8 reguli de la §4**, cu ochii, în aplicație
- date demo îmbogățite acolo unde ecranele arată gol
- lustruire: aliniere, spațiere, stări goale, stări de încărcare

---

## 6. Ordinea de care depinde totul

```
schema + seed + design system
        ↓
   ┌────┴────┬─────────┐
   A         B         C          ← ziua 1 după-amiaza, paralel
   ↓         ↓         ↓
   A2        B2        C2         ← ziua 2, paralel
   └────┬────┴─────────┘
     integrare                    ← ziua 3
```

Singura dependență reală între sesiuni: **B are nevoie de `cost-ledger.ts`** scris de fundație, iar
A2 (devizul) are nevoie de UL-uri de tip lucrare. Dacă A2 pornește înaintea lui B2, folosește
UL-urile din seed.

---

## 7. Cusăturile — ce le spui programatorilor

Lista asta e livrabilul la fel de important ca aplicația. Fiecare punct e un loc unde prototipul
se oprește intenționat și unde produsul real continuă.

| Zonă | În prototip | În producție |
|---|---|---|
| Permisiuni | `lib/permissions.ts`, verificat în cod | RLS + roluri Postgres + grant-uri per coloană. Izolarea prețului **la nivel de date**, nu de ecran — vezi §10.3 și §21.8 din documentul de business |
| Portal subcontractant | **există deja, aplicație separată** | de cusut la `packages` / `sl_lines`; cantitățile declarate intră prin el |
| Teren | web responsive | PWA offline: outbox, jurnal de idempotență, cursori de sincronizare, ecran de conflicte. La 20 de oameni în subsoluri, asta nu e opțională |
| Fișiere | Supabase Storage, upload simplu | R2 + multipart direct din browser + retry per-parte + geotag + thumbnails + OCR + permisiuni pe nod |
| Semnătură PV | desen + IP + timestamp | **hash SHA-256 al PDF-ului la semnare** + semnare secvențială pe mai multe părți. Obligatoriu înainte de recepții |
| Contabilitate | nimic | conector unidirecțional către Saga, ~8 tipuri de document, coadă de export cu erori vizibile |
| ANAF | schelet | SPV la intrare cu matching 3-way, e-Factura la emitere, e-Transport |
| Închidere de lună | buton + flag | blocaje reale, audit trail, imposibilitatea de a edita `data_efect` într-o lună închisă |
| Joburi | sincron | cozi, retry, raport lunar generat asincron cu progres |
| Intercompany | nu există | marcarea tranzacțiilor, perechea aviz + factură + NIR între firme, eliminare la consolidare |
| Migrarea datelor | seed | contracte reale, 700 obiective, stocuri, nomenclator — proiect în sine |

---

## 8. Ce rămâne de decis înainte de execuție

1. **Conexiunea Supabase** — proiect nou sau cel existent? (URL + parola bazei)
2. **Cum arată cusătura cu portalul de subcontractanți** — ce structură are azi tabela lui de linii
   declarate? Dacă e ușor de aflat, modelez `sl_lines` compatibil de la început.
3. **Cele 9 contracte reale** — valorile și ponderea componentelor. Cu cifre reale în seed, demo-ul
   convinge mult mai tare decât cu cifre inventate. Dacă nu sunt la îndemână, mergem pe inventate.

---

## 9. Blocul E — Operabilitate: introducerea datelor

**Decizia care deschide blocul:** aplicația trebuie să poată fi *operată*, nu doar demonstrată pe
datele din seed. Orice entitate pe care un om real o creează într-o zi de lucru are nevoie de un
drum din interfață. Seed-ul rămâne — dar ca date de pornire, nu ca singura sursă de existență.

### 9.0 Principiile care țin blocul unit

1. **Creezi de unde începe fluxul, nu dintr-un „meniu de tabele".** Butonul de „＋" stă pe ecranul
   care răspunde la întrebarea din care se naște înregistrarea: contractul nou pe `/contracte`,
   utilajul nou pe `/utilaje`. Nu se construiește un panou de administrare paralel.
2. **Un singur formular, refolosit.** `components/ui/form.tsx` — `Field`, `FormModal`,
   `SubmitButton` cu stare de trimitere. Prima creare îl scrie, restul îl folosesc. Fără al doilea
   `Table`, fără al doilea formular.
3. **Regulile 1–6 din `CLAUDE.md` se aplică identic la creare.** Banii tot prin `cost-ledger`.
   Finanțarea tot prin `funding_allocations`. Modalul tot cu buton explicit. Șeful de șantier tot
   fără lei — deci `＋` pe teren nu deschide niciodată un câmp de preț.
4. **Validarea stă în `lib/`, nu în componentă.** Aceeași funcție validează și server action-ul, și
   seed-ul. Un formular care acceptă ce seed-ul refuză e o a doua definiție a adevărului.
5. **Ce se creează automat nu primește buton manual.** Un PV se naște din alocare, o realocare din
   mutarea finanțării, o garanție din SL aprobată. A doua cale de intrare le desincronizează.

### 9.1 Ecranul 37 — Nomenclatoare (`/nomenclatoare`)

Singurul ecran din §3 rămas neconstruit; azi e intrare `stub` în bară. E casa datelor de referință:
file, fiecare cu listă + `＋` + editare. Fără el, nimic din restul blocului nu are ce alege în
`<select>`.

| Filă | Tabele | De reținut |
|---|---|---|
| Firme | `firms` | Serie de facturare per firmă (o folosește `lib/invoicing.ts`) |
| Parteneri | `partners` | Client / furnizor / subcontractant — aceeași tabelă, roluri diferite |
| Produse | `products` | Unitate de măsură, stoc minim/maxim, lead time — le citesc canalul A și semnalele |
| Calificări + rate | `labor_rates` | Rata orară pe calificare; o consumă pontajul prin `recordCost` |
| Catalog de operațiuni | `operation_catalog` + `operation_catalog_materials` | **Sursa rutării din §7.** O operațiune fără norme rutează greșit |
| Șabloane de checklist | `checklist_templates` + `checklist_items` | Definesc ce vede omul pe teren la inspecție |
| Utilizatori | `users` | Rol + firmă. Fără 2FA, fără invitații — parolă setată de admin |
| Preț motorină | `fuel_prices` | Pe lună; intră în costul din `fuel_logs` |
| Șabloane de PV | `pv_templates` | Creare + încărcare PDF; poziționarea câmpurilor există deja (ecranul 33) |

### 9.2 Contractul cap-coadă (`/contracte`, `/contracte/[id]`)

Cea mai adâncă lipsă: fără ea, aplicația nu poate primi un client nou. Un asistent în pași, pentru
că un contract fără componente și fără plafoane rupe panoul PM.

| Pas | Tabel | Regula |
|---|---|---|
| 1. Contract | `contracts` | Client, firmă, tip (mentenanță / individual), perioadă, valoare |
| 2. Componente | `contract_components` | Cele 3 din §4.3. Suma ponderilor = 100% |
| 3. Plafoane pe 12 luni | `component_budgets` | Generate din valoarea anuală, apoi ajustabile pe lună. **Plafonul de cost e 75% din venit** (§5 din PROGRESS) |
| 4. Obiective arondate | `contract_objectives` | Legare din obiective existente sau creare pe loc (9.3) |
| 5. An contractual + indexare | `contract_years` | Anul următor cu procent de indexare; nu se rescrie anul curent |

Editarea unui contract activ se limitează la ce nu falsifică istoricul: plafoanele lunilor
**deschise**, obiectivele arondate, datele de contact. Valoarea unei luni închise — niciodată.

### 9.3 Obiective (`/obiective`)

`objectives` — creare și editare: denumire, tip, adresă, coordonate, contract arondat. Tipul
contează: `D4` din `PROGRESS.md` §4 arată ce iese când operațiunile nu se filtrează pe
`objectives.kind`. Formularul de aici e locul unde se repară definitiv acea legătură.

### 9.4 Cererea din birou (`/cereri`)

Azi cererile intră doar din teren (T1–T6) și din `requestEquipment`. Lipsește cazul cel mai
frecvent: **clientul sună la birou.** `＋ Cerere` pe inbox, cu `source = manual`, apoi exact aceeași
rutare din §7 — fără ramură nouă de cod.

### 9.5 Unități de lucru și etape (`/lucrari`, `/lucrari/[id]/executie`)

| Ce | Tabel | De ce e nevoie |
|---|---|---|
| UL direct | `work_units` | Nu tot ce se lucrează trece printr-o cerere. Creare cu tip, obiectiv, perioadă — apoi finanțarea prin `funding_allocations`, ca regula 2 |
| Etape | `work_unit_stages` | Ecranul 22 desenează Gantt-ul din ele, dar nu le poate crea. O lucrare nouă are azi Gantt gol |

### 9.6 Deviz și derivatele lui (`/devize`, `/pachete`, `/situatii`)

| Ce | Tabel | De reținut |
|---|---|---|
| Deviz nou | `devize` | Client sau intern, legat de UL, versionat |
| Poziții | `deviz_lines` | Manual sau **din articole normate** (`normed_articles` are deja salvarea, nu și consumul) |
| Din șablon | `deviz_templates` | Tabela există și nu o folosește nimeni. Un deviz pornit de la zero de fiecare dată e motivul pentru care lumea lucrează în Excel |
| Pachet nou | `packages` | Adăugarea de linii există deja; crearea pachetului, nu. **Materialele rămân interzise** (§8.3) |
| Situație nouă | `situatii_lucrari` + `sl_lines` | Cale manuală, pentru lucrările care nu vin prin portalul de subcontractanți. Aceleași verificări ca la `approveSituatie` — blocaj la depășirea contractatului (§10.1) |
| Suplimentare | `supplements` | Există decizia, lipsește inițierea. Rămâne **atomică**: deviz + SL în aceeași tranzacție |

### 9.7 Resurse (`/utilaje`, `/unelte`, `/transporturi`)

`equipment`, `tools`, `transports` — creare și editare. La utilaj, formularul trebuie să ceară
**ambele baze de scadență** (dată și ore de funcționare), pentru că `lib/equipment.ts` calculează pe
amândouă și un utilaj introdus fără ore nu declanșează niciodată revizia. Transportul manual
completează coada care azi se umple doar automat.

### 9.8 Stoc și achiziții (`/stoc`, `/achizitii`)

| Ce | Tabel | De reținut |
|---|---|---|
| Gestiune nouă | `warehouses` | Depozit sau șantier. Fără ea, un șantier nou n-are unde primi marfă |
| Comandă manuală — canalul B | `purchase_orders` + `po_lines` | Canalul A (sub minim) și C (necesar din teren) există. B — comanda făcută de birou pentru o lucrare anume — nu. Analitica pe linie e obligatorie de la creare |

### 9.9 Documente (`/documente`)

`file_nodes` + `file_versions` — folder nou și încărcare de fișier pe Supabase Storage. Arborele se
desenează deja și folderul per UL se creează automat; ce lipsește e **punerea unui fișier în el**.
Upload simplu, într-o singură bucată — multipart rămâne în §7.

### 9.10 Costul introdus manual (`/cost`)

Factura de la furnizor care nu vine printr-o recepție (chirii, utilități, servicii) n-are azi drum.
`＋ Cost` pe registru, cu `source_type` nou în **`lib/cost-ledger.ts`** — regula 1, literal. Nu un
`insert` paralel. Refuzat pe o lună închisă, ca peste tot.

### 9.11 Editare și ștergere — politica

Ștergerea nu se implementează aproape nicăieri: un cost șters e o gaură într-un raport deja trimis.

| Stare | Ce se poate |
|---|---|
| Ciornă / nefolosit de nimeni | Editare completă, ștergere |
| Emis / aprobat / închis | Nimic. Corecția e un document nou (storno, versiune nouă, realocare) |
| Nomenclator folosit deja | Editare de etichetă, **dezactivare** (`active = false`), nu ștergere |

### 9.12 Ordinea de execuție

```
9.1 Nomenclatoare          ← primul, restul alege din el
      ↓
9.2 Contract → 9.3 Obiective → 9.5 UL + etape
      ↓                              ↓
9.6 Deviz și derivate          9.4 Cereri
      ↓
9.7 Resurse · 9.8 Stoc · 9.9 Documente · 9.10 Cost manual   ← independente între ele
```

Verificarea că blocul e gata: **un contract nou, dus cap-coadă până la factură, fără să atingi
seed-ul.** Client → contract cu componente și plafoane → obiectiv → cerere → rutare → lucrare →
deviz → etape → consum și pontaj → situație → raport lunar → factură.
