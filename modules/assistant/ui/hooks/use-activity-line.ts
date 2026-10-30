import { useEffect, useState } from "react";
import type { ProgressEvent } from "../../application/run-assistant";

/** Short, plain lines for what the assistant is doing; never its wording. */
const TOOL_LINES: Record<string, string> = {
  score_get_context: "Reading the score",
  score_edit: "Updating the score",
  score_undo: "Taking that back",
  music_infer_key: "Finding the key",
  music_infer_tempo: "Feeling the tempo",
  voice_transcribe_melody: "Writing down your melody",
  music_read_source: "Reading the page",
  score_write: "Writing the bars",
  page_check: "Checking against the page",
  assistant_ask: "Thinking of a question",
};

/** What a musician might be doing while thinking. Rotated while the model thinks. */
const THINKING_LINES = [
  "Tuning up",
  "Counting you in",
  "Finding the downbeat",
  "Humming it back",
  "Rosining the bow",
  "Checking the key signature",
  "Looking for the one",
  "Warming up the scales",
  "Reading between the bar lines",
  "Resolving the cadence",
];
const ROTATE_MS = 2200;

/**
 * The one line shown while a turn works: the current step when the assistant is using a tool,
 * otherwise a rotating musical phrase.
 */
export function useActivityLine(activity: ProgressEvent | undefined): string {
  const [tick, setTick] = useState(() => Math.floor(Math.random() * THINKING_LINES.length));
  const thinking = !activity || activity.stage === "thinking" || activity.stage === "heard";
  useEffect(() => {
    if (!thinking) return;
    const timer = setInterval(() => setTick((t) => t + 1), ROTATE_MS);
    return () => clearInterval(timer);
  }, [thinking]);
  if (activity?.stage === "hearing") return "Listening to your take";
  if (activity?.stage === "tool") return TOOL_LINES[activity.tool] ?? "Working on it";
  return THINKING_LINES[tick % THINKING_LINES.length];
}
