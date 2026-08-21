// Service worker minim, doar pentru instalabilitate (prompt-ul nativ de instalare pe Android
// cere unul înregistrat cu un handler de fetch). Nu face caching, nu ține stare offline —
// PLAN.md exclude explicit sincronizarea offline. Fiecare cerere trece direct la rețea.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
