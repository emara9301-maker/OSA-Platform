"use client";

import { useEffect } from "react";

// Browser-only setup, kept out of the markup: the page language follows the cookie, the offline
// service worker is registered, and a notice shows while the phone has no internet.
export function SiteEffects() {
  useEffect(() => {
    const ms = document.cookie.match(/osa_lang=(ms|en)/)?.[1] === "ms";
    document.documentElement.lang = ms ? "ms" : "en";

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }

    const update = () => {
      let banner = document.getElementById("osa-offline");
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "osa-offline";
        banner.style.cssText = "background:#8a4b00;color:#fff;padding:8px 16px;text-align:center";
        banner.textContent = ms
          ? "Anda sedang luar talian. Halaman yang baru dibuka masih dipaparkan. Bayaran, tempahan dan perubahan memerlukan internet."
          : "You are offline. Pages you opened recently are still shown. Payments, bookings and changes need internet.";
        document.body.prepend(banner);
      }
      banner.style.display = navigator.onLine ? "none" : "block";
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return null;
}
