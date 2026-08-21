"use client";

import { useEffect, useRef, useState } from "react";

import { Button, Input, NumberInput } from "./primitives";

/**
 * Alegerea coordonatelor de pe hartă, nu din tastatură. Hartă „slippy” minimală peste
 * dalele OpenStreetMap — fără Leaflet, fără pachet nou: 250 de linii sunt mai ieftine
 * decât o dependență care aduce CSS propriu și trebuie încărcată dinamic în modal.
 *
 * Câmpurile `lat`/`lng` rămân în formular (editabile la mână, pentru cazul în care
 * cineva le are deja din altă parte); harta doar le scrie.
 */

const TILE = 256;
const CENTER_RO = { lat: 45.9432, lng: 24.9668 };

function lngToX(lng: number, z: number) {
  return ((lng + 180) / 360) * TILE * 2 ** z;
}
function latToY(lat: number, z: number) {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
}
function xToLng(x: number, z: number) {
  return (x / (TILE * 2 ** z)) * 360 - 180;
}
function yToLat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

const round7 = (n: number) => String(Math.round(n * 1e7) / 1e7);

export function MapPicker({
  latName = "lat",
  lngName = "lng",
  defaultLat,
  defaultLng,
  label = "Locație pe hartă",
}: {
  latName?: string;
  lngName?: string;
  defaultLat?: string | null;
  defaultLng?: string | null;
  label?: string;
}) {
  const start =
    defaultLat && defaultLng
      ? { lat: Number(defaultLat), lng: Number(defaultLng) }
      : null;

  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(start);
  const [center, setCenter] = useState(start ?? CENTER_RO);
  const [zoom, setZoom] = useState(start ? 15 : 6);
  const [size, setSize] = useState({ w: 480, h: 260 });
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);

  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cx = lngToX(center.lng, zoom);
  const cy = latToY(center.lat, zoom);
  const originX = cx - size.w / 2;
  const originY = cy - size.h / 2;

  const world = 2 ** zoom;
  const tiles: { key: string; x: number; y: number; left: number; top: number }[] = [];
  const x0 = Math.floor(originX / TILE);
  const y0 = Math.floor(originY / TILE);
  const x1 = Math.floor((originX + size.w) / TILE);
  const y1 = Math.floor((originY + size.h) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    if (ty < 0 || ty >= world) continue;
    for (let tx = x0; tx <= x1; tx++) {
      const wrapped = ((tx % world) + world) % world;
      tiles.push({
        key: `${tx}:${ty}`,
        x: wrapped,
        y: ty,
        left: tx * TILE - originX,
        top: ty * TILE - originY,
      });
    }
  }

  function pick(clientX: number, clientY: number) {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = originX + (clientX - r.left);
    const py = originY + (clientY - r.top);
    setMarker({ lat: yToLat(py, zoom), lng: xToLng(px, zoom) });
  }

  function zoomBy(delta: number, at?: { x: number; y: number }) {
    const next = Math.min(19, Math.max(2, zoom + delta));
    if (next === zoom) return;
    if (at && box.current) {
      const r = box.current.getBoundingClientRect();
      const px = originX + (at.x - r.left);
      const py = originY + (at.y - r.top);
      const lat = yToLat(py, zoom);
      const lng = xToLng(px, zoom);
      // punctul de sub cursor rămâne sub cursor
      const nx = lngToX(lng, next) - (at.x - r.left) + size.w / 2;
      const ny = latToY(lat, next) - (at.y - r.top) + size.h / 2;
      setCenter({ lat: yToLat(ny, next), lng: xToLng(nx, next) });
    }
    setZoom(next);
  }

  async function search(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchMsg(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ro&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } },
      );
      const hits = (await res.json()) as { lat: string; lon: string }[];
      if (!hits.length) {
        setSearchMsg("Nu am găsit adresa. Alege direct pe hartă.");
        return;
      }
      const lat = Number(hits[0].lat);
      const lng = Number(hits[0].lon);
      setCenter({ lat, lng });
      setZoom(16);
      setMarker({ lat, lng });
    } catch {
      setSearchMsg("Căutarea nu a răspuns. Alege direct pe hartă.");
    } finally {
      setSearching(false);
    }
  }

  const markerPos = marker
    ? { left: lngToX(marker.lng, zoom) - originX, top: latToY(marker.lat, zoom) - originY }
    : null;

  return (
    <div className="sm:col-span-2">
      <span className="eyebrow mb-1 block">{label}</span>

      <div className="mb-2 flex gap-2">
        <Input
          type="text"
          value={query}
          placeholder="Caută adresa (ex. Str. Aleea Ghirlandei 4, Timișoara)"
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search(e);
          }}
        />
        <Button type="button" onClick={search} disabled={searching}>
          {searching ? "Caut…" : "Caută"}
        </Button>
      </div>

      <div
        ref={box}
        className="relative h-64 w-full cursor-crosshair overflow-hidden border border-rule bg-sunk select-none"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) < 3) return;
          d.moved = true;
          d.x = e.clientX;
          d.y = e.clientY;
          setCenter({ lat: yToLat(cy - dy, zoom), lng: xToLng(cx - dx, zoom) });
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) pick(e.clientX, e.clientY);
        }}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 1 : -1, { x: e.clientX, y: e.clientY })}
      >
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t.key}
            src={`https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png`}
            alt=""
            draggable={false}
            width={TILE}
            height={TILE}
            className="pointer-events-none absolute max-w-none"
            style={{ left: t.left, top: t.top }}
          />
        ))}

        {markerPos ? (
          <div
            className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blueprint shadow"
            style={{ left: markerPos.left, top: markerPos.top }}
          />
        ) : null}

        <div
          className="absolute right-2 top-2 flex flex-col gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button type="button" size="sm" onClick={() => zoomBy(1)}>
            ＋
          </Button>
          <Button type="button" size="sm" onClick={() => zoomBy(-1)}>
            −
          </Button>
        </div>

        <span className="pointer-events-none absolute bottom-0 right-0 bg-white/80 px-1 text-micro text-ink-3">
          © OpenStreetMap
        </span>
      </div>

      <span className="mt-1 block text-micro text-ink-3">
        {searchMsg ??
          (marker
            ? "Click pe hartă mută punctul. Trage pentru a te plimba, rotița pentru zoom."
            : "Click pe hartă pentru a fixa punctul obiectivului.")}
      </span>

      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="eyebrow mb-1 block">Latitudine</span>
          <NumberInput
            name={latName}
            step="0.0000001"
            placeholder="45.7489"
            value={marker ? round7(marker.lat) : ""}
            onChange={(e) => {
              const lat = Number(e.currentTarget.value);
              if (!Number.isFinite(lat)) return;
              const next = { lat, lng: marker?.lng ?? 0 };
              setMarker(next);
              setCenter(next);
            }}
          />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">Longitudine</span>
          <NumberInput
            name={lngName}
            step="0.0000001"
            placeholder="21.2087"
            value={marker ? round7(marker.lng) : ""}
            onChange={(e) => {
              const lng = Number(e.currentTarget.value);
              if (!Number.isFinite(lng)) return;
              const next = { lat: marker?.lat ?? 0, lng };
              setMarker(next);
              setCenter(next);
            }}
          />
        </label>
      </div>
    </div>
  );
}
