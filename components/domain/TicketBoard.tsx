"use client";

import clsx from "clsx";
import {
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  MoreHorizontal,
  Paperclip,
  User2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";

import { Badge } from "@/components/ui/primitives";
import { moveTicket } from "@/app/actions/tickets";
import {
  TONE_DOT,
  URGENCY_BAR,
  URGENCY_LABELS,
  URGENCY_TONE,
  asTone,
  asUrgency,
  daysIn,
  formatDay,
  isOverdue,
  type TicketUrgency,
} from "@/lib/tickets";

export type BoardStage = {
  id: string;
  name: string;
  tone: string;
  isFinal: boolean;
  wipLimit: number | null;
};

export type BoardTicket = {
  id: string;
  code: string;
  title: string;
  urgency: TicketUrgency;
  stageId: string | null;
  boardOrder: number;
  typeName: string | null;
  typeTone: string | null;
  partnerName: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  stageEnteredAt: string | null;
  documents: number;
};

/** Unde ar cădea cardul tras: deasupra unui card anume, sau la coada coloanei. */
type DropAt = { stageId: string; beforeId: string | null };

export function TicketBoard({
  stages,
  allStages,
  tickets,
  canOperate,
}: {
  /** coloanele vizibile — etapele finale lipsesc dacă filtrul nu le cere */
  stages: BoardStage[];
  /** toate etapele contractului: meniul „Mută în" trebuie să ajungă și la Rezolvat */
  allStages: BoardStage[];
  tickets: BoardTicket[];
  canOperate: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [rows, setRows] = useState(tickets);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<DropAt | null>(null);

  // Board-ul se re-randează din server după fiecare mutare; starea locală îl urmează.
  useEffect(() => setRows(tickets), [tickets]);

  function openTicket(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("tichet", id);
    router.push(`?${next.toString()}`, { scroll: false });
  }

  function clearDrag() {
    setDragId(null);
    setDropAt(null);
  }

  /** `explicitId` vine din meniul „⋯", unde nu s-a tras nimic. */
  async function drop(at: DropAt, explicitId?: string) {
    const id = explicitId ?? dragId;
    clearDrag();
    if (!id || !canOperate) return;

    const before = rows;
    const moving = before.find((t) => t.id === id);
    if (!moving) return;
    if (moving.stageId === at.stageId && at.beforeId === id) return;

    // Mutare optimistă: cardul sare imediat, serverul confirmă după.
    const rest = before.filter((t) => t.id !== id);
    const column = rest.filter((t) => t.stageId === at.stageId);
    const index = at.beforeId ? column.findIndex((t) => t.id === at.beforeId) : -1;
    const reordered = [...column];
    const moved = { ...moving, stageId: at.stageId };
    if (index >= 0) reordered.splice(index, 0, moved);
    else reordered.push(moved);

    setRows([
      ...rest.filter((t) => t.stageId !== at.stageId),
      ...reordered.map((t, i) => ({ ...t, boardOrder: i })),
    ]);

    try {
      await moveTicket({ ticketId: id, toStageId: at.stageId, beforeTicketId: at.beforeId });
      router.refresh();
    } catch {
      setRows(before);
    }
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4">
      <div className="flex min-h-[60vh] items-start gap-3">
        {stages.map((stage) => {
          const column = rows
            .filter((t) => t.stageId === stage.id)
            .sort((a, b) => a.boardOrder - b.boardOrder);
          const over = stage.wipLimit !== null && column.length > stage.wipLimit;
          const hot = dropAt?.stageId === stage.id;

          return (
            <section
              key={stage.id}
              aria-label={`${stage.name}, ${column.length} tichete`}
              className="w-[300px] shrink-0"
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setDropAt({ stageId: stage.id, beforeId: null });
              }}
              onDrop={(e) => {
                e.preventDefault();
                void drop({ stageId: stage.id, beforeId: null });
              }}
            >
              <header className="sticky top-0 z-10 flex items-center gap-2 bg-paper/95 px-1 pb-2 pt-1 backdrop-blur">
                <span
                  aria-hidden
                  className={clsx("size-2 shrink-0 rounded-full", TONE_DOT[asTone(stage.tone)])}
                />
                <h3 className="truncate font-narrow text-[13px] font-semibold text-ink">
                  {stage.name}
                </h3>
                <span
                  className={clsx(
                    "tabular ml-auto rounded-chip bg-sunk px-1.5 py-0.5 text-[11px]",
                    over ? "text-over" : "text-ink-2",
                  )}
                  title={stage.wipLimit !== null ? `Limită de lucru: ${stage.wipLimit}` : undefined}
                >
                  {column.length}
                  {stage.wipLimit !== null ? `/${stage.wipLimit}` : ""}
                </span>
              </header>

              <div
                className={clsx(
                  "flex min-h-[120px] flex-col gap-2 rounded-sheet border p-2 transition-colors duration-[120ms]",
                  hot ? "border-blueprint-line bg-blueprint-soft/40" : "border-rule bg-sunk/50",
                )}
              >
                {column.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    stages={allStages}
                    currentStageId={stage.id}
                    canOperate={canOperate}
                    dragging={dragId === ticket.id}
                    indicator={
                      dropAt?.stageId === stage.id && dropAt.beforeId === ticket.id ? "top" : null
                    }
                    onOpen={() => openTicket(ticket.id)}
                    onDragStart={() => setDragId(ticket.id)}
                    onDragEnd={clearDrag}
                    onDragOverHalf={(half) => {
                      if (!dragId) return;
                      const list = column;
                      const at = list.findIndex((t) => t.id === ticket.id);
                      const beforeId =
                        half === "top" ? ticket.id : (list[at + 1]?.id ?? null);
                      setDropAt({ stageId: stage.id, beforeId });
                    }}
                    onDrop={() => {
                      if (dropAt) void drop(dropAt);
                    }}
                    onMoveTo={(stageId) => void drop({ stageId, beforeId: null }, ticket.id)}
                  />
                ))}

                {column.length === 0 ? (
                  <p className="py-6 text-center text-xs text-ink-3">Nimic aici</p>
                ) : null}

                {hot && dropAt?.beforeId === null && column.length > 0 ? (
                  <span aria-hidden className="h-0.5 rounded-full bg-blueprint" />
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────────── cardul ───────────────────────────── */

function TicketCard({
  ticket,
  stages,
  currentStageId,
  canOperate,
  dragging,
  indicator,
  onOpen,
  onDragStart,
  onDragEnd,
  onDragOverHalf,
  onDrop,
  onMoveTo,
}: {
  ticket: BoardTicket;
  stages: BoardStage[];
  currentStageId: string;
  canOperate: boolean;
  dragging: boolean;
  indicator: "top" | null;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverHalf: (half: "top" | "bottom") => void;
  onDrop: () => void;
  onMoveTo: (stageId: string) => void;
}) {
  const urgency = asUrgency(ticket.urgency);
  const stale = daysIn(ticket.stageEnteredAt);
  const late = isOverdue(ticket.dueDate);

  return (
    <div className="relative">
      {indicator === "top" ? (
        <span
          aria-hidden
          className="absolute -top-[5px] left-0 right-0 h-0.5 rounded-full bg-blueprint"
        />
      ) : null}

      <article
        draggable={canOperate}
        role="button"
        tabIndex={0}
        aria-label={`${ticket.code}: ${ticket.title}`}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        onDragStart={(e: DragEvent<HTMLElement>) => {
          e.dataTransfer.setData("text/plain", ticket.id);
          e.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        onDragOver={(e: DragEvent<HTMLElement>) => {
          e.preventDefault();
          const box = e.currentTarget.getBoundingClientRect();
          onDragOverHalf(e.clientY - box.top < box.height / 2 ? "top" : "bottom");
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDrop();
        }}
        className={clsx(
          "relative rounded-ctl border border-rule bg-sheet p-3 pl-[13px] shadow-flat",
          "transition-[box-shadow,border-color,opacity] duration-[130ms] motion-reduce:transition-none",
          "hover:border-rule-strong hover:shadow-lift",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint",
          canOperate && "cursor-grab active:cursor-grabbing",
          dragging && "opacity-40",
        )}
      >
        <span
          aria-hidden
          className={clsx(
            "absolute inset-y-0 left-0 w-[3px] rounded-l-ctl",
            URGENCY_BAR[urgency],
          )}
        />

        <div className="flex items-start gap-2">
          <span className="tabular text-[11px] text-ink-3">{ticket.code}</span>
          <span className="ml-auto -mr-1 -mt-1">
            <CardMenu
              stages={stages}
              currentStageId={currentStageId}
              canOperate={canOperate}
              onOpen={onOpen}
              onMoveTo={onMoveTo}
            />
          </span>
        </div>

        <p className="mt-0.5 line-clamp-2 text-[0.8125rem] font-medium leading-snug text-ink">
          {ticket.title}
        </p>

        {ticket.typeName || urgency === "ridicata" || urgency === "critica" ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {ticket.typeName ? (
              <Badge tone={asTone(ticket.typeTone)}>{ticket.typeName}</Badge>
            ) : null}
            {urgency === "ridicata" || urgency === "critica" ? (
              <Badge tone={URGENCY_TONE[urgency]} dot>
                {URGENCY_LABELS[urgency]}
              </Badge>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
          <span
            className={clsx("inline-flex items-center gap-1", !ticket.partnerName && "text-warn")}
            title={ticket.partnerName ?? "Fără subcontractant"}
          >
            <Building2 aria-hidden className="size-3 shrink-0" />
            <span className="max-w-[110px] truncate">
              {ticket.partnerName ?? "Neatribuit"}
            </span>
          </span>

          {ticket.assigneeName ? (
            <span className="inline-flex items-center gap-1" title={ticket.assigneeName}>
              <User2 aria-hidden className="size-3 shrink-0" />
              <span className="max-w-[90px] truncate">{ticket.assigneeName}</span>
            </span>
          ) : null}

          {ticket.dueDate ? (
            <span className={clsx("inline-flex items-center gap-1", late && "font-medium text-over")}>
              <CalendarDays aria-hidden className="size-3 shrink-0" />
              {formatDay(ticket.dueDate)}
            </span>
          ) : null}

          {ticket.documents > 0 ? (
            <span className="tabular inline-flex items-center gap-1">
              <Paperclip aria-hidden className="size-3 shrink-0" />
              {ticket.documents}
            </span>
          ) : null}

          {stale !== null ? (
            <span className="inline-flex items-center gap-1" title="Timp petrecut în etapa curentă">
              <Clock3 aria-hidden className="size-3 shrink-0" />
              de {stale} zile
            </span>
          ) : null}
        </div>
      </article>
    </div>
  );
}

/* ─────────── meniul „⋯" — mutarea fără mouse-drag ─────────── */

function CardMenu({
  stages,
  currentStageId,
  canOperate,
  onOpen,
  onMoveTo,
}: {
  stages: BoardStage[];
  currentStageId: string;
  canOperate: boolean;
  onOpen: () => void;
  onMoveTo: (stageId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Panoul stă în coordonate de viewport: altfel îl taie coloana care scrollează orizontal.
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label="Acțiuni pentru tichet"
        aria-expanded={open}
        onClick={(e) => {
          const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setAt({ top: box.bottom + 4, right: window.innerWidth - box.right });
          setOpen((v) => !v);
        }}
        className="grid size-6 place-items-center rounded-chip text-ink-3 transition-colors hover:bg-sunk hover:text-ink focus-visible:outline-2 focus-visible:outline-blueprint"
      >
        <MoreHorizontal aria-hidden className="size-4" />
      </button>

      {open && at ? (
        <div
          ref={panelRef}
          role="menu"
          style={{ top: at.top, right: at.right }}
          className="fixed z-50 max-h-[60vh] w-56 overflow-y-auto rounded-ctl border border-rule bg-sheet p-1 shadow-float"
        >
          {canOperate ? (
            <>
              <p className="px-2 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
                Mută în
              </p>
              {stages.map((s) => {
                const current = s.id === currentStageId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitem"
                    disabled={current}
                    onClick={() => {
                      setOpen(false);
                      onMoveTo(s.id);
                    }}
                    className={clsx(
                      "flex w-full items-center gap-2 rounded-chip px-2 py-1.5 text-left text-[12.5px]",
                      current ? "text-ink-3" : "text-ink hover:bg-sunk",
                    )}
                  >
                    <span
                      aria-hidden
                      className={clsx("size-1.5 shrink-0 rounded-full", TONE_DOT[asTone(s.tone)])}
                    />
                    <span className="truncate">{s.name}</span>
                    {current ? <Check aria-hidden className="ml-auto size-3.5" /> : null}
                  </button>
                );
              })}
              <span aria-hidden className="my-1 block h-px bg-rule" />
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpen();
            }}
            className="flex w-full items-center gap-2 rounded-chip px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-sunk"
          >
            <ChevronRight aria-hidden className="size-3.5" />
            Deschide tichetul
          </button>
        </div>
      ) : null}
    </div>
  );
}
