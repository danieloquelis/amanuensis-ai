import { useEffect, useState } from "react";
import { DEFAULT_THINKING, type Thinking } from "../../application/thinking";
import { loadThinking, saveThinking } from "../../infrastructure/local-thinking";

/** How long the assistant may think, as the musician last chose it in this browser. */
export function useThinking() {
  const [level, setLevel] = useState<Thinking>(DEFAULT_THINKING);
  // Read after mount, so the server and the first client render agree.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setLevel(loadThinking()));
    return () => cancelAnimationFrame(frame);
  }, []);
  const choose = (next: Thinking) => {
    setLevel(next);
    saveThinking(next);
  };
  return { level, choose };
}
