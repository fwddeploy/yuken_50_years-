"use client";

import { useEffect, useRef } from "react";

/** Number of sheet layers currently mounted across the app. Sheets can stack
 *  (e.g. the search panel with an activity sheet on top), so yilSheet is a
 *  DEPTH, not a boolean — each layer only reacts to pops that cross its own
 *  depth, which is what makes one Back close exactly one layer. */
let mountedSheetDepth = 0;

function stateDepth(state: unknown): number {
  const value = (state as { yilSheet?: unknown } | null)?.yilSheet;
  if (typeof value === "number") return value;
  return value ? 1 : 0;
}

/** Makes the device back button close an open sheet instead of leaving the app.
 *  Mount inside a sheet: pushes one history entry on open; back pops it and
 *  closes ONLY the topmost sheet; closing with the × consumes the entry
 *  silently. Navigation code that closes sheets as a side effect must strip
 *  yilSheet from the entry it writes (see closingSheet in EventOperationsApp)
 *  so this hook's cleanup knows not to consume a navigation entry. */
export function useSheetHistory(close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });
  useEffect(() => {
    mountedSheetDepth += 1;
    const myDepth = mountedSheetDepth;
    window.history.pushState({ ...(window.history.state ?? {}), yilSheet: myDepth }, "");
    const onPop = (event: PopStateEvent) => {
      if (stateDepth(event.state) < myDepth) closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      mountedSheetDepth = Math.max(0, mountedSheetDepth - 1);
      if (stateDepth(window.history.state) >= myDepth) window.history.back();
    };
  }, []);
}
