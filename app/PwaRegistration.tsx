"use client";

import { useEffect, useRef, useState } from "react";

export default function PwaRegistration() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const reloading = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(registration => {
      if (disposed) return;
      if (registration.waiting) setWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(registration.waiting);
        });
      });
    }).catch(() => undefined);
    const reload = () => {
      if (reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", reload);
    return () => { disposed = true; navigator.serviceWorker.removeEventListener("controllerchange", reload); };
  }, []);

  if (!waiting) return null;
  return <aside className="updateBanner" role="status"><span><b>A new version is ready.</b><small>Refresh once to use the latest Event Work screens.</small></span><button onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}>Refresh update</button></aside>;
}
