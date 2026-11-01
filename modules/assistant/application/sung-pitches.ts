import {
  barEvents,
  eventOnsets,
  findVoiceId,
  isNote,
  measureCapacity,
  type BasicOperation,
  type Operation,
  type Pitch,
  type Score,
} from "@/modules/score";
import type { WrittenBar } from "./transcription-placement";

/** A note as the musician counts them: one per attack (a tied chain once), at its beat in the phrase. */
type Attack<T> = { at: number; value: T };

/** The written notes of consecutive score bars, by event ID; rests skipped. */
function writtenAttacks(score: Score, from: number, count: number, voiceId?: string): Attack<string>[] {
  const found: Attack<string>[] = [];
  let barStart = 0;
  let tiedOn = false;
  for (const measure of score.measures.slice(from - 1, from - 1 + count)) {
    const events = barEvents(measure, voiceId);
    const onsets = eventOnsets(events);
    events.forEach((event, i) => {
      if (isNote(event) && !tiedOn) found.push({ at: barStart + onsets[i], value: event.id });
      tiedOn = isNote(event) && Boolean(event.tie);
    });
    barStart += measureCapacity(measure.meter);
  }
  return found;
}

/** The sung notes of a transcription's bars, by pitch; rests skipped. */
function sungAttacks(bars: WrittenBar[], capacity: number): Attack<Pitch>[] {
  const found: Attack<Pitch>[] = [];
  let tiedOn = false;
  bars.forEach((events, b) => {
    let at = b * capacity;
    for (const event of events) {
      if (event.pitch && !tiedOn) found.push({ at, value: event.pitch });
      tiedOn = Boolean(event.pitch && event.tie);
      at += event.duration;
    }
  });
  return found;
}

/** Where each attack falls between the first and the last, from 0 to 1. */
function places<T>(list: Attack<T>[]): number[] {
  const first = list[0].at;
  const span = list[list.length - 1].at - first || 1;
  return list.map((attack) => (attack.at - first) / span);
}

/**
 * The sung pitches put onto the notes already written, keeping their lengths, ties and rests
 * ("the rhythm is right, the notes are wrong"). With as many notes sung as written they go in
 * order; otherwise each written note takes the sung note at the same place in the phrase.
 *
 * @param from first score bar (from 1)
 * @param count how many bars
 * @param line the line ("v1", "v2", an instrument handle)
 * @param sung the transcription of the singing for those bars
 */
export function pitchesOnto(
  score: Score,
  from: number,
  count: number,
  line: string,
  sung: WrittenBar[],
): { operations: BasicOperation[]; report: string } {
  const written = writtenAttacks(score, from, count, findVoiceId(score, line) ?? undefined);
  const heard = sungAttacks(sung, measureCapacity(score.measures[from - 1].meter));
  const bars = count > 1 ? `Bars ${from}–${from + count - 1}` : `Bar ${from}`;
  if (!written.length) throw new Error(`${bars} have no notes to take the sung pitches.`);
  if (!heard.length) throw new Error("No notes were heard in the singing.");
  const inOrder = written.length === heard.length;
  const heardPlaces = places(heard);
  const operations = places(written).map((place, k): BasicOperation => {
    const nearest = heardPlaces.reduce(
      (best, p, j) => (Math.abs(p - place) < Math.abs(heardPlaces[best] - place) ? j : best),
      0,
    );
    return { type: "setPitch", eventId: written[k].value, pitch: heard[inOrder ? k : nearest].value };
  });
  const report = inOrder
    ? `${bars}: ${heard.length} notes sung for the ${written.length} written; each took its sung pitch, the rhythm unchanged.`
    : `${bars}: ${heard.length} notes sung for ${written.length} written; each written note took the sung note at the same place in the phrase. Say so, and that singing the same number of notes is surest.`;
  return { operations, report };
}

type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };
type Access = { getScore: () => Score; commit: (operation: Operation) => ToolResult };

/** Each span's sung pitches onto the notes written in its bars, as one edit. */
export function writeSungPitches(
  access: Access,
  spans: { bar: number; count: number; line: string; sung: WrittenBar[] }[],
): ToolResult {
  const results = spans.map(({ bar, count, line, sung }) => pitchesOnto(access.getScore(), bar, count, line, sung));
  const commit = access.commit({ type: "batch", operations: results.flatMap((r) => r.operations) });
  if (!commit.ok) return commit;
  return {
    ok: true,
    rhythmKept: results.map((r) => r.report),
    changes: "changes" in commit ? commit.changes : undefined,
  };
}
