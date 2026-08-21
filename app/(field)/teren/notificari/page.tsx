import { Block, Empty, FieldBar, StaticRow } from "@/components/domain/FieldUI";
import type { IconName } from "@/components/domain/FieldIcons";
import { liveSignals } from "@/lib/notifications";
import type { SignalKind } from "@/lib/notification-types";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const ICON: Record<SignalKind, IconName> = {
  buget_80: "alert",
  delta_neumpluta: "list",
  sl_de_aprobat: "clip",
  pv_deschis: "pen",
  revizie_scadenta: "tool",
  contract_expira: "cal",
  stoc_minim: "box",
  solicitare_utilaj: "crane",
};

/**
 * Notificările — aceleași semnale ca la clopoțelul din birou, calculate din date la
 * fiecare încărcare. Nu există „marchează ca citit": n-ai ce citi, ai ce rezolva.
 * Semnalele care cer un drept pe care șeful de șantier nu-l are nu se calculează deloc.
 */
export default async function TerenNotificariPage() {
  const session = await requireSession();
  const signals = await liveSignals(session.role, session.firmId ?? null).catch(() => []);

  return (
    <>
      <FieldBar title="Notificări" back="/teren" sub={`${signals.length} de rezolvat`} />

      <div style={{ height: 16 }} />

      {signals.length === 0 ? (
        <Empty title="Nimic de rezolvat">
          Când apare ceva care te privește — o situație de verificat, un PV deschis, un
          utilaj scadent — apare aici.
        </Empty>
      ) : (
        <Block>
          {signals.map((signal, i) => (
            <StaticRow
              key={`${signal.kind}-${i}`}
              icon={ICON[signal.kind] ?? "info"}
              tone={signal.severity === "critic" ? "r" : signal.severity === "atentie" ? "a" : "n"}
              title={signal.title}
              meta={signal.body}
            />
          ))}
        </Block>
      )}
    </>
  );
}
