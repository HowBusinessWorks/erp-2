"use client";

import { useRef, useState } from "react";

import { saveTemplateFields } from "@/app/actions/documents";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import {
  A4_RATIO,
  FIELD_KIND_LABEL,
  SUGGESTED_FIELDS,
  type TemplateField,
  type TemplateFieldKind,
} from "@/lib/pv-templates";

/**
 * Ecranul 33 — poziționarea câmpurilor pe șablon.
 *
 * Foaia din stânga e A4 la scară. Un clic pe ea așază câmpul selectat acolo unde ai
 * dat clic, în procente — nu în puncte. Asta e tot ce trebuie să înțeleagă cineva
 * despre ecranul ăsta: coordonatele sunt procentuale, deci șablonul supraviețuiește
 * rescanării PDF-ului la altă rezoluție.
 */
export function TemplateEditor({
  templateId,
  templateKind,
  initialFields,
  canEdit,
}: {
  templateId: string;
  templateKind: string;
  initialFields: TemplateField[];
  canEdit: boolean;
}) {
  const [fields, setFields] = useState<TemplateField[]>(initialFields);
  const [selected, setSelected] = useState<string | null>(initialFields[0]?.key ?? null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const suggestions = SUGGESTED_FIELDS[templateKind] ?? [];
  const unused = suggestions.filter((s) => !fields.some((f) => f.key === s.key));

  const placeAt = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canEdit || !selected) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setFields((prev) =>
      prev.map((f) =>
        f.key === selected
          ? { ...f, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
          : f,
      ),
    );
  };

  const addField = (key: string) => {
    const s = suggestions.find((x) => x.key === key);
    if (!s) return;
    const field: TemplateField = { ...s, x: 8, y: 10 + fields.length * 6, width: 30 };
    setFields((prev) => [...prev, field]);
    setSelected(field.key);
  };

  const removeField = (key: string) => {
    setFields((prev) => prev.filter((f) => f.key !== key));
    if (selected === key) setSelected(null);
  };

  const patch = (key: string, change: Partial<TemplateField>) =>
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...change } : f)));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* ─────────── foaia ─────────── */}
      <div>
        <div
          ref={sheetRef}
          onClick={placeAt}
          style={{ aspectRatio: `1 / ${A4_RATIO}` }}
          className={`relative w-full max-w-lg border border-rule-strong bg-white ${
            canEdit && selected ? "cursor-crosshair" : ""
          }`}
        >
          {/* marginile tipografice, ca reper vizual */}
          <div className="pointer-events-none absolute inset-[6%] border border-dashed border-rule" />

          {fields.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelected(f.key);
              }}
              style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.width}%` }}
              className={`absolute truncate rounded-[2px] border px-1 py-0.5 text-left text-[0.5rem] leading-tight ${
                selected === f.key
                  ? "border-blueprint bg-blueprint-soft text-blueprint-ink"
                  : f.kind === "semnatura"
                    ? "border-fill bg-fill-soft text-fill"
                    : "border-rule-strong bg-sunk text-ink-2"
              }`}
            >
              {f.label}
            </button>
          ))}

          {fields.length === 0 ? (
            <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-8 text-center text-tiny text-ink-3">
              Adaugă un câmp din dreapta, apoi dă clic pe foaie ca să-l așezi.
            </p>
          ) : null}
        </div>

        <p className="mt-2 max-w-lg text-micro text-ink-3">
          Foaia e A4 la scară. Poziția se salvează în procente, nu în puncte: același șablon
          funcționează și dacă PDF-ul e rescanat la altă rezoluție sau tipărit pe alt format.
        </p>
      </div>

      {/* ─────────── panoul de câmpuri ─────────── */}
      <div className="space-y-4">
        {canEdit && unused.length ? (
          <Field label="Adaugă un câmp" hint="Sugestiile vin din felul PV-ului. Poți să nu le folosești.">
            <Select
              value=""
              onChange={(e) => {
                addField(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                Alege câmpul
              </option>
              {unused.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {fields.length === 0 ? (
          <p className="text-tiny text-ink-3">Niciun câmp așezat pe șablon.</p>
        ) : (
          <div className="space-y-2">
            {fields.map((f) => (
              <div
                key={f.key}
                className={`border px-3 py-2 ${
                  selected === f.key ? "border-blueprint bg-blueprint-soft" : "border-rule-strong bg-sheet"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelected(f.key)}
                  className="flex w-full items-baseline justify-between gap-2 text-left"
                >
                  <span className="truncate text-tiny font-medium text-ink">{f.label}</span>
                  <span className="shrink-0 text-micro text-ink-3">{FIELD_KIND_LABEL[f.kind]}</span>
                </button>

                {selected === f.key && canEdit ? (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <label className="block">
                        <span className="eyebrow mb-0.5 block">X %</span>
                        <Input
                          type="number"
                          value={f.x}
                          step="0.1"
                          onChange={(e) => patch(f.key, { x: Number(e.target.value) })}
                          className="h-7 text-tiny"
                        />
                      </label>
                      <label className="block">
                        <span className="eyebrow mb-0.5 block">Y %</span>
                        <Input
                          type="number"
                          value={f.y}
                          step="0.1"
                          onChange={(e) => patch(f.key, { y: Number(e.target.value) })}
                          className="h-7 text-tiny"
                        />
                      </label>
                      <label className="block">
                        <span className="eyebrow mb-0.5 block">Lățime %</span>
                        <Input
                          type="number"
                          value={f.width}
                          step="1"
                          onChange={(e) => patch(f.key, { width: Number(e.target.value) })}
                          className="h-7 text-tiny"
                        />
                      </label>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Select
                        value={f.kind}
                        onChange={(e) =>
                          patch(f.key, { kind: e.target.value as TemplateFieldKind })
                        }
                        size="xs"
                        className="w-32"
                      >
                        {Object.entries(FIELD_KIND_LABEL).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </Select>
                      <button
                        type="button"
                        onClick={() => removeField(f.key)}
                        className="text-micro text-over hover:underline"
                      >
                        scoate câmpul
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {canEdit ? (
          <form action={saveTemplateFields} className="border-t border-rule pt-3">
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="fields" value={JSON.stringify(fields)} />
            <Button type="submit" variant="primary" className="w-full">
              Salvează șablonul
            </Button>
          </form>
        ) : (
          <p className="border-t border-rule pt-3 text-micro text-ink-3">
            Doar rolurile cu drept pe nomenclatoare pot modifica șabloanele.
          </p>
        )}
      </div>
    </div>
  );
}
