"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Semnătura pe ecran, cu degetul sau cu mouse-ul.
 *
 * Se desenează pe canvas și pleacă spre server ca PNG într-un câmp ascuns. În
 * prototip atât: desen + nume + moment. În producție intră **hash-ul SHA-256 al
 * PDF-ului la semnare**, altfel semnătura dovedește că cineva a mâzgălit un dreptunghi,
 * nu că a fost de acord cu un document anume. Vezi cusăturile din PLAN.md §7.
 */
export function SignaturePad({
  name,
  label = "Semnătura",
  required,
}: {
  name: string;
  label?: string;
  required?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [value, setValue] = useState("");
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Ecranele de teren au densitate mare; fără scalare, linia iese pixelată.
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";
  }, []);

  const pointOf = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pointOf(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointOf(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) setValue(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setValue("");
  };

  return (
    <div>
      <div className="eyebrow mb-1 flex items-center justify-between">
        <span>
          {label}
          {required ? <span className="text-over"> •</span> : null}
        </span>
        {value ? (
          <button
            type="button"
            onClick={clear}
            className="text-micro font-normal text-ink-3 hover:text-ink"
          >
            șterge
          </button>
        ) : null}
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-28 w-full touch-none rounded-[3px] border border-rule-strong bg-sheet"
      />
      <input type="hidden" name={name} value={value} required={required} />
      {!value ? (
        <p className="mt-1 text-micro text-ink-3">Semnează în dreptunghi.</p>
      ) : null}
    </div>
  );
}

/** Semnătura deja dată — se vede pe document și la tipar. */
export function SignatureImage({ src, caption }: { src: string; caption: string }) {
  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={caption}
        className="h-20 w-full max-w-64 object-contain object-left"
      />
      <div className="mt-1 border-t border-rule pt-1 text-micro text-ink-3">{caption}</div>
    </div>
  );
}
