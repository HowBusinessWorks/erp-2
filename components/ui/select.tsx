"use client";

import clsx from "clsx";
import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * Lista de alegere a aplicației. Un singur fișier, două înfățișări (birou și
 * teren) — nicăieri nu mai rămâne dropdown-ul implicit al browserului, care
 * arată altfel pe fiecare sistem și nu se poate potrivi cu restul.
 *
 * Sub interfața proprie stă TOT UN `<select>` NATIV, invizibil și suprapus peste
 * declanșator. El e cel care:
 *   — se trimite odată cu formularul (`name`), deci acțiunile de server nu se ating;
 *   — poartă `required` și raportează validarea browserului la locul potrivit;
 *   — păstrează contractul `value` / `defaultValue` / `onChange` al apelurilor deja scrise.
 *
 * Alegerea din panou se scrie în el prin setter-ul nativ + un `change` care urcă,
 * ca React să vadă exact ce ar fi văzut de la un click pe lista sistemului. De aici
 * vine compatibilitatea: componenta intră peste apelurile existente fără să le
 * schimbe nimic.
 *
 * `<option>`-urile NU se citesc din `children` prin React, ci din DOM-ul select-ului
 * nativ. Așa merge orice formă de conținut — `<option>` scrise de mână, `.map()`,
 * componente care generează opțiuni (`<UnitOptions />`) — fără ca fiecare apel să
 * fie convertit la un `options={…}`.
 */

export type SelectTone = "office" | "field";
/** aceleași trepte ca la butoane: `xs` intră într-un rând de tabel, `md` într-un formular */
export type SelectSize = "xs" | "sm" | "md";

const SIZES: Record<SelectSize, string> = {
  xs: "h-7 px-2 text-tiny",
  sm: "h-8 px-2.5 text-[13px]",
  md: "h-[38px] px-[11px] text-[13.5px]",
};

type Opt = { value: string; label: string; disabled: boolean };

/** Citește opțiunile din select-ul nativ, în ordinea din DOM. */
function readOptions(el: HTMLSelectElement | null): Opt[] {
  if (!el) return [];
  return Array.from(el.options).map((o) => ({
    value: o.value,
    label: o.textContent?.trim() ?? "",
    disabled: o.disabled,
  }));
}

function sameOptions(a: Opt[], b: Opt[]) {
  return (
    a.length === b.length &&
    a.every(
      (o, i) => o.value === b[i].value && o.label === b[i].label && o.disabled === b[i].disabled,
    )
  );
}

/** Scrie în select-ul nativ pe drumul pe care l-ar fi luat un click al utilizatorului. */
function commit(el: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/* ── prima randare ──────────────────────────────────────────────────────
   Pe server nu există DOM din care să se citească opțiunile, iar până la
   hidratare declanșatorul ar arăta „Alege…" în loc de valoarea reală — o
   clipire pe fiecare câmp, la fiecare încărcare. Așa că, DOAR pentru starea
   inițială, opțiunile se deduc și din `children`, mergând prin fragmente și
   liste. Ce nu se poate deduce (componente care generează `<option>`) rămâne
   pe seama DOM-ului de după hidratare. */

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function collect(node: ReactNode, out: Opt[]) {
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { value?: string | number; disabled?: boolean; children?: ReactNode };
    if (child.type === "option") {
      const label = textOf(props.children);
      out.push({
        value: props.value === undefined ? label : String(props.value),
        label,
        disabled: Boolean(props.disabled),
      });
    } else if (child.type === Fragment) {
      collect(props.children, out);
    }
  });
}

function initialOptions(
  children: ReactNode,
  options: { value: string; label: string; disabled?: boolean }[] | undefined,
): Opt[] {
  if (children !== undefined && children !== null) {
    const out: Opt[] = [];
    collect(children, out);
    return out;
  }
  return (options ?? []).map((o) => ({ ...o, disabled: Boolean(o.disabled) }));
}

/** Ce ar alege browserul singur: valoarea cerută, altfel prima opțiune validă. */
function initialValue(opts: Opt[], wanted: unknown): string {
  if (wanted !== undefined && wanted !== null) {
    const v = String(wanted);
    if (opts.some((o) => o.value === v)) return v;
  }
  return opts.find((o) => !o.disabled)?.value ?? "";
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const lower = (s: string) => s.toLocaleLowerCase("ro");

export function Select({
  className,
  id,
  tone = "office",
  size = "md",
  placeholder = "Alege…",
  searchable,
  invalid,
  children,
  options,
  ...props
}: Omit<ComponentProps<"select">, "size"> & {
  tone?: SelectTone;
  /** înălțimea controlului; lățimea rămâne pe `className` */
  size?: SelectSize;
  /** textul afișat cât timp valoarea aleasă e goală */
  placeholder?: string;
  /** câmp de căutare în panou; implicit apare de la 8 opțiuni în sus */
  searchable?: boolean;
  invalid?: boolean;
  /** scurtătură pentru cazul simplu — altfel se scriu `<option>` ca până acum */
  options?: { value: string; label: string; disabled?: boolean }[];
}) {
  const nativeRef = useRef<HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const [opts, setOpts] = useState<Opt[]>(() => initialOptions(children, options));
  const [value, setValue] = useState(() =>
    initialValue(initialOptions(children, options), props.value ?? props.defaultValue),
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(
    null,
  );

  const disabled = props.disabled;

  /* Starea afișată se ia mereu din select-ul nativ — el e sursa de adevăr, inclusiv
     în cazul controlat, unde părintele poate refuza valoarea propusă. */
  useIsoLayoutEffect(() => {
    const el = nativeRef.current;
    if (!el) return;
    const next = readOptions(el);
    setOpts((prev) => (sameOptions(prev, next) ? prev : next));
    setValue(el.value);
  });

  const selected = opts.find((o) => o.value === value);
  const withSearch = searchable ?? opts.length >= 8;
  const shown = query ? opts.filter((o) => lower(o.label).includes(lower(query))) : opts;

  /* Poziția panoului. Ancorat de declanșator în coordonate de viewport (`fixed`),
     ca să nu fie tăiat de vreun `overflow: hidden` de tabel sau de fereastră. */
  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const up = below < 240 && r.top > below;
    setPos({ left: r.left, top: up ? r.top : r.bottom, width: r.width, up });
  }, []);

  useIsoLayoutEffect(() => {
    if (!open) return;
    setSheet(tone === "field" && window.innerWidth < 640);
    place();
  }, [open, place, tone]);

  useEffect(() => {
    if (!open || sheet) return;
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, sheet, place]);

  const closePanel = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Deschiderea pornește de la ce e ales acum, nu de la primul rând.
  function openPanel() {
    if (disabled) return;
    setQuery("");
    const i = opts.findIndex((o) => o.value === value);
    setActive(i < 0 ? 0 : i);
    setOpen(true);
  }

  function choose(o: Opt) {
    if (o.disabled) return;
    const el = nativeRef.current;
    if (el) commit(el, o.value);
    setValue(o.value);
    closePanel();
  }

  // Click în afară închide. Regula ferestrelor nu se aplică: nu e nimic de pierdut.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      closePanel(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, closePanel]);

  useEffect(() => {
    if (open && withSearch) searchRef.current?.focus();
  }, [open, withSearch, sheet]);

  // Rândul activ rămâne în câmpul vizual când se navighează din tastatură.
  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const typed = useRef({ buf: "", at: 0 });

  function onKeyDown(e: React.KeyboardEvent) {
    const k = e.key;

    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") {
        e.preventDefault();
        openPanel();
      }
      return;
    }

    if (k === "Escape") {
      e.preventDefault();
      closePanel();
      return;
    }
    if (k === "Tab") {
      closePanel(false);
      return;
    }
    if (k === "Enter" || (k === " " && !withSearch)) {
      e.preventDefault();
      const o = shown[active];
      if (o) choose(o);
      return;
    }

    const step = (d: number) => {
      e.preventDefault();
      if (!shown.length) return;
      let i = active;
      for (let n = 0; n < shown.length; n++) {
        i = (i + d + shown.length) % shown.length;
        if (!shown[i].disabled) break;
      }
      setActive(i);
    };
    if (k === "ArrowDown") return step(1);
    if (k === "ArrowUp") return step(-1);
    if (k === "Home") {
      e.preventDefault();
      return setActive(0);
    }
    if (k === "End") {
      e.preventDefault();
      return setActive(shown.length - 1);
    }

    // Scris rapid: sare la prima opțiune care începe cu literele tastate.
    if (!withSearch && k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      typed.current.buf = now - typed.current.at > 900 ? k : typed.current.buf + k;
      typed.current.at = now;
      const q = lower(typed.current.buf);
      const i = shown.findIndex((o) => lower(o.label).startsWith(q));
      if (i >= 0) setActive(i);
    }
  }

  const office = tone === "office";

  const trigger = office
    ? clsx(
        "flex w-full items-center gap-2 rounded-ctl border bg-sheet text-left",
        SIZES[size],
        "text-ink outline-none transition-[border-color,box-shadow] duration-[130ms]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        invalid ? "border-over" : "border-rule-strong hover:border-ink-3",
        open &&
          (invalid
            ? "border-over shadow-[0_0_0_3px_var(--bad-soft)]"
            : "border-blueprint shadow-[0_0_0_3px_var(--acc-soft)]"),
      )
    : clsx(
        "flex w-full items-center gap-2 bg-transparent py-[2px] text-left",
        "text-[17.5px] font-[650] text-[#10151f] outline-none disabled:opacity-50",
      );

  return (
    <span className={clsx("relative block", className)}>
      {/*
        Butonul stă ÎNAINTEA select-ului în DOM cu un motiv: un `<label>` care
        împachetează câmpul își leagă primul descendent focusabil. Dacă selectul
        ar fi primul, un click pe etichetă ar deschide lista sistemului peste a
        noastră. `id` stă tot pe buton, ca `htmlFor` să nimerească tot aici.
      */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? closePanel() : openPanel())}
        onKeyDown={onKeyDown}
        className={trigger}
      >
        <span
          className={clsx(
            "min-w-0 flex-1 truncate",
            !selected?.label && (office ? "text-ink-3" : "text-[#6b7688]"),
          )}
        >
          {selected?.label || placeholder}
        </span>
        <Chevron open={open} tone={tone} />
      </button>

      {/*
        Select-ul nativ: invizibil, dar întins peste buton și fără `display:none` —
        altfel browserul n-ar avea unde să ancoreze bula de validare a lui
        `required`, iar câmpul ar deveni „invalid, dar nefocusabil".
      */}
      <select
        {...props}
        ref={nativeRef}
        className="pointer-events-none absolute inset-0 size-full appearance-none opacity-0"
        tabIndex={-1}
        aria-hidden
      >
        {children ??
          options?.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
      </select>

      {open && pos
        ? createPortal(
            <div
              ref={panelRef}
              onKeyDown={onKeyDown}
              className={clsx(
                "z-[60] overflow-hidden border border-rule bg-sheet shadow-float",
                sheet
                  ? "pop-sheet fixed inset-x-0 bottom-0 rounded-t-[20px] pb-[env(safe-area-inset-bottom)]"
                  : "pop-panel fixed rounded-sheet",
              )}
              style={
                sheet
                  ? undefined
                  : {
                      left: pos.left,
                      width: Math.max(pos.width, 180),
                      ...(pos.up
                        ? { bottom: window.innerHeight - pos.top + 6 }
                        : { top: pos.top + 6 }),
                    }
              }
            >
              {sheet ? (
                <div className="flex justify-center pb-1 pt-2.5">
                  <span className="h-1 w-9 rounded-full bg-rule-strong" />
                </div>
              ) : null}

              {withSearch ? (
                <div className={clsx("border-b border-rule", sheet ? "p-2.5" : "p-1.5")}>
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActive(0);
                    }}
                    placeholder="Caută…"
                    className={clsx(
                      "w-full rounded-chip bg-sunk text-ink outline-none placeholder:text-ink-3",
                      sheet ? "h-11 px-3.5 text-[16px]" : "h-8 px-2.5 text-[13px]",
                    )}
                  />
                </div>
              ) : null}

              <div
                id={listboxId}
                role="listbox"
                className={clsx(
                  "overflow-y-auto overscroll-contain py-1",
                  sheet ? "max-h-[58vh]" : "max-h-[264px]",
                )}
              >
                {shown.length === 0 ? (
                  <p className="px-3 py-2.5 text-tiny text-ink-3">Nimic găsit</p>
                ) : (
                  shown.map((o, i) => {
                    const isSel = o.value === value;
                    return (
                      <div
                        key={o.value + i}
                        data-idx={i}
                        role="option"
                        aria-selected={isSel}
                        aria-disabled={o.disabled || undefined}
                        onPointerEnter={() => setActive(i)}
                        onClick={() => choose(o)}
                        className={clsx(
                          "flex cursor-pointer items-center gap-2",
                          sheet
                            ? "mx-1.5 rounded-ctl px-3 py-3 text-[16.5px] font-medium"
                            : "mx-1 rounded-chip px-2.5 py-[7px] text-[13.5px]",
                          o.disabled && "pointer-events-none opacity-40",
                          i === active && !isSel && "bg-sunk",
                          isSel ? "bg-blueprint-soft font-medium text-blueprint-ink" : "text-ink",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{o.label}</span>
                        {isSel ? <Check /> : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

function Chevron({ open, tone }: { open: boolean; tone: SelectTone }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={clsx(
        "shrink-0 transition-transform duration-150",
        open && "rotate-180",
        tone === "office" ? "size-3.5 text-ink-3" : "size-5 text-[#6b7688]",
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth={tone === "office" ? 2 : 2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}

function Check() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}
