"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "./primitives";

/**
 * REGULA 4, fără excepții: fereastra NU se închide la click în afara ei și nici la
 * Escape dacă există modificări nesalvate. Doar buton explicit, cu confirmare.
 * S-au pierdut date reale așa.
 *
 * `dirty` se calculează din formular: dacă vreun câmp a fost atins, e true.
 * Componenta îl deduce singură ascultând evenimentele de input din interior, ca să
 * nu fie nevoie ca fiecare ecran să-și țină starea de „modificat".
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  footer,
  children,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  width?: "sm" | "md" | "lg";
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) {
      setDirty(false);
      setConfirming(false);
    }
  }, [open]);

  // Escape e o cale de ieșire, nu una de pierdere: cu modificări nesalvate cere confirmare.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      attemptClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty]);

  function attemptClose() {
    if (dirty) setConfirming(true);
    else onClose();
  }

  if (!open) return null;

  const maxWidth = width === "sm" ? "max-w-md" : width === "lg" ? "max-w-3xl" : "max-w-xl";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/35 p-4 py-10 backdrop-blur-[1px]">
      {/* Fundalul e doar fundal. Nu are onClick — asta e regula. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`sheet w-full ${maxWidth} shadow-[0_24px_60px_-24px_rgba(24,20,16,0.45)]`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule-strong px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="font-narrow text-[1.0625rem] font-semibold leading-tight tracking-tight text-ink">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-tiny text-ink-2">{subtitle}</p> : null}
          </div>
          <Button type="button" variant="quiet" size="sm" onClick={attemptClose} aria-label="Închide">
            ✕
          </Button>
        </header>

        <div
          ref={bodyRef}
          onInput={() => setDirty(true)}
          onChange={() => setDirty(true)}
          className="px-5 py-4"
        >
          {children}
        </div>

        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-rule bg-sunk/50 px-5 py-3">
            {footer}
          </footer>
        ) : null}

        {confirming ? (
          <div className="border-t-2 border-over bg-over-soft px-5 py-3">
            <p className="text-tiny text-over">
              Ai modificări nesalvate. Dacă închizi acum, se pierd.
            </p>
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="danger" size="sm" onClick={onClose}>
                Închide și pierde modificările
              </Button>
              <Button type="button" size="sm" onClick={() => setConfirming(false)}>
                Rămân aici
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Buton care deschide un modal. Scutește fiecare ecran de propriul `useState`. */
export function ModalTrigger({
  label,
  variant = "default",
  size = "md",
  children,
  ...modalProps
}: {
  label: ReactNode;
  variant?: "primary" | "default" | "quiet" | "danger";
  size?: "sm" | "md";
  children: (close: () => void) => ReactNode;
} & Omit<Parameters<typeof Modal>[0], "open" | "onClose" | "children">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal {...modalProps} open={open} onClose={() => setOpen(false)}>
        {children(() => setOpen(false))}
      </Modal>
    </>
  );
}
