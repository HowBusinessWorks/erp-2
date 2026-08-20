/**
 * Blocul B2 — execuția lucrării (ecranul 22).
 *
 * Diferența față de un Gantt oarecare: aici bara nu arată doar cât timp durează
 * etapa, ci **cât s-a consumat din bugetul ei**. Un grafic care spune că etapa 3 e
 * la zi, dar nu spune că a mâncat 94% din buget în 40% din durată, e un grafic care
 * te minte politicos.
 *
 * Alerta la 80% există pentru că la 100% e prea târziu: materialul e comandat,
 * echipa e pe șantier, iar singura variantă rămasă e să ceri bani în plus.
 */

import type { Bani } from "./money";

export const ALERT_THRESHOLD = 80;

export type StageHealth = "neinceputa" | "in_grafic" | "atentie" | "depasita" | "incheiata";

export const STAGE_HEALTH_LABEL: Record<StageHealth, string> = {
  neinceputa: "Neîncepută",
  in_grafic: "În grafic",
  atentie: "Atenție",
  depasita: "Depășită",
  incheiata: "Încheiată",
};

export const STAGE_HEALTH_TONE: Record<StageHealth, "neutral" | "blueprint" | "fill" | "warn" | "over"> = {
  neinceputa: "neutral",
  in_grafic: "blueprint",
  atentie: "warn",
  depasita: "over",
  incheiata: "fill",
};

export type StageState = {
  budget: Bani;
  spent: Bani;
  /** procent consumat din buget; peste 100 = depășire */
  usedPercent: number;
  /** cât din durata etapei a trecut, în procente */
  elapsedPercent: number;
  health: StageHealth;
  /**
   * Semnalul care contează: banii se consumă mai repede decât trece timpul.
   * Pozitiv = ești în urmă cu munca față de bani. E singura cifră din ecranul ăsta
   * care prezice o depășire înainte să se întâmple.
   */
  drift: number;
  started: boolean;
  finished: boolean;
};

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100;
}

/**
 * Starea unei etape la o zi dată.
 *
 * `elapsedPercent` e cât din calendar a trecut; `usedPercent` e cât din bani s-a dus.
 * Când al doilea îl întrece pe primul cu mult, etapa se va termina în depășire chiar
 * dacă în clipa asta e sub buget — de asta `drift` e diferența lor, nu un raport.
 */
export function stageState(
  stage: {
    startDate: string | null;
    endDate: string | null;
    materialBudget: string | null;
    laborBudget: string | null;
  },
  spent: Bani,
  today: string,
  toBani: (v: string | null) => Bani,
): StageState {
  const budget = toBani(stage.materialBudget) + toBani(stage.laborBudget);
  const usedPercent = pct(spent, budget);

  const start = stage.startDate;
  const end = stage.endDate;
  const started = start !== null && start <= today;
  const finished = end !== null && end < today;

  let elapsedPercent = 0;
  if (start && end) {
    const a = Date.parse(start + "T00:00:00Z");
    const b = Date.parse(end + "T00:00:00Z");
    const now = Date.parse(today + "T00:00:00Z");
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      elapsedPercent = Math.max(0, Math.min(100, ((now - a) / (b - a)) * 100));
    } else if (finished) {
      elapsedPercent = 100;
    }
  }

  /*
   * Ordinea contează. „Atenție” e un avertisment despre o etapă CARE ÎNCĂ MERGE și
   * se apropie de plafon — mai e ceva de făcut în privința asta. O etapă terminată
   * la 98% nu e un avertisment, e o etapă care a intrat în buget; a o marca galben
   * ar toci exact semnalul pentru care există pragul.
   */
  let health: StageHealth;
  if (usedPercent > 100) health = "depasita";
  else if (finished) health = "incheiata";
  else if (started && usedPercent >= ALERT_THRESHOLD) health = "atentie";
  else if (started) health = "in_grafic";
  else health = "neinceputa";

  return {
    budget,
    spent,
    usedPercent,
    elapsedPercent,
    health,
    drift: usedPercent - elapsedPercent,
    started,
    finished,
  };
}

/* ───────────────────────── fereastra graficului ───────────────────────── */

/**
 * Intervalul acoperit de etape, lărgit la săptămâni întregi ca barele să nu se
 * termine la mijlocul unei coloane.
 */
export function ganttWindow(
  stages: { startDate: string | null; endDate: string | null }[],
  fallback: string,
): { from: string; to: string; days: number } {
  const dates = stages
    .flatMap((s) => [s.startDate, s.endDate])
    .filter((d): d is string => d !== null)
    .sort();

  const from = dates[0] ?? fallback;
  const to = dates[dates.length - 1] ?? fallback;

  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  const days = Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) + 1 : 1;

  return { from, to, days: Math.max(days, 1) };
}

/** Poziția și lățimea barei, în procente din fereastra graficului. */
export function barGeometry(
  stage: { startDate: string | null; endDate: string | null },
  window: { from: string; days: number },
): { left: number; width: number } | null {
  if (!stage.startDate || !stage.endDate) return null;
  const origin = Date.parse(window.from + "T00:00:00Z");
  const a = Date.parse(stage.startDate + "T00:00:00Z");
  const b = Date.parse(stage.endDate + "T00:00:00Z");
  if (!Number.isFinite(origin) || !Number.isFinite(a) || !Number.isFinite(b)) return null;

  const startDay = Math.round((a - origin) / 86_400_000);
  const span = Math.round((b - a) / 86_400_000) + 1;

  return {
    left: (startDay / window.days) * 100,
    width: (Math.max(span, 1) / window.days) * 100,
  };
}

/* ───────────────────────── închiderea lucrării ───────────────────────── */

export type ClosingCheck = {
  label: string;
  ok: boolean;
  detail: string;
};

/**
 * Verificările dinaintea închiderii.
 *
 * Nu blochează — o lucrare se poate închide și cu ele roșii, pentru că uneori chiar
 * așa se termină. Dar se afișează toate, ca decizia să fie luată cu ochii deschiși
 * și cu numele omului pe ea.
 */
export function closingChecks(input: {
  stagesTotal: number;
  stagesOver: number;
  budget: Bani;
  spent: Bani;
  committed: Bani;
  openBlockers: number;
  hasJournal: boolean;
}): ClosingCheck[] {
  return [
    {
      label: "Etape fără depășire",
      ok: input.stagesOver === 0,
      detail:
        input.stagesOver === 0
          ? `toate cele ${input.stagesTotal} etape sunt în buget`
          : `${input.stagesOver} din ${input.stagesTotal} au depășit bugetul`,
    },
    {
      label: "Costuri angajate lichidate",
      ok: input.committed === 0,
      detail:
        input.committed === 0
          ? "nicio comandă lansată și nerecepționată"
          : "există comenzi lansate care încă nu au intrat pe cost real",
    },
    {
      /*
       * Fără jurnal, verificarea asta nu poate fi bifată: absența blocajelor
       * notate nu e același lucru cu absența blocajelor. O bifă verde pe un
       * jurnal gol ar fi cea mai proastă informație de pe ecran.
       */
      label: "Fără blocaje deschise",
      ok: input.hasJournal && input.openBlockers === 0,
      detail: !input.hasJournal
        ? "nu se știe — nu există jurnal în care să fi fost notate"
        : input.openBlockers === 0
          ? "jurnalul nu semnalează blocaje"
          : `${input.openBlockers} zile cu blocaj notat în jurnal`,
    },
    {
      label: "Jurnal de șantier completat",
      ok: input.hasJournal,
      detail: input.hasJournal ? "există însemnări" : "nicio însemnare — lucrarea nu are istoric",
    },
  ];
}
