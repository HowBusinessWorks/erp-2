import { notFound } from "next/navigation";

import { confirmOrderArrival } from "@/app/actions/teren-comenzi";
import { ActionButton } from "@/components/domain/FieldKit";
import { Timeline } from "@/components/domain/FieldParts";
import {
  Alert,
  Block,
  FieldBar,
  Label,
  Pill,
  StaticRow,
  shortDate,
} from "@/components/domain/FieldUI";
import { ORDER_STEPS, URGENCY_LABEL, orderDetail } from "@/lib/field-data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Urmărirea unei comenzi.
 *
 * Treptele nu vin dintr-o tabelă de istoric: statusul comenzii spune la a câta treaptă e,
 * iar treptele sunt fixe. Un jurnal de tranziții ar fi a doua sursă de adevăr pentru
 * același lucru, care se desincronizează la prima recepție parțială făcută manual.
 *
 * Cantități pe linii, niciun preț. Ce a costat comanda e treaba achiziției.
 */
export default async function ComandaDetaliuPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  const data = await orderDetail(id);
  if (!data) notFound();

  const { po, lines, step, stepLabel } = data;
  const arrived = step >= 5;

  return (
    <>
      <FieldBar title={`Comanda ${po.code}`} sub={`${lines.length} poziții`} back="/teren/comenzi">
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Pill tone={arrived ? "g" : "am-solid"}>{stepLabel}</Pill>
          {po.urgency === "urgent" ? <Pill tone="r">Urgent</Pill> : null}
        </div>
      </FieldBar>

      <div style={{ height: 16 }} />

      {po.warehouseCheckUntil && step === 1 ? (
        <Alert tone="b" icon="clock" title="E la magazie">
          Magazia are 24 de ore să o acopere din stocul existent. Dacă nu poate, pleacă la comandă.
        </Alert>
      ) : null}

      <Label>Unde e comanda</Label>
      <div className="f-blk f-p">
        <Timeline steps={ORDER_STEPS} current={step} />
      </div>

      <Label>Ce ai cerut</Label>
      <Block>
        {lines.map(({ line, product }) => (
          <div key={line.id} className="f-li">
            <div className="f-tx">
              <b>{product.name}</b>
              <span>
                {Number(line.receivedQty) > 0
                  ? `primit ${Number(line.receivedQty)} din ${Number(line.quantity)}`
                  : product.code}
              </span>
            </div>
            {/* cantitate, nu valoare */}
            <span className="f-num">
              {Number(line.quantity)} {product.unit}
            </span>
          </div>
        ))}
      </Block>

      <Label>Livrarea</Label>
      <Block>
        <StaticRow
          icon="cal"
          title="Când îți trebuie"
          right={<Pill tone="n">{po.neededBy ? shortDate(po.neededBy) : "—"}</Pill>}
        />
        <StaticRow icon="pin" title="Unde se descarcă" meta={po.dropPoint ?? "—"} />
        <StaticRow
          icon="alert"
          title="Urgență"
          right={<Pill tone={po.urgency === "urgent" ? "r" : "n"}>{URGENCY_LABEL[po.urgency]}</Pill>}
        />
        {po.fieldNote ? <StaticRow icon="pen" title="Mențiuni" meta={po.fieldNote} /> : null}
      </Block>

      {step >= 3 && !arrived ? (
        <form action={confirmOrderArrival}>
          <input type="hidden" name="poId" value={po.id} />
          <div className="f-submit">
            <p className="f-hint">
              Confirmarea e doar un semnal. Recepția și NIR-ul le face magazia.
            </p>
            <ActionButton label="A sosit pe șantier" variant="grn" small={false} icon="check" />
          </div>
        </form>
      ) : null}
    </>
  );
}
