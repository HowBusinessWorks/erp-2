"use client";

import { useMemo, useRef, useState } from "react";

import { Icon } from "./FieldIcons";

/**
 * Coșul de comandă: adaugi linii una câte una, fiecare pornind de la o căutare
 * instantanee (filtrare pe listă deja încărcată, nimic de așteptat pe rețea).
 *
 * Regula 6 din CLAUDE.md — atingeri puține — se aplică și aici: căutarea nu recarge
 * ecranul (spre deosebire de un `<form method="get">`), iar rândul adăugat pleacă deja
 * cu cantitatea 1, gata de trimis.
 */

export type CatalogItem = {
  id: string;
  name: string;
  unit: string;
  meta?: string | null;
};

type CartLine = CatalogItem & { qty: number };

export function OrderCart({
  items,
  fieldName = "productId",
  addLabel = "Adaugă produs",
  searchPlaceholder = "Caută produs",
  step = 1,
}: {
  items: CatalogItem[];
  fieldName?: string;
  addLabel?: string;
  searchPlaceholder?: string;
  step?: number;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const pickedIds = useMemo(() => new Set(lines.map((l) => l.id)), [lines]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const pool = items.filter((it) => !pickedIds.has(it.id));
    const filtered = query ? pool.filter((it) => it.name.toLowerCase().includes(query)) : pool;
    return filtered.slice(0, 40);
  }, [q, items, pickedIds]);

  function openSearch() {
    setOpen(true);
    setQ("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function addItem(item: CatalogItem) {
    setLines((prev) => [...prev, { ...item, qty: step }]);
    setOpen(false);
    setQ("");
  }

  function removeItem(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function setQty(id: string, qty: number) {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, qty: Math.max(0, Number(qty.toFixed(2))) } : l)),
    );
  }

  return (
    <div className="f-oc">
      {lines.length === 0 ? (
        <div className="f-oc-empty">
          <Icon name="cart" />
          <span>Coșul e gol — adaugă prima linie mai jos.</span>
        </div>
      ) : (
        <div className="f-blk">
          {lines.map((line) => (
            <div key={line.id} className="f-oc-ln">
              <span className="f-tx">
                <b>{line.name}</b>
                <span>{line.meta || line.unit}</span>
              </span>
              <input type="hidden" name={fieldName} value={line.id} />
              <span className="f-qt">
                <button
                  type="button"
                  onClick={() => setQty(line.id, line.qty - step)}
                  aria-label={`Scade ${line.name}`}
                >
                  <Icon name="minus" />
                </button>
                <input
                  name={`qty_${line.id}`}
                  inputMode="decimal"
                  value={line.qty}
                  aria-label={line.name}
                  onChange={(e) => setQty(line.id, Number(e.target.value) || 0)}
                />
                <button
                  type="button"
                  onClick={() => setQty(line.id, line.qty + step)}
                  aria-label={`Crește ${line.name}`}
                >
                  <Icon name="plus" />
                </button>
              </span>
              <button
                type="button"
                className="f-oc-rm"
                onClick={() => removeItem(line.id)}
                aria-label={`Șterge ${line.name} din comandă`}
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <div className="f-oc-panel">
          <div className="f-oc-src">
            <Icon name="search" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
            <button
              type="button"
              className="f-ib"
              onClick={() => setOpen(false)}
              aria-label="Închide căutarea"
            >
              <Icon name="x" />
            </button>
          </div>
          <div className="f-oc-res">
            {results.length === 0 ? (
              <div className="f-oc-none">Niciun produs găsit</div>
            ) : (
              results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="f-oc-item"
                  onClick={() => addItem(item)}
                >
                  <span className="f-tx">
                    <b>{item.name}</b>
                    <span>{item.meta || item.unit}</span>
                  </span>
                  <Icon name="plus" />
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <button type="button" className="f-oc-add" onClick={openSearch}>
          <Icon name="plus" />
          {addLabel}
        </button>
      )}
    </div>
  );
}
