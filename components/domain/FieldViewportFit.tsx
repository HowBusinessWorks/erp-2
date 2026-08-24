"use client";

import { useEffect } from "react";

/**
 * Pe iOS instalat pe ecranul de start, viewport-ul de layout se raportează uneori mai
 * scurt decât ecranul fizic: `.f-app` (fixed, inset: 0) se termină cu câțiva zeci de
 * pixeli mai sus, iar sub bara de tab-uri rămâne o fâșie cu fundalul `body`-ului.
 *
 * Nu există CSS care să afle diferența, deci o măsurăm: `screen.height` e ecranul real,
 * `innerHeight` e cât crede pagina că are. Diferența intră în `--f-extra`, cu care shell-ul
 * se prelungește în jos exact cât trebuie, iar bara de tab-uri își mută padding-ul acolo —
 * deci iconițele rămân peste bara de gesturi, dar fundalul închis cade fix pe marginea de jos.
 *
 * Se aplică DOAR în modul instalat: în Safari normal, diferența e bara de browser și nu
 * trebuie compensată.
 */
export function FieldViewportFit() {
  useEffect(() => {
    const root = document.documentElement;

    const measure = () => {
      const nav = window.navigator as Navigator & { standalone?: boolean };
      const installed =
        nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;

      if (!installed) {
        root.style.setProperty("--f-extra", "0px");
        return;
      }

      const vv = window.visualViewport;
      const seen = vv ? vv.height + vv.offsetTop : window.innerHeight;
      // Cu tastatura deschisă, `visualViewport` se scurtează masiv — nu e fâșia noastră.
      const layout = Math.max(seen, window.innerHeight);
      const extra = Math.min(Math.max(window.screen.height - layout, 0), 80);

      root.style.setProperty("--f-extra", `${Math.round(extra)}px`);
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);

    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      root.style.removeProperty("--f-extra");
    };
  }, []);

  return null;
}
