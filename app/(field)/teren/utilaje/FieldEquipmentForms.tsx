"use client";

import { useState } from "react";

import { reportEquipmentIssue, requestEquipment } from "@/app/actions/equipment";
import { SubmitBar } from "@/components/domain/FieldKit";

/**
 * T7 — solicitarea și observația, în două atingeri.
 *
 * Regula bugetului de atingeri: ＋ costă una, alegerea acțiunii încă una. Aici
 * ecranul are voie la UNA singură. De asta activitatea și zilele sunt butoane mari
 * cu valoare prestabilită, nu câmpuri de completat: alegi doar ce diferă de obișnuit,
 * apoi Trimite.
 *
 * Nicăieri pe ecranul ăsta nu apar lei. Șeful de șantier cere o capacitate, nu
 * cumpără o oră de excavator.
 */

const ACTIVITIES = ["Săpătură", "Ridicare", "Transport", "Compactare", "Demolare", "Foraj"];
const DAYS = [1, 2, 3, 5];

export function RequestEquipmentForm({
  objectives,
}: {
  objectives: { id: string; name: string }[];
}) {
  const [activity, setActivity] = useState(ACTIVITIES[0]);
  const [days, setDays] = useState(2);

  return (
    <form action={requestEquipment} className="space-y-5">
      <input type="hidden" name="activity" value={activity} />
      <input type="hidden" name="days" value={days} />

      <div>
        <div className="eyebrow mb-2">Ce am de făcut</div>
        <div className="grid grid-cols-2 gap-2">
          {ACTIVITIES.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setActivity(a)}
              className={`h-12 rounded-[4px] border text-[0.9375rem] font-medium ${
                activity === a
                  ? "border-blueprint bg-blueprint text-white"
                  : "border-rule-strong bg-sheet text-ink"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="eyebrow mb-2">Câte zile</div>
        <div className="grid grid-cols-4 gap-2">
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`h-12 rounded-[4px] border text-[0.9375rem] font-medium tabular ${
                days === d
                  ? "border-blueprint bg-blueprint text-white"
                  : "border-rule-strong bg-sheet text-ink"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {objectives.length ? (
        <label className="block">
          <span className="eyebrow mb-1 block">Unde</span>
          <select
            name="objectiveId"
            defaultValue={objectives[0]?.id ?? ""}
            className="h-12 w-full rounded-[4px] border border-rule-strong bg-sheet px-3 text-[0.9375rem] text-ink"
          >
            {objectives.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block">
        <span className="eyebrow mb-1 block">Observație</span>
        <textarea
          name="note"
          rows={2}
          placeholder="Opțional"
          className="w-full rounded-[4px] border border-rule-strong bg-sheet px-3 py-2 text-[0.9375rem] leading-relaxed text-ink"
        />
      </label>

      <SubmitBar
        label="Trimite solicitarea"
        hint="Biroul alege utilajul concret și îți spune care vine. Tu ceri capacitatea, nu bucata."
      />
    </form>
  );
}

export function ReportIssueForm({
  equipment,
}: {
  equipment: { id: string; code: string; name: string }[];
}) {
  const [equipmentId, setEquipmentId] = useState(equipment[0]?.id ?? "");

  return (
    <form action={reportEquipmentIssue} className="space-y-5">
      <input type="hidden" name="equipmentId" value={equipmentId} />

      <div>
        <div className="eyebrow mb-2">Care utilaj</div>
        <div className="space-y-2">
          {equipment.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setEquipmentId(e.id)}
              className={`flex w-full items-baseline justify-between gap-3 rounded-[4px] border px-4 py-3 text-left ${
                equipmentId === e.id
                  ? "border-blueprint bg-blueprint-soft"
                  : "border-rule-strong bg-sheet"
              }`}
            >
              <span className="text-[0.9375rem] font-medium text-ink">{e.name}</span>
              <span className="shrink-0 text-tiny text-ink-2">{e.code}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="eyebrow mb-1 block">Ce am observat</span>
        <textarea
          name="title"
          rows={3}
          required
          placeholder="Pierde ulei pe brațul stâng"
          className="w-full rounded-[4px] border border-rule-strong bg-sheet px-3 py-2 text-[0.9375rem] leading-relaxed text-ink"
        />
      </label>

      <SubmitBar
        label="Trimite observația"
        hint="Rămâne legată de utilaj. Biroul o poate transforma în reparație fără să retasteze nimic."
      />
    </form>
  );
}
