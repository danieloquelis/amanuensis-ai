import { columnText, compareHeads, type HeadDifference } from "@/modules/page";
import {
  eventPitches,
  findStaff,
  scoreKey,
  toWritten,
  transpositionOf,
  voiceBars,
  voiceInfo,
  type Pitch,
  type Score,
} from "@/modules/score";
import type { SourceState } from "./source-reading-tool";
import { pageCheckSchema } from "./source-tool-schemas";

type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };

/** Differences listed at most, so a badly misread page doesn't flood the conversation. */
const SHOWN_DIFFERENCES = 24;

/** The line or space a written note sits on, as the page would show it: "E5" for E♭5 or E♮5. */
/** A bar of one staff where the written notes and the page's heads differ; `page` is its heads in key, as score text. */
type BarDifference = HeadDifference & { bar: number; staff: string; page: string; written: string };

const lineOrSpace = (pitch: Pitch) => `${pitch.step}${pitch.octave}`;

/**
 * Every note written in one bar on one staff (all its voices), by line or space, as its part's page
 * shows it; `tied` are those tied over from a note earlier in the bar (a page may show the pair as
 * one dotted note).
 */
function writtenHeads(score: Score, bar: number, staffId: string): { heads: string[]; tied: string[] } {
  const heads: string[] = [];
  const tied: string[] = [];
  const measure = score.measures[bar - 1];
  if (!measure) return { heads, tied };
  for (const line of voiceBars(measure)) {
    const info = voiceInfo(score, line.voiceId);
    if (info?.staff.id !== staffId) continue;
    const t = transpositionOf(info.part.instrument);
    const shown = (pitch: Pitch) => lineOrSpace(t ? toWritten(pitch, t, scoreKey(score)) : pitch);
    line.events.forEach((event, k) => {
      if (event.drums?.length) return;
      const names = eventPitches(event).map(shown);
      heads.push(...names);
      if (k > 0 && line.events[k - 1].tie) tied.push(...names);
    });
  }
  return { heads, tied };
}

/** `names` without one occurrence of each of `excused`. */
function without(names: string[], excused: string[]): string[] {
  const left = [...names];
  for (const name of excused) {
    const index = left.indexOf(name);
    if (index !== -1) left.splice(index, 1);
  }
  return left;
}

/**
 * The written bars against the heads the detector found on a page, bar by bar and staff by staff:
 * which heads on the page nothing written matches, and which written notes have no head there.
 */
export function checkPage(raw: unknown, score: Score, state: SourceState): ToolResult {
  const args = pageCheckSchema.parse(raw);
  const page = state.pages.get(args.attachment);
  if (!page) {
    throw new Error(`Attachment ${args.attachment} has no detected heads: read it with music_read_source first.`);
  }
  if (page.staves % args.staves.length) {
    throw new Error(`The page has ${page.staves} staves, not systems of ${args.staves.length}.`);
  }
  const differences: BarDifference[] = [];
  let checked = 0;
  for (const [k, handle] of args.staves.entries()) {
    const staff = findStaff(score, handle);
    if (!staff) throw new Error(`There is no staff "${handle}".`);
    // The staff's bars across every system of the page, in order.
    const bars = page.bars.filter((_, s) => s % args.staves.length === k).flat();
    if (!bars.length) continue;
    const fifths = scoreKey(score).fifths;
    bars.forEach((columns, index) => {
      const bar = args.firstBar + index;
      // Page bars past the score's end (a page longer than a score holds) are not compared.
      if (bar > score.measures.length) return;
      const { heads: written, tied } = writtenHeads(score, bar, staff.id);
      const compared = compareHeads(columns.flat(), written);
      const { missing } = compared;
      const extra = without(compared.extra, tied);
      checked++;
      if (!missing.length && !extra.length) return;
      const page = columns.map((names) => columnText(names, fifths)).join(" ");
      differences.push({ bar, staff: handle, page, written: written.join(" "), missing, extra });
    });
  }
  return {
    ok: true,
    checked: `${checked - differences.length} of ${checked} bars match the page`,
    differences: differences.slice(0, SHOWN_DIFFERENCES),
    ...(differences.length
      ? {
          next: "Rewrite each listed bar with score_write so its notes are the page's heads, in order (missing: heads on the page you didn't write; extra: notes with no head there), then page_check again. Leave only what is the detector's mistake: a time signature's digits, a flag, an ornament's small notes, a missed head.",
        }
      : {}),
  };
}
