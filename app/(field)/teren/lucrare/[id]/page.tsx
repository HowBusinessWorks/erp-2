import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/domain/FieldIcons";
import {
  Alert,
  Block,
  ButtonLink,
  Buttons,
  Empty,
  FieldBar,
  Label,
  Pill,
  Progress,
  Row,
  StaticRow,
  shortDate,
} from "@/components/domain/FieldUI";
import { workDetail } from "@/lib/field-data";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Lucrarea, pe patru file: Jurnal · Echipă · Depozit · Acte.
 *
 * Meniul de linkuri de până acum trimitea în patru locuri diferite, fiecare cu bara lui
 * de sus și cu drumul lui de întoarcere. Filele țin totul sub același antet: omul e la
 * Bloc A2 toată ziua, nu are de ce să reintre în Bloc A2 de fiecare dată.
 *
 * Filele sunt LINKURI, nu stare de client: fiecare filă e o adresă, deci se poate trimite
 * pe WhatsApp și se întoarce unde trebuie la „Înapoi".
 */

const TABS = [
  { value: "jurnal", label: "Jurnal" },
  { value: "echipa", label: "Echipă" },
  { value: "depozit", label: "Depozit" },
  { value: "acte", label: "Acte" },
];

export default async function LucrareFieldPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ f?: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === sp.f) ? sp.f! : "jurnal";

  const data = await workDetail(id);
  if (!data || data.unit.kind !== "lucrare") notFound();

  const pendingSl = data.situations.reduce((sum, s) => sum + Number(s.pending), 0);
  const lowStock = data.siteStock.filter(
    (line) => Number(line.stock.quantity) <= Number(line.product.minStock),
  );

  return (
    <>
      <FieldBar
        title={data.unit.title}
        sub={`${data.objective?.name ?? "—"}${data.responsibleName ? ` · ${data.responsibleName}` : ""}`}
        back="/teren/locuri"
      >
        {data.currentStage ? (
          <>
            <div
              style={{
                marginTop: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700 }}>
                Etapa {data.currentStage.position} din {data.stages.length} — {data.currentStage.name}
              </span>
              <Pill tone="am-solid">{data.percent}%</Pill>
            </div>
            <div style={{ marginTop: 9 }}>
              <Progress percent={data.percent} onDark />
            </div>
          </>
        ) : null}
      </FieldBar>

      <div className="f-ftabs">
        {TABS.map((option) => (
          <Link
            key={option.value}
            href={`/teren/lucrare/${id}?f=${option.value}`}
            className={option.value === tab ? "f-on" : undefined}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {/* ─────────────────────────── JURNAL ─────────────────────────── */}
      {tab === "jurnal" ? (
        <>
          <Label>Etapele lucrării</Label>
          <Block>
            <Row
              href={`/teren/lucrare/${id}/inainte-dupa?slot=inainte`}
              icon="img"
              tone={data.beforeCount > 0 ? "g" : "n"}
              title="ÎNAINTE — poze de start"
              meta={`${data.beforeCount} ${data.beforeCount === 1 ? "fișier" : "fișiere"}`}
              right={<Pill tone={data.beforeCount > 0 ? "g" : "n"}>{data.beforeCount > 0 ? "Complet" : "Gol"}</Pill>}
            />
            {data.stages.map((stage) => {
              const current = data.currentStage?.id === stage.id;
              const entries = data.journal.filter((j) => j.entry.text.includes(stage.name)).length;
              return (
                <StaticRow
                  key={stage.id}
                  icon="file"
                  tone={current ? "a" : stage.endDate ? "g" : "n"}
                  title={`${stage.position}. ${stage.name}`}
                  meta={`${shortDate(stage.startDate)} → ${shortDate(stage.endDate)}${entries ? ` · ${entries} însemnări` : ""}`}
                  right={<Pill tone={current ? "a" : stage.endDate ? "g" : "n"}>{current ? "În lucru" : stage.endDate ? "Gata" : "Neînceput"}</Pill>}
                />
              );
            })}
            <Row
              href={`/teren/lucrare/${id}/inainte-dupa?slot=dupa`}
              icon="img"
              tone={data.afterCount > 0 ? "g" : "n"}
              title="DUPĂ — poze finale"
              meta={`${data.afterCount} ${data.afterCount === 1 ? "fișier" : "fișiere"}`}
              right={<Pill tone={data.afterCount > 0 ? "g" : "n"}>{data.afterCount > 0 ? "Complet" : "Gol"}</Pill>}
            />
          </Block>

          <Buttons>
            <ButtonLink href={`/teren/jurnal?ul=${id}`} icon="pen" variant="pri">
              Înregistrare nouă în jurnal
            </ButtonLink>
          </Buttons>

          <Label>Ultimele înregistrări</Label>
          {data.journal.length === 0 ? (
            <Empty icon="pen" title="Jurnalul e gol">
              Prima însemnare o scrii cu butonul de mai sus.
            </Empty>
          ) : (
            <div className="f-feed">
              {data.journal.map(({ entry, author }) => (
                <div key={entry.id} className="f-bub">
                  <div className="f-h">
                    <Icon name="pen" />
                    <b>{author?.name ?? "—"}</b>
                    <time>{shortDate(entry.day)}</time>
                  </div>
                  <p>{entry.text}</p>
                  {entry.blocker ? (
                    <div style={{ marginTop: 8 }}>
                      <Pill tone="r">{entry.blocker}</Pill>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {/* ─────────────────────────── ECHIPĂ ─────────────────────────── */}
      {tab === "echipa" ? (
        <>
          <Label>Ai mei, azi</Label>
          <Block>
            <StaticRow
              icon="clock"
              tone={data.teamHoursToday > 0 ? "g" : "r"}
              title="Ore pontate azi"
              meta={data.teamHoursToday > 0 ? "Pontajul e trimis" : "Nu s-a pontat încă"}
              right={<Pill tone={data.teamHoursToday > 0 ? "g" : "r"}>{data.teamHoursToday} h</Pill>}
            />
          </Block>
          <Buttons>
            <ButtonLink href={`/teren/pontaj/echipa?ul=${id}`} icon="users" variant="pri">
              Pontează echipa
            </ButtonLink>
          </Buttons>

          <Label>Firmele de azi</Label>
          {data.firmsToday.length === 0 ? (
            <Empty icon="users" title="Nicio firmă pontată azi">
              Dacă a venit vreun subcontractant, treci-l — altfel ora lui rămâne doar în cuvântul lui.
            </Empty>
          ) : (
            <Block>
              {data.firmsToday.map(({ row, partner }) => (
                <StaticRow
                  key={row.id}
                  icon="users"
                  title={partner.name}
                  meta={`${row.peopleCount} oameni · ${row.fromTime ?? "—"}–${row.toTime ?? "—"}${row.note ? ` · ${row.note}` : ""}`}
                  right={<Pill tone="a">{row.peopleCount * Number(row.hoursPerPerson)} ore-om</Pill>}
                />
              ))}
            </Block>
          )}
          <Buttons>
            <ButtonLink href={`/teren/pontaj/firme?ul=${id}`} icon="pen" variant="out">
              Modifică pontajul firmelor
            </ButtonLink>
          </Buttons>

          {data.firmsMonth.length > 0 ? (
            <>
              <Label>Luna aceasta pe lucrare</Label>
              <Block>
                {data.firmsMonth.map((firm) => (
                  <StaticRow
                    key={firm.name}
                    icon="users"
                    title={firm.name}
                    right={<Pill tone="n">{Number(firm.manHours)} ore-om</Pill>}
                  />
                ))}
              </Block>
              <Alert tone="b" icon="info" title="De ce contează">
                Orele astea se compară cu situațiile de lucrări trimise la sfârșit de lună.
              </Alert>
            </>
          ) : null}
        </>
      ) : null}

      {/* ─────────────────────────── DEPOZIT ─────────────────────────── */}
      {tab === "depozit" ? (
        <>
          {lowStock.length > 0 ? (
            <Alert
              tone="r"
              icon="alert"
              title={`${lowStock.length} ${lowStock.length === 1 ? "material pe terminate" : "materiale pe terminate"}`}
              action={
                <ButtonLink href={`/teren/catalog?ul=${id}`} icon="cart" variant="pri" small>
                  Comandă acum
                </ButtonLink>
              }
            >
              {lowStock.map((line) => line.product.name).join(" · ")}
            </Alert>
          ) : null}

          <Label>Ce ai pe stoc aici</Label>
          {data.siteStock.length === 0 ? (
            <Empty icon="box" title="Gestiunea șantierului e goală">
              Comandă materiale sau cere transfer din depozitul central.
            </Empty>
          ) : (
            <Block>
              {data.siteStock.map((line) => {
                const low = Number(line.stock.quantity) <= Number(line.product.minStock);
                return (
                  <StaticRow
                    key={line.stock.id}
                    icon={low ? "alert" : "box"}
                    tone={low ? "r" : "n"}
                    title={line.product.name}
                    meta={low ? "Stoc mic — cere completare" : line.warehouse.name}
                    /* cantități, nu bani */
                    right={
                      <Pill tone={low ? "r" : "n"}>
                        {Number(line.stock.quantity)} {line.product.unit}
                      </Pill>
                    }
                  />
                );
              })}
            </Block>
          )}

          <Buttons>
            <ButtonLink href={`/teren/consum?ul=${id}`} icon="clip" variant="pri">
              Fă bon de consum
            </ButtonLink>
            <ButtonLink href={`/teren/catalog?ul=${id}`} icon="cart" variant="out">
              Comandă materiale
            </ButtonLink>
          </Buttons>

          <Label>Unelte primite aici</Label>
          {data.tools.length === 0 ? (
            <Block>
              <StaticRow icon="tool" title="Nicio unealtă pe lucrare" />
            </Block>
          ) : (
            <Block>
              {data.tools.map(({ tool, protocol }) => (
                <Row
                  key={protocol.id}
                  href={`/teren/pv/unelte/${protocol.id}`}
                  icon="tool"
                  tone={protocol.status === "deschis" ? "a" : "g"}
                  title={tool.name}
                  meta={`${tool.code} · primită ${shortDate(protocol.handoverDate)}`}
                  right={
                    <Pill tone={protocol.status === "deschis" ? "a" : "g"}>
                      {protocol.status === "deschis" ? "PV deschis" : "Predată"}
                    </Pill>
                  }
                />
              ))}
            </Block>
          )}
        </>
      ) : null}

      {/* ─────────────────────────── ACTE ─────────────────────────── */}
      {tab === "acte" ? (
        <>
          <Label>Situații de lucrări</Label>
          {data.situations.length === 0 ? (
            <Block>
              <StaticRow icon="list" title="Nicio situație declarată" />
            </Block>
          ) : (
            <Block>
              {data.situations.map(({ situatie, partner, pending }) => (
                <Row
                  key={situatie.id}
                  href={`/teren/situatii/${situatie.id}`}
                  icon="list"
                  tone={Number(pending) > 0 ? "r" : "g"}
                  title={`${partner?.name ?? "—"} — ${situatie.month}/${situatie.year}`}
                  meta={Number(pending) > 0 ? `${pending} poziții de verificat` : "Verificat"}
                  right={
                    <Pill tone={Number(pending) > 0 ? "r" : "g"}>
                      {Number(pending) > 0 ? "De verificat" : "La zi"}
                    </Pill>
                  }
                />
              ))}
            </Block>
          )}
          {pendingSl > 0 ? (
            <Alert tone="r" icon="alert" title={`${pendingSl} poziții încă neverificate`}>
              O situație neverificată strică o factură. Zero prețuri pe ecranul de verificare.
            </Alert>
          ) : null}

          <Label>Procese verbale</Label>
          {data.pvRows.length === 0 ? (
            <Block>
              <StaticRow icon="pen" title="Niciun proces verbal pe lucrare" />
            </Block>
          ) : (
            <Block>
              {data.pvRows.map(({ doc, template }) => (
                <StaticRow
                  key={doc.id}
                  icon={doc.status === "semnat" ? "check" : "pen"}
                  tone={doc.status === "semnat" ? "g" : "a"}
                  title={template?.name ?? doc.code}
                  meta={`${doc.code} · ${shortDate(doc.createdAt.toISOString().slice(0, 10))}`}
                  right={
                    <Pill tone={doc.status === "semnat" ? "g" : "a"}>
                      {doc.status === "semnat" ? "Semnat" : doc.status === "trimis" ? "Trimis" : "Ciornă"}
                    </Pill>
                  }
                />
              ))}
            </Block>
          )}

          <Buttons>
            <ButtonLink href={`/teren/pv/nou?ul=${id}`} icon="plus" variant="pri">
              Proces verbal nou
            </ButtonLink>
          </Buttons>
        </>
      ) : null}
    </>
  );
}
