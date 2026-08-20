import Link from "next/link";
import { eq } from "drizzle-orm";

import { Badge, PageHeader, SectionRule } from "@/components/ui/primitives";
import { Sheet, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { db } from "@/lib/db";
import { invoices, pvDocuments, requests } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Scheletele, declarate cu voce tare.
 *
 * Un prototip care se preface că are e-Factura e mai rău decât unul care n-are:
 * cineva construiește un plan de implementare pe o funcție care nu există. Ecranul
 * ăsta e complementul lui `PLAN.md` §7 — aceleași cusături, dar vizibile din
 * aplicație, cu numărul de documente care ar trece azi prin fiecare.
 */

type Skeleton = {
  name: string;
  what: string;
  /** ce face prototipul azi, concret */
  now: string;
  /** ce ar însemna în producție — textul din PLAN.md §7 */
  real: string;
  volume?: string;
  href?: string;
};

export default async function IntegrariPage() {
  await requireSession();

  const [issued, openPv, emailRequests] = await Promise.all([
    db.select({ id: invoices.id }).from(invoices),
    db.select({ id: pvDocuments.id }).from(pvDocuments).where(eq(pvDocuments.status, "semnat")),
    db.select({ id: requests.id }).from(requests).where(eq(requests.source, "email")),
  ]);

  const skeletons: Skeleton[] = [
    {
      name: "e-Factura (emitere)",
      what: "Trimiterea facturii către ANAF, în format UBL, și preluarea numărului de înregistrare.",
      now: "Câmpul `efactura_status` există pe factură și se poate marca manual. Nimic nu pleacă nicăieri.",
      real: "Generare UBL 2.1 · semnare · încărcare în SPV · polling pe starea mesajului · reîncercări pe erorile tranzitorii · arhivarea răspunsului lângă factură.",
      volume: `${issued.length} facturi în registru`,
      href: "/facturi",
    },
    {
      name: "SPV (intrare)",
      what: "Descărcarea facturilor primite de la furnizori și potrivirea lor cu comanda și recepția.",
      now: "Recepția se face din comandă, cu NIR. Factura furnizorului se introduce ca valoare, nu se descarcă.",
      real: "Matching 3-way: comandă ↔ NIR ↔ factură. Diferențele de preț și de cantitate devin excepții cu responsabil, nu ajustări tăcute.",
      href: "/receptii",
    },
    {
      name: "Conector Saga",
      what: "Exportul documentelor către contabilitate.",
      now: "Nimic. Registrul de cost e complet, dar se oprește la granița aplicației.",
      real: "Conector unidirecțional, ~8 tipuri de document, coadă de export cu erori vizibile — nu un fișier pe care îl regenerezi când te întreabă contabila.",
      href: "/cost",
    },
    {
      name: "Import Excel",
      what: "Nomenclator de produse, prețuri de furnizor, liste de obiective.",
      now: "Datele intră prin seed. Ecranele nu au buton de import.",
      real: "Mapare de coloane salvabilă, validare pe linie cu raport de erori, import idempotent pe cod — un import care se poate repeta fără să dubleze.",
    },
    {
      name: "Inbox email",
      what: "Tichetele care vin pe email de la client devin cereri, automat.",
      now: "Cererea are deja sursa `email` și se introduce manual cu sursa aia.",
      real: "Cutie poștală dedicată, parsare de subiect și atașamente, thread-ul devine istoricul cererii, răspunsul pleacă din aplicație.",
      volume: `${emailRequests.length} cereri marcate ca venite pe email`,
      href: "/cereri",
    },
    {
      name: "Hash de conținut la semnătura PV",
      what: "Dovada că PV-ul semnat e exact documentul care s-a semnat.",
      now: "Se rețin desenul semnăturii, IP-ul și ora. `content_hash` e gol.",
      real: "SHA-256 al PDF-ului la momentul semnării, plus semnare secvențială pe mai multe părți. Obligatoriu înainte de recepții.",
      volume: `${openPv.length} PV-uri semnate fără hash`,
      href: "/documente",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Evidență"
        title="Integrări și schelete"
        meta="Locurile unde prototipul se oprește intenționat. Fiecare rând e o cusătură din PLAN.md §7 — scrisă aici ca să n-o descopere nimeni la două luni după ce a planificat pe ea."
      />

      <p className="border-l-2 border-warn bg-warn-soft px-4 py-2.5 text-tiny text-warn">
        <span className="font-medium">Niciunul dintre rândurile de mai jos nu trimite date nicăieri.</span>{" "}
        Unde ecranele arată o stare de integrare, ea e pusă cu mâna în aplicație.
      </p>

      <div className="space-y-2">
        <SectionRule right={<span className="text-micro text-ink-3">{skeletons.length} cusături</span>}>
          Ce lipsește, pe rând
        </SectionRule>

        <Sheet>
          <Table>
            <THead>
              <TR>
                <TH>Zonă</TH>
                <TH>În prototip</TH>
                <TH>În producție</TH>
                <TH>Volum de azi</TH>
              </TR>
            </THead>
            <TBody>
              {skeletons.map((s) => (
                <TR key={s.name}>
                  <TD className="align-top">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{s.name}</span>
                      <Badge tone="warn">schelet</Badge>
                    </div>
                    <p className="mt-1 max-w-[22rem] text-micro leading-snug text-ink-2">{s.what}</p>
                  </TD>
                  <TD className="max-w-[20rem] align-top text-tiny leading-snug text-ink-2">
                    {s.now}
                  </TD>
                  <TD className="max-w-[24rem] align-top text-tiny leading-snug text-ink-2">
                    {s.real}
                  </TD>
                  <TD className="align-top text-tiny text-ink-2">
                    {s.volume ?? "—"}
                    {s.href ? (
                      <Link href={s.href} className="mt-1 block text-micro text-blueprint-ink underline decoration-dotted">
                        vezi ecranul
                      </Link>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Sheet>
      </div>

      <p className="max-w-prose text-tiny text-ink-2">
        Lista completă a cusăturilor, inclusiv cele care nu au ecran (RLS, PWA offline, upload
        multipart, cozi, intercompany, migrarea datelor), e în <code>PLAN.md</code> §7. Ce nu se
        construiește deloc și de ce — §0.
      </p>
    </div>
  );
}
