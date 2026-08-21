"use client";

import { useEffect, useRef } from "react";

/** Makes the device back button close an open sheet instead of leaving the app.
 *  Mount inside a sheet: pushes one history entry on open; back pops it and
 *  closes the sheet; closing with the × consumes the entry silently. */
export function useSheetHistory(close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });
  useEffect(() => {
    window.history.pushState({ ...(window.history.state ?? {}), yilSheet: true }, "");
    const onPop = () => closeRef.current();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.yilSheet) window.history.back();
    };
  }, []);
}
