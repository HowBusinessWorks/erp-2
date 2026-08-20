# Damina ERP — prototip

ERP intern pentru o firmă de construcții din România: 5 firme, contracte de mentenanță
multianuale, lucrări cu deviz, inspecții, intervenții, utilaje, gestiuni, costuri.

**Nu e un produs.** E un prototip funcțional, construit ca să (a) verificăm dacă
funcționalitățile modelate sunt cele potrivite și (b) să poată fi pus în fața unor programatori
ca specificație vie. Nu e gândit pentru date reale.

## Pornire

```bash
npm install
cp .env.local.example .env.local     # completează valorile
npm run db:push                      # împinge schema în Postgres (idempotent)
npm run seed                         # ~150s; ȘTERGE tot și repopulează
npm run dev                          # http://localhost:3000
```

Login: `admin@damina.ro`, parola din `SEED_PASSWORD`.

Contul de administrator comută perspectiva din bara de sus — PM, șef de șantier, devizier,
achiziții, magazie, manager de flotă. Așa se verifică în zece secunde că șeful de șantier nu
vede prețuri nicăieri.

> **`DATABASE_URL`:** host-ul direct `db.<ref>.supabase.co` e IPv6-only și nu e rutabil din multe
> rețele. Folosește șirul de conexiune al **pooler-ului** (`...pooler.supabase.com:5432`, cu
> utilizatorul `postgres.<ref>`).

## Unde te uiți

| Fișier | Ce conține |
|---|---|
| `PLAN.md` | planul complet: ce se construiește, ce **nu** se construiește și de ce, cele ~48 de tabele, cele 45 de ecrane, împărțirea pe sesiuni |
| `PROGRESS.md` | unde am ajuns, ce blochează, capcanele deja plătite. **Citește §0 și §1 înainte de orice.** |
| `CLAUDE.md` | regulile care nu se negociază în codul ăsta |
| `DaminaStructuraCapCoada FInal.md` | sursa de adevăr pentru business — toate regulile pe secțiuni (§4.3, §13.1, §18.1) |

Sursa de adevăr pentru regulile de business e `DaminaStructuraCapCoada FInal.md`, **în rădăcina
repo-ului**. Referințele de tip §4.2, §12, §13.1, §18.1.4 din cod și din plan trimit acolo.

## Stivă

O singură aplicație Next.js 16 (App Router, TypeScript), Tailwind 4, Drizzle + Postgres pe
Supabase, autentificare proprie pe cookie. Fără monorepo, fără worker, fără cozi, fără RLS,
fără teste. Toate absențele sunt deliberate și explicate în `PLAN.md` §0, cu ce ar trebui pus
în loc la producție în §7.

## Cele două reguli de arhitectură

1. **Fiecare leu trece prin `lib/cost-ledger.ts`.** Nimic altceva nu scrie în `cost_entries`.
   De asta depinde faptul că toate rapoartele se leagă între ele.
2. **Finanțarea e o legătură, nu un câmp.** Unitățile de lucru nu au `contract_id` pentru
   finanțare — au rânduri în `funding_allocations`. Fără asta, o lucrare finanțată din trei luni
   de Delta și mutările între contracte cer cod nou la fiecare caz.

## Ce e deja construit în altă parte

Portalul subcontractanților există ca aplicație separată și **nu se reconstruiește aici**.
Tabelele `packages` și `sl_lines` rămân în schemă ca punct de cusătură.
