import { Alert, Block, FieldBar, Row } from "@/components/domain/FieldUI";
import { myWorks } from "@/lib/field-data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * A doua atingere din cele trei: ce vrei să ceri.
 *
 * Patru drumuri, patru destinații diferite în spate. Ecranul ăsta există tocmai ca omul
 * să NU trebuiască să știe că materialele merg la magazie, utilajul la PM și transportul
 * la dispecerat — el alege ce-i lipsește, nu cui trimite.
 */
export default async function ComandaNouaPage({
  searchParams,
}: {
  searchParams: Promise<{ ul?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const works = await myWorks(session.id);
  const ul = sp.ul ?? works[0]?.id ?? "";
  const suffix = ul ? `?ul=${ul}` : "";

  return (
    <>
      <FieldBar title="Ce vrei să comanzi?" sub="Toate ajung în „Comenzi”" back="/teren/comenzi" />

      <div style={{ height: 16 }} />

      <Block>
        <Row
          href={`/teren/catalog${suffix}`}
          icon="box"
          tone="a"
          title="Materiale"
          meta="Alegi din catalog și pui în coș, ca la cumpărături"
        />
        <Row
          href={`/teren/catalog${ul ? `?ul=${ul}&tip=unelte` : "?tip=unelte"}`}
          icon="tool"
          tone="n"
          title="Unelte"
          meta="Tot din catalog. La primire și la predare semnezi un proces verbal"
        />
        <Row
          href={`/teren/utilaj-nou${suffix}`}
          icon="crane"
          tone="b"
          title="Utilaj"
          meta="Nacelă, miniexcavator, generator — trece prin aprobarea PM-ului"
        />
        <Row
          href={`/teren/transport-nou${suffix}`}
          icon="truck"
          tone="n"
          title="Transport"
          meta="Adus sau luat schelă, cărat moloz, mutat materiale, retur"
        />
      </Block>

      <Alert tone="b" icon="info" title="Toate ajung în același loc">
        Orice ceri — materiale, unelte, utilaj sau transport — apare în „Comenzi", cu starea ei.
        Materialele stau prima zi la magazie, care poate să le acopere din stoc înainte de comandă.
      </Alert>
    </>
  );
}
