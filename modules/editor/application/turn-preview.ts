import {
  applyCommand,
  beats,
  eventOnsets,
  eventPitches,
  voiceBars,
  writeBars,
  type Command,
  type Pitch,
  type Score,
  type ScoreEvent,
  type WrittenPitches,
} from "@/modules/score";

/** Bars the assistant is writing right now (score text), under the request ID they will be written with. */
export type TurnDraft = { requestId: string; text: string; pitches: WrittenPitches };

/**
 * The score as an assistant turn has it so far: the committed score with the turn's commands
 * applied, as they will be when the turn ends (so IDs match and nothing changes at the end).
 * Null when they no longer apply to it.
 */
export function turnPreview(score: Score, commands: readonly Command[]): Score | null {
  try {
    return commands.reduce((current, command) => applyCommand(current, command), score);
  } catch {
    return null;
  }
}

/**
 * The score with the bars being written drawn in, as they will be written (same request ID, so the
 * same IDs). Lines that cannot be written yet are left out from the end, one at a time.
 */
export function withDraft(score: Score, draft: TurnDraft): Score {
  const lines = draft.text.split("\n").filter(Boolean);
  for (let count = lines.length; count > 0; count--) {
    try {
      return writeBars(score, lines.slice(0, count).join("\n"), draft.requestId, draft.pitches).score;
    } catch {
      // A line that doesn't fit yet: try without it.
    }
  }
  return score;
}

const spelled = (pitch: Pitch) => `${pitch.step}${pitch.alter}/${pitch.octave}`;

/** What a note, rest or drum hit shows: its notes, drum pieces and value. A change to any of it makes it arrive again. */
const looks = (event: ScoreEvent) =>
  [
    eventPitches(event).map(spelled).join(" "),
    (event.drums ?? []).join(" "),
    beats(event.duration),
    event.measureRest ?? "",
  ].join("|");

/** Every event of a score with how it looks, in page order: bar by bar, then by where it starts in the bar. */
function inPageOrder(score: Score): { id: string; looks: string }[] {
  return score.measures.flatMap((measure) =>
    voiceBars(measure)
      .flatMap((bar) => {
        const onsets = eventOnsets(bar.events);
        return bar.events.map((event, k) => ({ id: event.id, looks: looks(event), at: onsets[k] }));
      })
      .sort((a, b) => a.at - b.at),
  );
}

/**
 * The events new or changed in `after`, each with its place in the order they appear on the page
 * (0 first), so they can be shown arriving left to right.
 */
export function arrivals(before: Score, after: Score): Map<string, number> {
  const previous = new Map(inPageOrder(before).map((event) => [event.id, event.looks]));
  const arrived = new Map<string, number>();
  for (const event of inPageOrder(after)) {
    if (previous.get(event.id) !== event.looks) arrived.set(event.id, arrived.size);
  }
  return arrived;
}
