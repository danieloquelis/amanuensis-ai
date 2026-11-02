import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

/**
 * Whether the page is being printed (from the menu or ⌘P), so the print-only sheet is drawn just
 * then. While printing, the page is titled after the song: the print dialog names the PDF by it.
 */
export function usePrinting(title: string): boolean {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    let kept = document.title;
    const before = () => {
      kept = document.title;
      document.title = title;
      // Drawn before the browser lays the page out for print.
      flushSync(() => setPrinting(true));
    };
    const after = () => {
      document.title = kept;
      setPrinting(false);
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [title]);
  return printing;
}
