"use client";

import clsx from "clsx";
import {
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Trash2,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  addTicketComment,
  addTicketDocument,
  assignTicket,
  moveTicket,
  removeTicketDocument,
  updateTicketDescription,
} from "@/app/actions/tickets";
import { Badge, Button, Note, Select, Textarea, Trail } from "@/components/ui/primitives";
import type { Opt } from "@/lib/pickers";
import {
  EVENT_LABELS,
  URGENCY_LABELS,
  URGENCY_TONE,
  asTone,
  asUrgency,
  formatDay,
  formatSize,
  isOverdue,
  timeAgo,
  type TicketUrgency,
} from "@/lib/tickets";

import type { BoardStage } from "./TicketBoard";

export type DetailTicket = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  urgency: TicketUrgency;
  stageId: string | null;
  typeName: string | null;
  typeTone: string | null;
  objectiveName: string | null;
  partnerId: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  contractCode: string | null;
  createdAt: string;
  requestedByName: string | null;
};

export type DetailDocument = {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  authorName: string | null;
  createdAt: string;
};

export type DetailEvent = {
  id: string;
  kind: string;
  note: string | null;
  fromStageName: string | null;
  toStageName: string | null;
  authorName: string | null;
  createdAt: string;
};

export function TicketDetail({
  ticket,
  stages,
  documents,
  events,
  partners,
  users,
  canOperate,
}: {
  ticket: DetailTicket;
  stages: BoardStage[];
  documents: DetailDocument[];
  events: DetailEvent[];
  partners: Opt[];
  users: Opt[];
  canOperate: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ticket.description ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);

  const dirty = editing && draft !== (ticket.description ?? "");

  function close() {
    // Regula 4: nu se pierd modificări fără confirmare, nici într-un panou lateral.
    if (dirty && !window.confirm("Descrierea are modificări nesalvate. Închizi oricum?")) return;
    const next = new URLSearchParams(params.toString());
    next.delete("tichet");
    const qs = next.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, params]);

  useEffect(() => {
    setDraft(ticket.description ?? "");
    setEditing(false);
  }, [ticket.id, ticket.description]);

  /** Confirmarea discretă: „Salvat" lângă câmp, două secunde, fără buton de OK. */
  function flash(field: string) {
    setSaved(field);
    setTimeout(() => setSaved((v) => (v === field ? null : v)), 2000);
  }

  const currentStage = stages.find((s) => s.id === ticket.stageId);
  const urgency = asUrgency(ticket.urgency);

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0 || !canOperate) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      const data = new FormData();
      data.set("ticketId", ticket.id);
      data.set("name", file.name);
      data.set("mimeType", file.type);
      data.set("sizeBytes", String(file.size));
      await addTicketDocument(data);
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-40">
      <div aria-hidden className="absolute inset-0 bg-black/20" onClick={close} />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${ticket.code}: ${ticket.title}`}
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-rule bg-sheet shadow-float"
      >
        <header className="flex items-start gap-3 border-b border-rule px-5 py-4">
          <div className="min-w-0">
            <div className="tabular text-[11px] text-ink-3">{ticket.code}</div>
            <h2 className="narrow-title text-[19px] leading-tight text-ink">{ticket.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {currentStage ? (
                <Badge tone={asTone(currentStage.tone)} dot>
                  {currentStage.name}
                </Badge>
              ) : null}
              {ticket.typeName ? (
                <Badge tone={asTone(ticket.typeTone)}>{ticket.typeName}</Badge>
              ) : null}
              <Badge tone={URGENCY_TONE[urgency]}>{URGENCY_LABELS[urgency]}</Badge>
              {ticket.contractCode ? (
                <span className="text-[11.5px] text-ink-3">{ticket.contractCode}</span>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="ml-auto shrink-0"
            onClick={close}
            aria-label="Închide panoul"
          >
            <X aria-hidden className="size-4" />
          </Button>
        </header>

        <div className="min-h-0 grow space-y-6 overflow-y-auto px-5 py-5">
          {/* ── etapa ── */}
          <Row label="Etapă">
            <Select
              size="sm"
              aria-label="Etapa tichetului"
              value={ticket.stageId ?? ""}
              disabled={!canOperate}
              onChange={async (e) => {
                // Mutarea din panou trece prin aceeași acțiune ca drag-ul.
                await moveTicket({
                  ticketId: ticket.id,
                  toStageId: e.target.value,
                  beforeTicketId: null,
                });
                flash("stage");
                router.refresh();
              }}
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
            />
            <Saved on={saved === "stage"} />
          </Row>

          {/* ── descriere ── */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-narrow text-[13px] font-semibold text-ink">Descriere</h3>
              <span aria-hidden className="h-px grow bg-rule" />
              {canOperate && !editing ? (
                <Button type="button" variant="quiet" size="sm" onClick={() => setEditing(true)}>
                  Editează
                </Button>
              ) : null}
            </div>

            {editing ? (
              <div className="space-y-2">
                <Textarea
                  value={draft}
                  rows={5}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ce s-a constatat, unde, ce e de făcut…"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await updateTicketDescription({ ticketId: ticket.id, description: draft });
                      setBusy(false);
                      setEditing(false);
                      flash("desc");
                      router.refresh();
                    }}
                  >
                    Salvează
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setDraft(ticket.description ?? "");
                      setEditing(false);
                    }}
                  >
                    Renunț
                  </Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                {ticket.description || "Fără descriere."}
              </p>
            )}
          </section>

          {/* ── atribuire ── */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-narrow text-[13px] font-semibold text-ink">Atribuire</h3>
              <span aria-hidden className="h-px grow bg-rule" />
            </div>

            <Row label="Subcontractant">
              <Select
                size="sm"
                aria-label="Subcontractant"
                value={ticket.partnerId ?? ""}
                disabled={!canOperate}
                placeholder="Neatribuit"
                onChange={async (e) => {
                  await assignTicket({ ticketId: ticket.id, partnerId: e.target.value || null });
                  flash("partner");
                  router.refresh();
                }}
                options={[{ value: "", label: "Neatribuit" }, ...partners]}
              />
              <Saved on={saved === "partner"} />
            </Row>

            <Row label="Responsabil">
              <Select
                size="sm"
                aria-label="Responsabil intern"
                value={ticket.assigneeId ?? ""}
                disabled={!canOperate}
                placeholder="Neatribuit"
                onChange={async (e) => {
                  await assignTicket({ ticketId: ticket.id, assigneeId: e.target.value || null });
                  flash("assignee");
                  router.refresh();
                }}
                options={[{ value: "", label: "Neatribuit" }, ...users]}
              />
              <Saved on={saved === "assignee"} />
            </Row>

            <Row label="Termen">
              <input
                type="date"
                defaultValue={ticket.dueDate ?? ""}
                disabled={!canOperate}
                aria-label="Termen"
                onChange={async (e) => {
                  await assignTicket({ ticketId: ticket.id, dueDate: e.target.value || null });
                  flash("due");
                  router.refresh();
                }}
                className={clsx(
                  "h-[30px] rounded-ctl border border-rule-strong bg-sheet px-2.5 text-[12.5px] outline-none transition-[border-color,box-shadow] focus:border-blueprint focus:shadow-[0_0_0_3px_var(--acc-soft)]",
                  isOverdue(ticket.dueDate) ? "text-over" : "text-ink",
                )}
              />
              <Saved on={saved === "due"} />
            </Row>

            {ticket.objectiveName ? (
              <Row label="Obiectiv">
                <span className="text-[12.5px] text-ink-2">{ticket.objectiveName}</span>
              </Row>
            ) : null}
          </section>

          {/* ── documente ── */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <h3 className="font-narrow text-[13px] font-semibold text-ink">Documente</h3>
              <span aria-hidden className="h-px grow bg-rule" />
              <span className="tabular text-[11px] text-ink-3">{documents.length}</span>
            </div>

            <Note tone="warn" icon={<Paperclip aria-hidden className="size-3.5" />}>
              Fișierele nu se încarcă încă — se rețin doar numele, tipul și mărimea. Bucketul de
              stocare vine mai târziu.
            </Note>

            {documents.length > 0 ? (
              <ul className="space-y-1.5">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center gap-2.5 rounded-ctl border border-rule bg-sheet-2 px-3 py-2"
                  >
                    <DocIcon mime={doc.mimeType} />
                    <div className="min-w-0 grow">
                      <p className="truncate text-[12.5px] font-medium text-ink">{doc.name}</p>
                      <p className="tabular text-[11px] text-ink-3">
                        {formatSize(doc.sizeBytes)} · fișier neîncărcat ·{" "}
                        {doc.authorName ?? "—"} · {formatDay(new Date(doc.createdAt))}
                      </p>
                    </div>
                    {canOperate ? (
                      <Button
                        type="button"
                        variant="quiet"
                        size="sm"
                        aria-label={`Elimină ${doc.name}`}
                        onClick={async () => {
                          await removeTicketDocument(doc.id);
                          router.refresh();
                        }}
                      >
                        <Trash2 aria-hidden className="size-3.5" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {canOperate ? (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropping(true);
                  }}
                  onDragLeave={() => setDropping(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropping(false);
                    void addFiles(e.dataTransfer.files);
                  }}
                  className={clsx(
                    "w-full rounded-ctl border border-dashed p-4 text-center text-[12px] transition-colors",
                    dropping
                      ? "border-blueprint bg-blueprint-soft/50 text-blueprint-ink"
                      : "border-rule-strong text-ink-3 hover:border-ink-3 hover:text-ink-2",
                  )}
                >
                  {busy ? (
                    "Se adaugă…"
                  ) : (
                    <>
                      Trage fișiere aici sau apasă pentru a alege.
                      <span className="mt-1 block text-[11px] text-ink-3">
                        Documentele rămân pe tichet indiferent de etapă.
                      </span>
                    </>
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </>
            ) : null}
          </section>

          {/* ── istoric ── */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <h3 className="font-narrow text-[13px] font-semibold text-ink">Istoric</h3>
              <span aria-hidden className="h-px grow bg-rule" />
            </div>

            <Trail
              items={events.map((e, i) => ({
                title: eventTitle(e),
                meta: `${e.authorName ?? "Sistem"} · ${timeAgo(e.createdAt)}`,
                state: i === 0 ? ("now" as const) : ("done" as const),
              }))}
            />

            {canOperate ? (
              <div className="space-y-2 pt-1">
                <Textarea
                  value={comment}
                  rows={2}
                  placeholder="Scrie un comentariu…"
                  onChange={(e) => setComment(e.target.value)}
                />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={!comment.trim() || busy}
                  onClick={async () => {
                    const data = new FormData();
                    data.set("ticketId", ticket.id);
                    data.set("note", comment);
                    setBusy(true);
                    await addTicketComment(data);
                    setBusy(false);
                    setComment("");
                    router.refresh();
                  }}
                >
                  Comentează
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      </aside>
    </div>
  );
}

/* ───────────────────────── bucăți mici ───────────────────────── */

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-[11.5px] text-ink-2">{label}</span>
      <div className="flex min-w-0 grow items-center gap-2">{children}</div>
    </div>
  );
}

function Saved({ on }: { on: boolean }) {
  return on ? <span className="shrink-0 text-[11px] text-fill">Salvat</span> : null;
}

function DocIcon({ mime }: { mime: string | null }) {
  const cls = "size-4 shrink-0 text-ink-3";
  if (mime?.startsWith("image/")) return <ImageIcon aria-hidden className={cls} />;
  if (mime?.includes("sheet") || mime?.includes("excel") || mime?.includes("csv"))
    return <FileSpreadsheet aria-hidden className={cls} />;
  if (mime?.includes("pdf") || mime?.startsWith("text/"))
    return <FileText aria-hidden className={cls} />;
  return <FileIcon aria-hidden className={cls} />;
}

function eventTitle(e: DetailEvent): string {
  if (e.kind === "mutat")
    return `Mutat din ${e.fromStageName ?? "—"} în ${e.toStageName ?? "—"}`;
  if (e.kind === "comentariu") return e.note ?? "Comentariu";
  if (e.kind === "document") return `Document adăugat: ${e.note ?? ""}`.trim();
  return e.note || EVENT_LABELS[e.kind] || e.kind;
}
