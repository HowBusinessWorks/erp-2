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
    <form action={requestEquipment}>
      <input type="hidden" name="activity" value={activity} />
      <input type="hidden" name="days" value={days} />

      <h2 className="f-q">Ce ai de făcut?</h2>
      <p className="f-qs">Ceri capacitatea. Biroul alege bucata care e liberă.</p>

      <div className="f-chz">
        {ACTIVITIES.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="activityPick"
              checked={activity === option}
              onChange={() => setActivity(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>

      <div className="f-lbl">Câte zile</div>
      <div className="f-chz">
        {DAYS.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="daysPick"
              checked={days === option}
              onChange={() => setDays(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>

      <div className="f-lbl">Detalii</div>
      <div className="f-blk">
        {objectives.length ? (
          <div className="f-fld">
            <label htmlFor="objectiveId">Unde</label>
            <select id="objectiveId" name="objectiveId" defaultValue={objectives[0]?.id ?? ""}>
              {objectives.map((objective) => (
                <option key={objective.id} value={objective.id}>
                  {objective.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="f-fld">
          <label htmlFor="note">Observație</label>
          <textarea id="note" name="note" placeholder="Ex: nacelă articulată, minimum 12 m" />
        </div>
      </div>

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
    <form action={reportEquipmentIssue}>
      <input type="hidden" name="equipmentId" value={equipmentId} />

      <h2 className="f-q">Ce ai observat?</h2>
      <p className="f-qs">Rămâne legată de utilaj, nu se pierde într-un mesaj.</p>

      <div className="f-lbl">Care utilaj</div>
      <div className="f-blk">
        {equipment.map((item) => (
          <label key={item.id} className="f-li" style={{ cursor: "pointer" }}>
            <input
              type="radio"
              name="equipmentPick"
              checked={equipmentId === item.id}
              onChange={() => setEquipmentId(item.id)}
              style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
            />
            <span className="f-cir" style={equipmentId === item.id ? { borderColor: "#10151F" } : undefined}>
              {equipmentId === item.id ? (
                <i
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "#10151F",
                    display: "block",
                  }}
                />
              ) : null}
            </span>
            <span className="f-tx">
              <b>{item.name}</b>
              <span>{item.code}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="f-blk">
        <div className="f-fld">
          <label htmlFor="title">Ce ai observat</label>
          <textarea id="title" name="title" required placeholder="Ex: pierde ulei pe brațul stâng" />
        </div>
      </div>

      <SubmitBar
        label="Trimite observația"
        hint="Biroul o poate transforma în reparație fără să retasteze nimic."
      />
    </form>
  );
}
