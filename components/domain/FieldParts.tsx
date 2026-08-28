"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { Icon, type IconName } from "./FieldIcons";

/**
 * Piesele cu stare ale ecranelor noi de teren (blocul F).
 *
 * Aceleași reguli ca în `FieldKit.tsx`: ținte mari, o singură decizie pe ecran, nimic
 * în lei. Ce nu are nevoie de stare stă în `FieldUI.tsx` și rămâne componentă de server.
 */

/* ───────────────────────── alegeri ───────────────────────── */

/**
 * Rândul de opțiuni pe orizontală. Radio adevărat pe dedesubt, ca alegerea să plece
 * cu formularul fără JavaScript de sincronizat.
 */
export function ChipPick({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { value: string; label: string }[];
  value: string;
  onChange?: (value: string) => void;
}) {
  const [current, setCurrent] = useState(value);
  const picked = onChange ? value : current;

  return (
    <div className="f-chz f-flat">
      {options.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={picked === option.value}
            onChange={() => (onChange ? onChange(option.value) : setCurrent(option.value))}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

/** Cele două variante mari, DA / NU, cu ce se întâmplă mai departe scris pe ele. */
export function BigChoice({
  name,
  value,
  onChange,
  yes,
  no,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  yes: { value: string; title: string; hint: string; icon?: IconName };
  no: { value: string; title: string; hint: string; icon?: IconName };
}) {
  return (
    <div className="f-blk">
      {[no, yes].map((option) => (
        <label
          key={option.value}
          className={value === option.value ? "f-cb f-on" : "f-cb"}
          htmlFor={`${name}-${option.value}`}
        >
          <input
            type="radio"
            id={`${name}-${option.value}`}
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
          />
          <span className="f-bx">
            <Icon name="check" />
          </span>
          <span className="f-tx">
            <b>{option.title}</b>
            <span>{option.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/* ───────────────────────── cantități ───────────────────────── */

/**
 * − 12 + . Cifra se poate și scrie, dar butoanele sunt acolo pentru degete cu mănuși:
 * pe teren, tastatura numerică a telefonului e cel mai lent lucru de pe ecran.
 */
export function QtyStepper({
  name,
  defaultValue = 0,
  step = 1,
  max,
  ariaLabel,
}: {
  name: string;
  defaultValue?: number;
  step?: number;
  max?: number;
  ariaLabel: string;
}) {
  const [value, setValue] = useState(defaultValue);

  const set = (next: number) => {
    const clamped = Math.max(0, max !== undefined ? Math.min(next, max) : next);
    setValue(Number(clamped.toFixed(2)));
  };

  return (
    <span className="f-qt">
      <button type="button" onClick={() => set(value - step)} aria-label={`Scade ${ariaLabel}`}>
        <Icon name="minus" />
      </button>
      <input
        name={name}
        inputMode="decimal"
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => setValue(Number(event.target.value) || 0)}
      />
      <button type="button" onClick={() => set(value + step)} aria-label={`Crește ${ariaLabel}`}>
        <Icon name="plus" />
      </button>
    </span>
  );
}

/** Rând bifabil cu cantitate — bonul de consum și coșul sunt făcute din el. */
export function PickableLine({
  id,
  name,
  meta,
  unit,
  max,
  step = 1,
  defaultChecked = false,
  fieldName = "productId",
  withQuantity = true,
}: {
  id: string;
  name: string;
  meta?: string;
  unit: string;
  max?: number;
  step?: number;
  defaultChecked?: boolean;
  /** ce nume poartă id-ul bifat în formular: `productId`, `userId`, `toolId` … */
  fieldName?: string;
  /** bifă simplă (prezența unui om) sau bifă cu cantitate (un material) */
  withQuantity?: boolean;
}) {
  const [on, setOn] = useState(defaultChecked);

  return (
    <div className={on ? "f-cb f-on" : "f-cb"}>
      <button
        type="button"
        className="f-bx"
        onClick={() => setOn(!on)}
        aria-pressed={on}
        aria-label={`Alege ${name}`}
        style={{ cursor: "pointer" }}
      >
        <Icon name="check" />
      </button>
      <span className="f-tx" onClick={() => setOn(!on)} style={{ cursor: "pointer" }}>
        <b>{name}</b>
        <span>{meta ?? unit}</span>
      </span>
      {on ? (
        <>
          <input type="hidden" name={fieldName} value={id} />
          {withQuantity ? (
            <QtyStepper name={`qty_${id}`} defaultValue={step} step={step} max={max} ariaLabel={name} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* ───────────────────────── poze ───────────────────────── */

/**
 * Galeria de poze și filmări, cu fișiere adevărate.
 *
 * Un singur `input[type=file]` fără atributul `capture`: browserul de telefon arată nativ
 * alegerea între „Fă poză" și galerie / Drive. Cu `capture` s-ar deschide direct camera și
 * s-ar pierde poza făcută acum zece minute — exact cazul de pe șantier.
 *
 * Fișierele pleacă în același submit cu restul formularului, sub numele `name`, deci server
 * action-ul le ia din `formData.getAll(name)`. Nicio încărcare separată înainte de submit.
 */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

type PickedFile = { file: File; url: string; video: boolean };

export function PhotoDeck({
  name = "photos",
  label = "Adaugă poză sau filmare",
}: {
  name?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [error, setError] = useState("");

  /** Lista din stare devine lista input-ului, ca ștergerea unei poze să plece și din submit. */
  function sync(next: PickedFile[]) {
    const input = inputRef.current;
    if (input) {
      try {
        const transfer = new DataTransfer();
        next.forEach((item) => transfer.items.add(item.file));
        input.files = transfer.files;
      } catch {
        // browser vechi care nu lasă lista rescrisă: rămâne selecția nativă
      }
    }
    setPicked(next);
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    const tooBig = chosen.filter((file) => file.size > MAX_FILE_BYTES);
    setError(tooBig.length ? `${tooBig.length} fișier(e) peste 25 MB — neatașate.` : "");
    sync([
      ...picked,
      ...chosen
        .filter((file) => file.size <= MAX_FILE_BYTES)
        .map((file) => ({
          file,
          url: URL.createObjectURL(file),
          video: file.type.startsWith("video/"),
        })),
    ]);
  }

  function remove(index: number) {
    URL.revokeObjectURL(picked[index].url);
    sync(picked.filter((_, i) => i !== index));
  }

  return (
    <div className="f-blk f-p">
      <div className="f-phs">
        {picked.map((item, i) => (
          <button
            key={`${item.file.name}-${i}`}
            type="button"
            className="f-ph"
            onClick={() => remove(i)}
            aria-label={`Șterge ${item.file.name}`}
            style={{ padding: 0, overflow: "hidden", border: "none" }}
          >
            {item.video ? (
              <Icon name="video" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
            <span className="f-tg">{item.video ? "film" : i + 1}</span>
          </button>
        ))}
        <button
          type="button"
          className="f-ph f-add"
          onClick={() => inputRef.current?.click()}
          aria-label={label}
        >
          <Icon name="cam" />
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/*,video/*"
        multiple
        onChange={onPick}
        style={{ display: "none" }}
      />
      <p className="f-xs f-mut" style={{ margin: "10px 2px 0" }}>
        {error
          ? error
          : picked.length === 0
            ? "Poză nouă sau din galerie. Se salvează cu ora, ca dovadă."
            : `${picked.length} ${picked.length === 1 ? "fișier atașat" : "fișiere atașate"} · atinge o miniatură ca s-o scoți.`}
      </p>
    </div>
  );
}

/* ───────────────────────── semnătura ───────────────────────── */

/**
 * Semnătura cu degetul, trimisă ca imagine `data:` în același câmp folosit și de
 * semnarea prin link tokenizat de la birou. Un al doilea mecanism de semnat, doar
 * pentru că omul e pe telefon, ar însemna două feluri de PV semnat în aceeași bază.
 */
export function SignaturePad({ name = "signature" }: { name?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [value, setValue] = useState("");
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#10151F";
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className="f-sig"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const ctx = canvasRef.current?.getContext("2d");
          if (!ctx) return;
          const { x, y } = point(event);
          ctx.beginPath();
          ctx.moveTo(x, y);
          drawing.current = true;
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const ctx = canvasRef.current?.getContext("2d");
          if (!ctx) return;
          const { x, y } = point(event);
          ctx.lineTo(x, y);
          ctx.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
          setValue(canvasRef.current?.toDataURL("image/png") ?? "");
        }}
      />
      <input type="hidden" name={name} value={value} />
      <div className="f-xs f-mut f-ctr" style={{ marginTop: 8 }}>
        {value ? "Semnat" : "Semnează cu degetul în chenar"}
      </div>
      <button
        type="button"
        className="f-bt f-gho f-s"
        style={{ marginTop: 8 }}
        onClick={() => {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          setValue("");
        }}
      >
        Șterge semnătura
      </button>
    </>
  );
}

/* ───────────────────────── foaia de jos ───────────────────────── */

/**
 * Foaia care se deschide de jos pentru o singură adăugare (ore, material, însemnare).
 *
 * Regula 4 din CLAUDE.md: NU se închide la click în afară. Are date scrise în ea, iar
 * date scrise nu se pierd fiindcă cineva a atins marginea ecranului. Se închide din X.
 */
export function BottomSheet({
  label,
  title,
  icon = "plus",
  children,
}: {
  label: string;
  title: string;
  icon?: IconName;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="f-bts" style={{ paddingTop: 0 }}>
        <button type="button" className="f-bt f-out f-s" onClick={() => setOpen(true)}>
          <Icon name={icon} />
          {label}
        </button>
      </div>

      {open ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            bottom: "calc(-1 * var(--f-extra, 0px))",
            zIndex: 70,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            background: "rgba(10,14,21,.55)",
          }}
        >
          <div
            style={{
              position: "relative",
              background: "#fff",
              borderRadius: "26px 26px 0 0",
              maxHeight: "88dvh",
              overflowY: "auto",
              paddingBottom: "calc(18px + max(env(safe-area-inset-bottom), var(--f-extra, 0px)))",
            }}
          >
            <div className="f-line1" style={{ padding: "16px 18px 4px", color: "#10151F" }}>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, flex: 1 }}>{title}</h2>
              <button
                type="button"
                className="f-ib"
                onClick={() => setOpen(false)}
                aria-label="Închide"
                style={{ background: "#EEF0F3", color: "#10151F" }}
              >
                <Icon name="x" />
              </button>
            </div>
            <div style={{ padding: "0 16px" }}>{children}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ───────────────────────── treptele unei comenzi ───────────────────────── */

export function Timeline({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="f-tl">
      {steps.map((step, i) => {
        const index = i + 1;
        const state = index < current ? "f-done" : index === current ? "f-now" : "";
        return (
          <div key={step} className={`f-st ${state}`}>
            <span className="f-cir">
              <span className="f-dot" />
              <span className="f-bar-v" />
            </span>
            <span className="f-lb">
              <b>{step}</b>
              {index === current ? <span>aici e acum</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
