import { scoreKey, suggestChords, type BasicOperation, type Score } from "@/modules/score";
import { suggestChordsSchema } from "./music-tool-schemas";
import type { ScoreAccess } from "./voice-transcription-tool";

type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };

/**
 * Chords that fit the melody in some bars, as a musician would harmonize it, with each bar's
 * closest alternatives so the agent can weigh what it knows of the song. With `write`, the
 * suggestion replaces the chords in those bars as one edit.
 */
export function suggestChordsForScore(raw: unknown, access: ScoreAccess | null): ToolResult {
  if (!access) throw new Error("There is no score to harmonize.");
  const args = suggestChordsSchema.parse(raw);
  const score = access.getScore();
  const from = args.fromBar ?? 1;
  const to = Math.min(args.toBar ?? score.measures.length, score.measures.length);
  if (from > to) throw new Error(`Bars ${from}–${to} are not in the score (it has ${score.measures.length}).`);
  const key = args.key ?? scoreKey(score);
  const harmony = suggestChords(score, { key, from, to, perBar: args.chordsPerBar });
  const bars = Object.fromEntries(
    harmony.slots.map((slot) => [
      `bar ${slot.bar}${slot.beat ? ` beat ${slot.beat + 1}` : ""}`,
      `${slot.best} (fits ${slot.candidates.map((c) => `${c.symbol} ${Math.round(c.fit * 100)}%`).join(", ")})`,
    ]),
  );
  const result = { ok: true as const, progression: harmony.progression.join(" | "), bars };
  if (!args.write) return { ...result, written: false };
  const commit = access.commit({ type: "batch", operations: replaceChords(score, harmony.slots, from, to) });
  return commit.ok ? { ...result, written: true, changes: "changes" in commit ? commit.changes : undefined } : commit;
}

/** Removes the chords already in bars `from`–`to` and puts the suggested ones in their place. */
function replaceChords(
  score: Score,
  slots: { bar: number; beat: number; best: string }[],
  from: number,
  to: number,
): BasicOperation[] {
  const barIds = new Set(score.measures.slice(from - 1, to).map((m) => m.id));
  const removals = score.chords
    .filter((chord) => barIds.has(chord.measureId))
    .map((chord): BasicOperation => ({ type: "removeNotation", id: chord.id }));
  const additions = slots.map((slot): BasicOperation => ({
    type: "putChord",
    measureId: score.measures[slot.bar - 1].id,
    beat: slot.beat,
    symbol: slot.best,
  }));
  return [...removals, ...additions];
}
