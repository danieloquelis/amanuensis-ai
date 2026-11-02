import { useEffect } from "react";

/**
 * A song opened to be printed ("?print=1", from Home's menu): once its sheet is drawn and its
 * fonts have loaded, the print dialog opens (where it can be saved as a PDF); the flag is dropped,
 * so a reload does not print again.
 */
export function usePrintOnOpen(ready: boolean) {
  useEffect(() => {
    if (!ready || !new URLSearchParams(location.search).has("print")) return;
    history.replaceState(history.state, "", location.pathname);
    let cancelled = false;
    void document.fonts.ready.then(() =>
      requestAnimationFrame(() => {
        if (!cancelled) window.print();
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [ready]);
}
