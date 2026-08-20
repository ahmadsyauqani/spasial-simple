"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    // Remove the previous worker/cache version. The map app must load from
    // the network first; a stale worker can make the whole Vercel page fail.
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .then(() => caches.keys())
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch((err) => console.error("Service worker cleanup failed:", err));
  }, []);

  return null;
}
