"use client";

import { useEffect } from "react";

// Keeps the service worker registered on every visit so push subscriptions
// created in Settings stay alive across app updates.
export default function SwRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
