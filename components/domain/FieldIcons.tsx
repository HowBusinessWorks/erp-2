/**
 * Setul de pictograme al aplicației de teren.
 *
 * Desenate ca `<symbol>` o singură dată, în layout, și folosite prin `<use>`.
 * Alternativa — o componentă React per pictogramă — ar fi însemnat același path
 * repetat de zece ori în HTML-ul unei liste. Aici e o singură definiție și
 * referințe de 40 de octeți.
 */

export type IconName =
  | "home" | "sun" | "pin" | "clock" | "plus" | "tool" | "build" | "left" | "right"
  | "cam" | "check" | "alert" | "cal" | "truck" | "box" | "file" | "users" | "x"
  | "pen" | "clip" | "search" | "bell" | "plane" | "img" | "crane" | "list"
  | "swap" | "ticket" | "play" | "info" | "user" | "arrow" | "logout"
  | "minus" | "cart" | "send" | "video" | "more";

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Se randează o singură dată, în layout-ul de teren. */
export function FieldIconSprite() {
  return (
    <svg style={{ display: "none" }} aria-hidden>
      <symbol id="fi-home" viewBox="0 0 24 24" {...S}><path d="M3 9.5l9-7 9 7V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V13h6v9" /></symbol>
      <symbol id="fi-sun" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></symbol>
      <symbol id="fi-pin" viewBox="0 0 24 24" {...S}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></symbol>
      <symbol id="fi-clock" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.4 2" /></symbol>
      <symbol id="fi-plus" viewBox="0 0 24 24" {...S} strokeWidth={2.7}><path d="M12 5v14M5 12h14" /></symbol>
      <symbol id="fi-tool" viewBox="0 0 24 24" {...S}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></symbol>
      <symbol id="fi-build" viewBox="0 0 24 24" {...S}><path d="M3 21h18M5 21V8l7-4 7 4v13" /><path d="M9 12h1M9 16h1M14 12h1M14 16h1" /></symbol>
      <symbol id="fi-left" viewBox="0 0 24 24" {...S} strokeWidth={2.5}><path d="M15 19l-7-7 7-7" /></symbol>
      <symbol id="fi-right" viewBox="0 0 24 24" {...S} strokeWidth={2.3}><path d="M9 19l7-7-7-7" /></symbol>
      <symbol id="fi-cam" viewBox="0 0 24 24" {...S}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.6-2.4h6.8L17 7h3a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="3.6" /></symbol>
      <symbol id="fi-check" viewBox="0 0 24 24" {...S} strokeWidth={3.2}><path d="M20 6L9 17l-5-5" /></symbol>
      <symbol id="fi-alert" viewBox="0 0 24 24" {...S}><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4.5M12 17.2h.01" /></symbol>
      <symbol id="fi-cal" viewBox="0 0 24 24" {...S}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 10h18" /></symbol>
      <symbol id="fi-truck" viewBox="0 0 24 24" {...S}><path d="M1 5h14v11H1zM15 9h4l3.5 3.5V16H15z" /><circle cx="6" cy="18.5" r="2" /><circle cx="18" cy="18.5" r="2" /></symbol>
      <symbol id="fi-box" viewBox="0 0 24 24" {...S}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.3 7L12 12l8.7-5M12 22V12" /></symbol>
      <symbol id="fi-file" viewBox="0 0 24 24" {...S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8" /></symbol>
      <symbol id="fi-users" viewBox="0 0 24 24" {...S}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></symbol>
      <symbol id="fi-x" viewBox="0 0 24 24" {...S} strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></symbol>
      <symbol id="fi-pen" viewBox="0 0 24 24" {...S}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></symbol>
      <symbol id="fi-clip" viewBox="0 0 24 24" {...S}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1.4" /><path d="M9 13l2 2 4-4" /></symbol>
      <symbol id="fi-search" viewBox="0 0 24 24" {...S}><circle cx="11" cy="11" r="7.5" /><path d="M21 21l-4.3-4.3" /></symbol>
      <symbol id="fi-bell" viewBox="0 0 24 24" {...S}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></symbol>
      <symbol id="fi-plane" viewBox="0 0 24 24" {...S}><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.2.6-.6.5-1.1z" /></symbol>
      <symbol id="fi-img" viewBox="0 0 24 24" {...S}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.8" /><path d="M21 15l-5-5L5 21" /></symbol>
      <symbol id="fi-crane" viewBox="0 0 24 24" {...S}><path d="M3 21h18M6 21V6M6 6h13M6 6L2.5 10M19 6v4M19 10h-3M16 10v3" /><rect x="14" y="13" width="4" height="3.5" rx="1" /></symbol>
      <symbol id="fi-list" viewBox="0 0 24 24" {...S}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></symbol>
      <symbol id="fi-swap" viewBox="0 0 24 24" {...S}><path d="M3 8h14l-3.5-3.5M21 16H7l3.5 3.5" /></symbol>
      <symbol id="fi-ticket" viewBox="0 0 24 24" {...S}><path d="M3 9V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a3 3 0 0 0 0 6v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a3 3 0 0 0 0-6z" /><path d="M13 5v2M13 11v2M13 17v2" /></symbol>
      <symbol id="fi-play" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="9" /><path d="M10 8.5l6 3.5-6 3.5z" /></symbol>
      <symbol id="fi-info" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></symbol>
      <symbol id="fi-user" viewBox="0 0 24 24" {...S}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></symbol>
      <symbol id="fi-arrow" viewBox="0 0 24 24" {...S} strokeWidth={2.4}><path d="M5 12h14M13 6l6 6-6 6" /></symbol>
      <symbol id="fi-minus" viewBox="0 0 24 24" {...S} strokeWidth={2.7}><path d="M5 12h14" /></symbol>
      <symbol id="fi-cart" viewBox="0 0 24 24" {...S}><path d="M2.5 3h2.2l2.4 12.2a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.6L21 7H6" /><circle cx="9.5" cy="20" r="1.6" /><circle cx="17.5" cy="20" r="1.6" /></symbol>
      <symbol id="fi-send" viewBox="0 0 24 24" {...S}><path d="M21.5 2.5L11 13" /><path d="M21.5 2.5l-6.7 19-3.8-8.5-8.5-3.8z" /></symbol>
      <symbol id="fi-video" viewBox="0 0 24 24" {...S}><rect x="2" y="6" width="14" height="12" rx="3" /><path d="M16 10.5l6-3.5v10l-6-3.5z" /></symbol>
      <symbol id="fi-more" viewBox="0 0 24 24" {...S} strokeWidth={2.6}><path d="M12 6h.01M12 12h.01M12 18h.01" /></symbol>
      <symbol id="fi-logout" viewBox="0 0 24 24" {...S}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></symbol>
    </svg>
  );
}

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} aria-hidden>
      <use href={`#fi-${name}`} />
    </svg>
  );
}
