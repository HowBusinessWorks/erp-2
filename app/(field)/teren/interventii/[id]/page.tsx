import { notFound } from "next/navigation";
import { and, asc, eq, sql as raw } from "drizzle-orm";

import {
  addInterventionHours,
  addInterventionMaterial,
  addInterventionNote,
  finishIntervention,
  startIntervention,
} from "@/app/actions/mentenanta";
import { Icon } from "@/components/domain/FieldIcons";
import { ActionButton } from "@/components/domain/FieldKit";
import { BottomSheet, PhotoDeck, QtyStepper } from "@/components/domain/FieldParts";
import {
  Alert,
  Block,
  ButtonLink,
  Buttons,
  Empty,
  FieldBar,
  Label,
  Pill,
  Row,
  StaticRow,
} from "@/components/domain/FieldUI";
import { db } from "@/lib/db";
import { products, stock, warehouses } from "@/lib/db/schema";
import { SOURCE_LABEL, interventionThread } from "@/lib/field-data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Fișa unei intervenții, ca fir de lucru.
 *
 * Ce s-a întâmplat pe fișă e o CRONOLOGIE, nu patru liste paralele: „am demontat carcasa"
 * la 9:15, două ore la 11:40, cureaua la 12:00. Puse în trei tabele separate, aceleași
 * evenimente s-ar citi ca trei rapoarte care nu se leagă; puse pe un fir, se citește
 * povestea zilei, care e exact ce caută cineva care deschide fișa a doua zi.
 *
 * Fișa are trei stări și fiecare permite altceva:
 *   planificată → un singur buton, „Începe";
 *   în lucru    → se poate adăuga orice;
 *   finalizată  → nu se mai adaugă nimic, niciodată.
 */
export default async function InterventieDetaliuPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const data = await interventionThread(id);
  if (!data || data.unit.kind === "inspectie") notFound();

  const planned = data.unit.status === "propusa" || data.unit.status === "planificata";
  const done = data.unit.status === "finalizata" || data.unit.status === "anulata";
  const open = !planned && !done;

  const [teamWarehouse] = await db
    .select()
    .from(warehouses)
    .where(
      and(
        eq(warehouses.kind, "echipa"),
        eq(warehouses.active, true),
        raw`(${warehouses.keeperId} = ${session.id} or ${warehouses.keeperId} is null)`,
      ),
    )
    .orderBy(raw`${warehouses.keeperId} nulls last`)
    .limit(1);

  const stockLines = open && teamWarehouse
    ? await db
        .select({ id: products.id, name: products.name, unit: products.unit, quantity: stock.quantity })
        .from(stock)
        .innerJoin(products, eq(stock.productId, products.id))
        .where(and(eq(stock.warehouseId, teamWarehouse.id), raw`${stock.quantity} > 0`))
        .orderBy(asc(products.name))
        .limit(20)
    : [];

  const tone = done ? "g" : open ? "a" : "r";

  return (
    <>
      <FieldBar
        title={data.unit.title}
        sub={`${data.unit.code} · ${data.objective?.name ?? "—"}`}
        back="/teren/mentenanta"
      >
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Pill tone={tone}>{done ? "Finalizată" : open ? "În lucru" : "Neîncepută"}</Pill>
          {data.unit.sourceTag ? <Pill tone="on-dark">{SOURCE_LABEL[data.unit.sourceTag]}</Pill> : null}
          {data.sourceUnit ? <Pill tone="on-dark">{data.sourceUnit.code}</Pill> : null}
        </div>
      </FieldBar>

      <div style={{ height: 16 }} />

      {planned ? (
        <Alert tone="a" icon="cal" title="Intervenție planificată">
          Fișa e goală. Când ajungi acolo, apasă „Începe" și scrii ce ai făcut.
        </Alert>
      ) : null}
      {done ? (
        <Alert tone="g" icon="check" title="Intervenție finalizată">
          Fișa e închisă. Nu se mai pot adăuga înregistrări.
        </Alert>
      ) : null}

      <Block>
        <StaticRow icon="file" title="Contract" right={<Pill tone="n">{data.contractLabel ?? "—"}</Pill>} />
        <StaticRow icon="pin" title="Obiectiv" meta={data.objective?.name ?? "—"} />
        <StaticRow icon="user" title="Persoana" meta={data.responsibleName ?? "—"} />
        {data.subcontractorName ? (
          <StaticRow icon="users" title="Subcontractant" meta={data.subcontractorName} />
        ) : null}
      </Block>

      {data.sourceUnit ? (
        <>
          <Label>De unde a pornit</Label>
          <Block>
            <Row
              href={`/teren/inspectii/${data.sourceUnit.id}`}
              icon="clip"
              title={`Inspecția ${data.sourceUnit.code}`}
              meta={data.sourceUnit.title}
            />
          </Block>
        </>
      ) : null}

      {/* ─────────── firul de lucru ─────────── */}
      <Label>Jurnal de lucru</Label>
      {data.events.length === 0 ? (
        <Empty icon="pen" title="Nicio înregistrare încă">
          {planned ? "Începe intervenția, apoi scrie ce ai făcut." : "Scrie prima însemnare mai jos."}
        </Empty>
      ) : (
        <div className="f-feed">
          {data.events.map((event) => (
            <div key={event.key} className={event.kind === "ore" ? "f-bub f-ore" : "f-bub"}>
              <div className="f-h">
                <Icon name={event.kind === "ore" ? "clock" : "pen"} />
                <b>{event.author ?? "—"}</b>
                <time>
                  {event.at.toLocaleString("ro-RO", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <p>{event.text}</p>
              {event.amount ? (
                <div style={{ marginTop: 8 }}>
                  <Pill tone="a">{event.amount}</Pill>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {open ? (
        <BottomSheet label="Adaugă în jurnal" title="Ce ai făcut acum?" icon="pen">
          <form action={addInterventionNote}>
            <input type="hidden" name="workUnitId" value={id} />
            <Block>
              <div className="f-fld">
                <textarea
                  name="text"
                  required
                  autoFocus
                  placeholder="Ex: am demontat carcasa, rotorul e blocat cu praf"
                />
              </div>
            </Block>
            <PhotoDeck />
            <div className="f-bts">
              <ActionButton label="Adaugă în jurnal" variant="pri" small={false} icon="check" />
            </div>
          </form>
        </BottomSheet>
      ) : null}

      {/* ─────────── ore ─────────── */}
      <Label>
        Timp lucrat{" "}
        <span style={{ float: "right", textTransform: "none", letterSpacing: 0 }}>
          {data.totalHours.toFixed(1)} h
        </span>
      </Label>
      {open ? (
        <BottomSheet label="Adaugă ore" title="Cât ai lucrat?" icon="clock">
          <form action={addInterventionHours}>
            <input type="hidden" name="workUnitId" value={id} />
            <Block>
              <div className="f-li">
                <div className="f-tx">
                  <b>Ore</b>
                  <span>pe om</span>
                </div>
                <QtyStepper name="hours" defaultValue={2} ariaLabel="Ore" />
              </div>
              <div className="f-li">
                <div className="f-tx">
                  <b>Minute</b>
                </div>
                <QtyStepper name="minutes" defaultValue={0} step={15} max={45} ariaLabel="Minute" />
              </div>
              <div className="f-li">
                <div className="f-tx">
                  <b>Câți oameni</b>
                  <span>inclusiv tu</span>
                </div>
                <QtyStepper name="people" defaultValue={1} ariaLabel="Oameni" />
              </div>
              <div className="f-fld">
                <label htmlFor="qualification">Calificare</label>
                <select id="qualification" name="qualification" defaultValue="muncitor">
                  <option value="muncitor">Muncitor</option>
                  <option value="electrician">Electrician</option>
                  <option value="instalator">Instalator</option>
                </select>
              </div>
              <div className="f-fld">
                <label htmlFor="note">Pentru ce</label>
                <input id="note" name="note" placeholder="Opțional" />
              </div>
            </Block>
            <div className="f-bts">
              <ActionButton label="Adaugă orele" variant="pri" small={false} icon="check" />
            </div>
          </form>
        </BottomSheet>
      ) : null}

      {/* ─────────── materiale ─────────── */}
      <Label>Materiale folosite</Label>
      {data.materials.length === 0 ? (
        <Block>
          <StaticRow icon="box" title="Niciun material trecut încă" />
        </Block>
      ) : (
        <Block>
          {data.materials.map((material) => (
            <div key={material.name} className="f-li">
              <div className="f-tx">
                <b>{material.name}</b>
                <span>{material.unit}</span>
              </div>
              {/* cantitate, nu valoare */}
              <span className="f-num">{material.quantity}</span>
            </div>
          ))}
        </Block>
      )}

      {open ? (
        stockLines.length === 0 ? (
          <Buttons>
            <ButtonLink href={`/teren/necesar?ul=${id}`} icon="plus" small>
              Gestiunea e goală — cere material
            </ButtonLink>
          </Buttons>
        ) : (
          <BottomSheet label="Adaugă material" title="Ce ai consumat?" icon="box">
            <form action={addInterventionMaterial}>
              <input type="hidden" name="workUnitId" value={id} />
              <input type="hidden" name="warehouseId" value={teamWarehouse?.id ?? ""} />
              <Block>
                {stockLines.map((line) => (
                  <div key={line.id} className="f-li">
                    <input type="hidden" name="productId" value={line.id} />
                    <div className="f-tx">
                      <b>{line.name}</b>
                      <span>
                        în gestiune {Number(line.quantity)} {line.unit}
                      </span>
                    </div>
                    <QtyStepper
                      name={`qty_${line.id}`}
                      defaultValue={0}
                      max={Number(line.quantity)}
                      ariaLabel={line.name}
                    />
                  </div>
                ))}
              </Block>
              <div className="f-bts">
                <ActionButton label="Scade din gestiune" variant="pri" small={false} icon="check" />
              </div>
            </form>
          </BottomSheet>
        )
      ) : null}

      {/* ─────────── poze ─────────── */}
      {data.media.length > 0 ? (
        <>
          <Label>Poze</Label>
          <div className="f-blk f-p">
            <div className="f-phs">
              {data.media.map((item) => (
                <div key={item.id} className="f-ph">
                  <Icon name={item.kind === "video" ? "video" : "img"} />
                  <span className="f-tg">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {/* ─────────── acțiunea zilei ─────────── */}
      {planned ? (
        <form action={startIntervention}>
          <input type="hidden" name="workUnitId" value={id} />
          <div className="f-submit">
            <p className="f-hint">După ce începi, poți scrie pe fișă oricând.</p>
            <ActionButton label="Începe intervenția" variant="pri" small={false} icon="check" />
          </div>
        </form>
      ) : null}

      {open ? (
        <form action={finishIntervention}>
          <input type="hidden" name="workUnitId" value={id} />
          <Label>Închide fișa</Label>
          <Block>
            <div className="f-fld">
              <label htmlFor="summary">Cum s-a terminat</label>
              <textarea id="summary" name="summary" placeholder="Ex: ventilator repornit, vibrațiile au dispărut" />
            </div>
          </Block>
          <div className="f-submit">
            <p className="f-hint">După finalizare nu se mai pot adăuga înregistrări.</p>
            <ActionButton label="Finalizează intervenția" variant="grn" small={false} icon="check" />
          </div>
        </form>
      ) : null}
    </>
  );
}
