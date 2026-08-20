# Damina ERP (erp-2)

Prototip de ERP pentru o firmă de construcții din România. **Nu e un produs.** Scopul e să arate
bine, să funcționeze cap-coadă cu date credibile și să poată fi pus în fața unui programator ca
specificație vie.

## La început de sesiune

1. Citește **`PROGRESS.md` §1 și §2** — unde suntem și ce blochează. Atât, nu tot fișierul.
2. Citește din **`PLAN.md`** doar secțiunea blocului la care lucrezi.

Sursa de adevăr pentru regulile de business:
`C:\Users\firul\Downloads\DaminaStructuraCapCoada FInal (1).md` (referințele de tip §11, §18.1 din
`PLAN.md` trimit acolo).

## La final de sesiune

Actualizează `PROGRESS.md`: tabelul din §1, plus o intrare în §6. **Fapte, nu narațiune.**
Fișierul nu are voie să treacă de 300 de linii — când se apropie, comprimă istoricul vechi.

## Regulile care nu se negociază

1. **Fiecare leu trece prin `lib/cost-ledger.ts`.** Nimic altceva nu scrie în `cost_entries`.
   Cost nou = `source_type` nou în funcția existentă, nu un `insert` paralel.
2. **Finanțarea e o legătură, nu un câmp.** Unitățile de lucru nu au `contract_id` pentru
   finanțare — au rânduri în `funding_allocations`.
3. **Banii:** `numeric(14,2)` în Postgres, întreg (în bani) în TypeScript. **Niciodată `float`.**
4. **Modalele nu se închid la click în afara lor.** Doar buton explicit, cu confirmare dacă există
   modificări nesalvate. S-au pierdut date reale așa.
5. **Izolarea prețului.** Șeful de șantier nu vede lei nicăieri — nici la situații de lucrări, nici
   la utilaje. Verificat în `lib/permissions.ts`, care e **singura** poartă de permisiuni.
6. **Teren: maximum 3 atingeri** de la „Azi" până la trimis. ＋ costă una, alegerea acțiunii încă
   una — deci ecranul are voie la o singură atingere, cea de Trimite.

## Convenții

- Cod și DB în engleză; termeni intraductibili în română fără diacritice (`deviz`, `pontaj`, `nir`,
  `situatie_lucrari`). **UI 100% română cu diacritice**, scrisă direct în componente — fără dicționar i18n.
- O singură aplicație Next.js, foldere, nu pachete. Schema toată în `lib/db/schema.ts`.
- Fără migrări numerotate — schema se regenerează.
- Componente noi de UI intră în `components/ui/`. Verifică întâi ce există; nu construi al doilea `Table`.

## Ce NU se construiește

RLS, roluri Postgres, 2FA, monorepo, worker/cozi, PWA offline, upload multipart, teste, CI,
audit cu triggere, ANAF/e-Factura, conector Saga, import Excel, inbox email, WMS.
**Și portalul de subcontractanți — există deja ca aplicație separată.**

Lista completă cu motive: `PLAN.md` §0. Ce înseamnă fiecare în producție: `PLAN.md` §7.

## Eficiență

Nu construi abstracții, fișiere sau configurări de care nu are nevoie nimeni acum. Dar nu tăia
funcționalitate ca să pari eficient — ecranele din `PLAN.md` §3 sunt livrabilul.

Dacă ceva nu e specificat în `PLAN.md`, **nu inventa în tăcere**: notează în `PROGRESS.md` §4 și
alege varianta cea mai simplă și mai ușor de schimbat.
