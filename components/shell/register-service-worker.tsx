"use client";

import { useEffect } from "react";

/**
 * Înregistrează service worker-ul minim din /public/sw.js — doar pentru ca Android/Chrome
 * să considere aplicația instalabilă (prompt nativ). Nu face caching sau logică offline.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // instalabilitatea rămâne opțională — o eroare aici nu trebuie să blocheze aplicația
    });
  }, []);

  return null;
}
