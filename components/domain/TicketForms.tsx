"use client";

import clsx from "clsx";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  archiveTicketType,
  createStage,
  createTicket,
  createTicketType,
  deleteStage,
  importStages,
  reorderStages,
  seedDefaultStages,
  updateStage,
  updateTicketType,
} from "@/app/actions/tickets";
import { Field, FormModal } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  SectionRule,
  Select,
} from "@/components/ui/primitives";
import type { Opt } from "@/lib/pickers";
import {
  STAGE_TONES,
  TONE_DOT,
  URGENCY_LABELS,
  URGENCY_ORDER,
  asTone,
  validateTicket,
} from "@/lib/tickets";

export type StageRow = {
  id: string;
  name: string;
  tone: string;
  isFinal: boolean;
  wipLimit: number | null;
  position: number;
  tickets: number;
};

export type TypeRow = {
  id: string;
  name: string;
  tone: string;
  icon: string | null;
  active: boolean;
};

/* ═══════════════════════ tichet nou ═══════════════════════ */

export function NewTicketForm({
  contractId,
  types,
  objectives,
  partners,
  users,
}: {
  contractId: string;
  types: Opt[];
  objectives: Opt[];
  partners: Opt[];
  users: Opt[];
}) {
  return (
    <FormModal
      label="Tichet nou"
      variant="primary"
      title="Tichet nou"
      subtitle="Intră în prima etapă a contractului, sus în coloană."
      action={createTicket}
      validate={validateTicket}
      submitLabel="Creează tichetul"
    >
      <input type="hidden" name="contractId" value={contractId} />
      <Field
        name="title"
        label="Titlu"
        required
        full
        placeholder="Tablou electric etaj 2 — siguranță declanșată"
      />
      <Field
        name="description"
        label="Descriere"
        kind="textarea"
        full
        rows={3}
        placeholder="Ce s-a constatat, unde, ce e de făcut."
      />
      <Field
        name="ticketTypeId"
        label="Tip"
        kind="select"
        options={[{ value: "", label: "Fără tip" }, ...types]}
      />
      <Field
        name="urgency"
        label="Urgență"
        kind="select"
        defaultValue="normala"
        options={URGENCY_ORDER.map((u) => ({ value: u, label: URGENCY_LABELS[u] }))}
      />
      <Field
        name="objectiveId"
        label="Obiectiv"
        kind="select"
        options={[{ value: "", label: "Fără obiectiv" }, ...objectives]}
      />
      <Field
        name="assignedPartnerId"
        label="Subcontractant"
        kind="select"
        options={[{ value: "", label: "Neatribuit" }, ...partners]}
      />
      <Field
        name="assigneeId"
        label="Responsabil"
        kind="select"
        options={[{ value: "", label: "Neatribuit" }, ...users]}
      />
      <Field name="dueDate" label="Termen" kind="date" />
    </FormModal>
  );
}

/* ═══════════════════════ etapele board-ului ═══════════════════════ */

export function StagesModal({
  contractId,
  stages,
  importable,
}: {
  contractId: string;
  stages: StageRow[];
  /** contractele care au deja etape, etichetate cu câte — sursa pentru import */
  importable: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState(stages.map((s) => s.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [source, setSource] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byId = new Map(stages.map((s) => [s.id, s]));
  const rows = order.map((id) => byId.get(id)).filter(Boolean) as StageRow[];

  function openModal() {
    setOrder(stages.map((s) => s.id));
    setMessage(null);
    setConfirming(null);
    setOpen(true);
  }

  async function commitOrder(next: string[]) {
    setOrder(next);
    await reorderStages({ contractId, stageIds: next });
    router.refresh();
  }

  return (
    <>
      <Button type="button" size="md" onClick={openModal}>
        Etape
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Etapele contractului"
        subtitle="Coloanele board-ului, în ordinea în care se lucrează. Trage de mâner ca să reordonezi."
        width="md"
      >
        <div className="space-y-2">
          {rows.length === 0 ? (
            <p className="text-tiny text-ink-2">Contractul nu are încă etape.</p>
          ) : null}

          {rows.map((stage) => (
            <div key={stage.id}>
              <div
                draggable
                onDragStart={() => setDragId(stage.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!dragId || dragId === stage.id) return;
                  const next = order.filter((id) => id !== dragId);
                  next.splice(next.indexOf(stage.id), 0, dragId);
                  setDragId(null);
                  void commitOrder(next);
                }}
                className={clsx(
                  "flex flex-wrap items-center gap-2 rounded-ctl border border-rule bg-sheet-2 p-2",
                  dragId === stage.id && "opacity-40",
                )}
              >
                <GripVertical aria-hidden className="size-4 shrink-0 cursor-grab text-ink-3" />
                <span
                  aria-hidden
                  className={clsx("size-2 shrink-0 rounded-full", TONE_DOT[asTone(stage.tone)])}
                />

                <form
                  action={updateStage}
                  onChange={(e) => {
                    // Tonul și comutatoarele se salvează la schimbare; numele, la ieșirea din câmp.
                    const target = e.target as HTMLElement;
                    if (target.tagName !== "INPUT" || (target as HTMLInputElement).type !== "text")
                      (e.currentTarget as HTMLFormElement).requestSubmit();
                  }}
                  onBlur={(e) => {
                    if ((e.target as HTMLElement).getAttribute("name") === "name")
                      e.currentTarget.requestSubmit();
                  }}
                  className="grid min-w-0 grow grid-cols-[minmax(0,1fr)_7rem_4.5rem_auto] items-center gap-2"
                >
                  <input type="hidden" name="stageId" value={stage.id} />
                  <Input
                    name="name"
                    defaultValue={stage.name}
                    aria-label="Numele etapei"
                    className="h-[30px] text-[12.5px]"
                  />
                  <Select
                    name="tone"
                    size="sm"
                    aria-label="Culoare"
                    defaultValue={asTone(stage.tone)}
                    options={STAGE_TONES}
                  />
                  <Input
                    name="wipLimit"
                    type="number"
                    min={0}
                    defaultValue={stage.wipLimit ?? ""}
                    placeholder="WIP"
                    aria-label="Limită de lucru simultan"
                    className="h-[30px] px-2 text-right text-[12.5px]"
                  />
                  <label className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-ink-2">
                    <input
                      type="checkbox"
                      name="isFinal"
                      value="1"
                      defaultChecked={stage.isFinal}
                      className="size-3.5 accent-blueprint"
                    />
                    finală
                  </label>
                </form>

                <span className="tabular text-[11px] text-ink-3">{stage.tickets} tichete</span>
                <Button
                  type="button"
                  variant="quiet"
                  size="sm"
                  aria-label={`Șterge etapa ${stage.name}`}
                  onClick={() => {
                    setMoveTo("");
                    setConfirming(confirming === stage.id ? null : stage.id);
                  }}
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </Button>
              </div>

              {confirming === stage.id ? (
                <div className="mt-1 flex flex-wrap items-center gap-2 rounded-ctl border border-over-line bg-over-soft px-3 py-2 text-[12px] text-over">
                  {stage.tickets > 0 ? (
                    <>
                      <span>
                        Cele {stage.tickets} tichete se mută în:
                      </span>
                      <span className="w-44">
                      <Select
                        size="sm"
                        aria-label="Etapa în care se mută tichetele"
                        value={moveTo}
                        placeholder="Alege etapa"
                        onChange={(e) => setMoveTo(e.target.value)}
                        options={[
                          { value: "", label: "Alege etapa" },
                          ...rows
                            .filter((s) => s.id !== stage.id)
                            .map((s) => ({ value: s.id, label: s.name })),
                        ]}
                      />
                      </span>
                    </>
                  ) : (
                    <span>Etapa e goală. Se șterge definitiv.</span>
                  )}
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={stage.tickets > 0 && !moveTo}
                    onClick={async () => {
                      setBusy(true);
                      await deleteStage({ stageId: stage.id, moveToStageId: moveTo || null });
                      setBusy(false);
                      setConfirming(null);
                      router.refresh();
                    }}
                  >
                    Șterge etapa
                  </Button>
                  <Button type="button" size="sm" onClick={() => setConfirming(null)}>
                    Renunț
                  </Button>
                </div>
              ) : null}
            </div>
          ))}

          <form
            action={async (data) => {
              await createStage(data);
              (document.getElementById("stage-new-name") as HTMLInputElement | null)?.form?.reset();
              router.refresh();
            }}
            className="grid grid-cols-[auto_minmax(0,1fr)_7rem_auto_auto] items-center gap-2 rounded-ctl border border-dashed border-rule-strong p-2"
          >
            <input type="hidden" name="contractId" value={contractId} />
            <Plus aria-hidden className="size-4 shrink-0 text-ink-3" />
            <Input
              id="stage-new-name"
              name="name"
              placeholder="Etapă nouă"
              aria-label="Numele etapei noi"
              className="h-[30px] text-[12.5px]"
            />
            <Select
              name="tone"
              size="sm"
              aria-label="Culoare"
              defaultValue="neutral"
              options={STAGE_TONES}
            />
            <label className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-ink-2">
              <input type="checkbox" name="isFinal" value="1" className="size-3.5 accent-blueprint" />
              finală
            </label>
            <Button type="submit" size="sm">
              Adaugă etapă
            </Button>
          </form>

          <div className="pt-2">
            <SectionRule>Importă dintr-un contract</SectionRule>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="w-64">
                <Select
                  size="sm"
                  aria-label="Contractul din care se importă etapele"
                  value={source}
                  placeholder="Alege contractul"
                  onChange={(e) => setSource(e.target.value)}
                  options={[{ value: "", label: "Alege contractul" }, ...importable]}
                />
              </span>
              <Button
                type="button"
                size="sm"
                disabled={!source || busy}
                onClick={async () => {
                  const before = stages.length;
                  setBusy(true);
                  await importStages({ toContractId: contractId, fromContractId: source });
                  setBusy(false);
                  setMessage(
                    before === 0
                      ? "Etapele au fost importate."
                      : "Etapele s-au adăugat; cele care existau deja au fost sărite.",
                  );
                  router.refresh();
                }}
              >
                Importă
              </Button>
              {message ? <span className="text-[11.5px] text-fill">{message}</span> : null}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

/* ═══════════════════════ tipuri de tichet ═══════════════════════ */

export function TicketTypesModal({
  types,
  contractId,
  label = "Tipuri",
}: {
  types: TypeRow[];
  contractId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const active = types.filter((t) => t.active);
  const archived = types.filter((t) => !t.active);

  return (
    <>
      <Button type="button" size="md" onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Tipuri de tichet"
        subtitle="Nomenclator comun tuturor contractelor. Tipurile arhivate nu se mai oferă la creare."
        width="sm"
      >
        <div className="space-y-2">
          {active.map((type) => (
            <form
              key={type.id}
              action={updateTicketType}
              onChange={(e) => {
                const target = e.target as HTMLElement;
                if (target.tagName !== "INPUT") (e.currentTarget as HTMLFormElement).requestSubmit();
              }}
              onBlur={(e) => {
                if ((e.target as HTMLElement).tagName === "INPUT") e.currentTarget.requestSubmit();
              }}
              className="grid grid-cols-[minmax(0,1fr)_7rem_8rem_auto] items-center gap-2 rounded-ctl border border-rule bg-sheet-2 p-2"
            >
              <input type="hidden" name="typeId" value={type.id} />
              {contractId ? <input type="hidden" name="contractId" value={contractId} /> : null}
              <Input
                name="name"
                defaultValue={type.name}
                aria-label="Numele tipului"
                className="h-[30px] text-[12.5px]"
              />
              <Select
                name="tone"
                size="sm"
                aria-label="Culoare"
                defaultValue={asTone(type.tone)}
                options={STAGE_TONES}
              />
              <Input
                name="icon"
                defaultValue={type.icon ?? ""}
                placeholder="iconiță lucide"
                aria-label="Numele iconiței"
                className="h-[30px] text-[12.5px]"
              />
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={async () => {
                  await archiveTicketType({ typeId: type.id, active: false, contractId });
                  router.refresh();
                }}
              >
                Arhivează
              </Button>
            </form>
          ))}

          {active.length === 0 ? (
            <EmptyState
              title="Niciun tip activ"
              hint="Adaugă cel puțin unul — tipul e ce face board-ul lizibil dintr-o privire."
            />
          ) : null}

          <form
            action={async (data) => {
              await createTicketType(data);
              router.refresh();
            }}
            className="grid grid-cols-[auto_minmax(0,1fr)_7rem_auto] items-center gap-2 rounded-ctl border border-dashed border-rule-strong p-2"
          >
            {contractId ? <input type="hidden" name="contractId" value={contractId} /> : null}
            <Plus aria-hidden className="size-4 shrink-0 text-ink-3" />
            <Input
              name="name"
              placeholder="Tip nou"
              aria-label="Numele tipului nou"
              className="h-[30px] text-[12.5px]"
            />
            <Select
              name="tone"
              size="sm"
              aria-label="Culoare"
              defaultValue="neutral"
              options={STAGE_TONES}
            />
            <Button type="submit" size="sm">
              Adaugă tip
            </Button>
          </form>

          {archived.length > 0 ? (
            <div className="pt-2">
              <SectionRule>Arhivate</SectionRule>
              <div className="mt-2 space-y-1.5">
                {archived.map((type) => (
                  <div
                    key={type.id}
                    className="flex items-center gap-2 rounded-ctl border border-rule px-3 py-1.5 text-[12.5px] text-ink-3"
                  >
                    {type.name}
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      className="ml-auto"
                      onClick={async () => {
                        await archiveTicketType({ typeId: type.id, active: true, contractId });
                        router.refresh();
                      }}
                    >
                      Reactivează
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

/* ═══════════════════════ contract fără etape ═══════════════════════ */

export function StageSetup({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="primary"
      size="md"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await seedDefaultStages(contractId);
        setBusy(false);
        router.refresh();
      }}
    >
      Folosește setul implicit
    </Button>
  );
}
