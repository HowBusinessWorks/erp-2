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
 * nu fie nevoie ca fiecare ecran să-și țină starea de „modificat”.
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

  // Un singur standard de dimensiune, generos, pe toate ecranele — nu una îngustă
  // ascunsă într-un colț de ecran mare. `width` alege doar cât de lat, nu și cât de „mic".
  const maxWidth = width === "sm" ? "max-w-xl" : width === "lg" ? "max-w-6xl" : "max-w-3xl";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[rgba(18,16,14,.42)] p-4 backdrop-blur-[2px]">
      {/* Fundalul e doar fundal. Nu are onClick — asta e regula. */}
      <div className="flex min-h-full items-center justify-center py-10">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`w-full ${maxWidth} rounded-[13px] border border-rule bg-sheet shadow-float`}
        >
          <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
            <div className="min-w-0">
              <h2 className="narrow-title text-[17px] text-ink">
                {title}
              </h2>
              {subtitle ? <p className="mt-1 text-sm text-ink-2">{subtitle}</p> : null}
            </div>
            <Button type="button" variant="quiet" size="sm" onClick={attemptClose} aria-label="Închide">
              ✕
            </Button>
          </header>

          <div
            ref={bodyRef}
            onInput={() => setDirty(true)}
            onChange={() => setDirty(true)}
            className="px-5 py-5"
          >
            {children}
          </div>

          {footer ? (
            <footer className="flex items-center justify-end gap-2 rounded-b-[13px] border-t border-rule bg-sheet-2 px-5 py-3.5">
              {footer}
            </footer>
          ) : null}

          {confirming ? (
            <div className="rounded-b-[13px] border-t-2 border-over bg-over-soft px-5 py-3.5">
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
