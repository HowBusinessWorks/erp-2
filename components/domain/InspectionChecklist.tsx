"use client";

import { useState } from "react";

import { ChipPick } from "./FieldParts";

export type WizardPoint = {
  id: string;
  checkId: string | null;
  text: string;
  section: string | null;
  guidance: string | null;
  requiresPhoto: boolean;
  requiresValue: boolean;
  valueUnit: string | null;
};

/**
 * Un punct de verificare din fișă: OK · NOK · N/A.
 *
 * Fără notă pe punct — explicația problemei se scrie o singură dată, la pasul următor,
 * pentru toate punctele NOK deodată. Pe teren sunt 12 puncte pe ecran, nu unul.
 */
export function CheckRow({
  point,
  onStatus,
}: {
  point: WizardPoint;
  onStatus: (id: string, status: string) => void;
}) {
  const [status, setStatus] = useState("ok");

  return (
    <div className="f-li" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <input type="hidden" name="pointId" value={point.id} />
      <input type="hidden" name={`chk_${point.id}`} value={point.checkId ?? ""} />
      <input type="hidden" name={`txt_${point.id}`} value={point.text} />
      <div className="f-tx">
        <b>{point.text}</b>
        {point.guidance ? <span>{point.guidance}</span> : null}
      </div>
      <ChipPick
        name={`st_${point.id}`}
        value={status}
        onChange={(next) => {
          setStatus(next);
          onStatus(point.id, next);
        }}
        options={[
          { value: "ok", label: "OK" },
          { value: "nok", label: "Problemă" },
          { value: "na", label: "N/A" },
        ]}
      />
      {point.requiresValue && status !== "na" ? (
        <div className="f-fld">
          <label htmlFor={`val_${point.id}`}>
            Valoare măsurată{point.valueUnit ? ` (${point.valueUnit})` : ""}
          </label>
          <input id={`val_${point.id}`} name={`val_${point.id}`} inputMode="decimal" />
        </div>
      ) : null}
    </div>
  );
}
