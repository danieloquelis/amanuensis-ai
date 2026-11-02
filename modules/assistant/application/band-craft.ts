import { partHandles, type Score } from "@/modules/score";
import { barList } from "./band-hits";
import { literalRepeats, noteLengths, parallels, quickShare, sameRhythm, scaleShare } from "./band-counterpoint";
import { dynamicShape, heldClashes, motivicUnity, texture } from "./band-motifs";
import { voiceLines, type VoiceLine } from "./band-voices";

/** What a piece's craft measures: numbers for evaluation, and what a composer would fix. */
export type Craft = {
  facts: {
    parallels: number;
    sameRhythm: number;
    scales: number;
    unity: number;
    levels: number;
    swells: number;
    tutti: number;
    groupings: number;
    clashes: number;
    /** The busiest voice's share of notes shorter than a beat. */
    motion: number;
    /** The most times any voice plays the same two bars again note for note. */
    repeats: number;
  };
  problems: string[];
};

/** Rules of counterpoint (no parallel fifths, independent rhythms) bind only where the style keeps them. */
export type CraftRules = { counterpoint: boolean };

const SCALE_SHARE = 0.4;
const SCALE_MIN_NOTES = 16;
const SAME_RHYTHM = 0.6;
const SAME_RHYTHM_BARS = 4;
const ONE_LENGTH_NOTES = 12;
const LEVELS_MIN_BARS = 8;
const TUTTI = 0.85;
const TUTTI_MIN_BARS = 12;
const TUTTI_MIN_PARTS = 3;
const UNITY = 0.15;
const UNITY_MIN_NOTES = 60;
const CLASHES = 0.25;
/** Two voices doubled for this many bars lose one voice of the counterpoint. */
const DOUBLED_BARS = 4;
/** A voice with this many notes, none shorter than a beat, plods. */
const PLODDING_NOTES = 12;
/** A band whose busiest voice moves this little has no rhythmic drive. */
const STILL_BAND = 0.2;
const STILL_BAND_NOTES = 40;
/** The same two bars this many times is copying, not development. */
const LITERAL_TIMES = 3;

/**
 * The craft of the band's music as a composition teacher would mark it: lines that are only
 * scales or one note value, figures that never come back, no dynamic shape, everyone playing all
 * the time, and (where the style keeps them) parallel fifths and octaves, voices moving in one
 * rhythm and held clashes. `names` gives each part handle its musician's name.
 */
export function craftOf(score: Score, rules: CraftRules, names: ReadonlyMap<string, string> = new Map()): Craft {
  const handles = partHandles(score);
  const who = (line: VoiceLine) => {
    const name = names.get(handles.get(line.part.id) ?? "");
    return name ? `${name} (${line.handle})` : line.handle;
  };
  const lines = voiceLines(score);
  const problems: string[] = [];
  let parallelCount = 0;
  let sameRhythmMax = 0;
  lines.forEach((a, i) =>
    lines.slice(i + 1).forEach((b) => {
      const found = parallels(a, b);
      parallelCount += found.bars.length;
      if (rules.counterpoint && found.bars.length) {
        problems.push(
          `${who(found.upper)} and ${who(found.lower)}: parallel fifths or octaves in bars ${barList(found.bars)}: move one of them by contrary or oblique motion`,
        );
      }
      // A doubling for the peak is orchestration; one that runs on loses a voice of the counterpoint.
      if (rules.counterpoint && new Set(found.doubled).size >= DOUBLED_BARS) {
        problems.push(
          `${who(found.upper)} and ${who(found.lower)}: doubled in octaves or unison through bars ${barList(found.doubled)}: give one its own line (keep doublings for the peak)`,
        );
      }
      const rhythm = sameRhythm(a, b);
      sameRhythmMax = Math.max(sameRhythmMax, rhythm.share);
      if (rules.counterpoint && rhythm.share >= SAME_RHYTHM && rhythm.bars.length >= SAME_RHYTHM_BARS) {
        problems.push(
          `${who(a)} and ${who(b)}: the same rhythm in bars ${barList(rhythm.bars)}: give one its own rhythm (move while the other holds)`,
        );
      }
    }),
  );
  let scalesMax = 0;
  let repeatsMax = 0;
  for (const line of lines) {
    const share = scaleShare(line);
    scalesMax = Math.max(scalesMax, share);
    if (share >= SCALE_SHARE && line.notes.length >= SCALE_MIN_NOTES) {
      problems.push(
        `${who(line)}: ${Math.round(share * 100)}% of its notes are scale runs: give the line a shape (a motif, turns, leaps answered by steps)`,
      );
    }
    if (noteLengths(line) <= 1 && line.notes.length >= ONE_LENGTH_NOTES) {
      problems.push(`${who(line)}: every note is the same length: vary the rhythm`);
    } else if (quickShare(line) === 0 && line.notes.length >= PLODDING_NOTES && !keepsTime(line)) {
      problems.push(
        `${who(line)}: only quarter notes and longer: give it motion (eighths, dotted rhythms, syncopation, a run into the next phrase)`,
      );
    }
    const repeat = literalRepeats(line);
    repeatsMax = Math.max(repeatsMax, repeat.times);
    if (repeat.times >= LITERAL_TIMES) {
      problems.push(
        `${who(line)}: the same two bars note for note ${repeat.times} times (from bars ${barList(repeat.bars)}): develop them instead (vary, sequence, fragment, answer)`,
      );
    }
  }
  const motion = Math.max(0, ...lines.map(quickShare));
  const notesAll = lines.reduce((sum, line) => sum + line.notes.length, 0);
  if (motion < STILL_BAND && notesAll >= STILL_BAND_NOTES) {
    problems.push(
      "No part keeps the music moving: the band plays only long notes. Let one part drive in eighths or faster (an ostinato, a running line, a groove) under the long notes",
    );
  }
  const unity = motivicUnity(lines);
  const notes = lines.reduce((sum, line) => sum + line.notes.length, 0);
  if (unity < UNITY && notes >= UNITY_MIN_NOTES) {
    problems.push(
      "Little comes back: the parts hardly repeat or share a figure. Build them from the song's material (its motif or tune, moved, inverted, in pieces)",
    );
  }
  const shape = dynamicShape(score);
  if (shape.levels.length < 2 && score.measures.length >= LEVELS_MIN_BARS) {
    problems.push(
      "The piece stays at one dynamic: mark where it grows, where it peaks and where it falls back (pp to ff, cresc., dim.)",
    );
  }
  const band = texture(score);
  if (band.tutti >= TUTTI && band.bars >= TUTTI_MIN_BARS && score.parts.length >= TUTTI_MIN_PARTS) {
    problems.push(
      "Everyone plays in nearly every bar: thin the texture somewhere (a part rests or enters later) so the full band means something",
    );
  }
  const clashes = heldClashes(score);
  if (rules.counterpoint && clashes.share >= CLASHES) {
    problems.push(`Held seconds or sevenths on the beat between parts in bars ${clashes.bars}: resolve them by step`);
  }
  return {
    facts: {
      parallels: parallelCount,
      sameRhythm: round(sameRhythmMax),
      scales: round(scalesMax),
      unity: round(unity),
      levels: shape.levels.length,
      swells: shape.swells,
      tutti: round(band.tutti),
      groupings: band.groupings,
      clashes: round(clashes.share),
      motion: round(motion),
      repeats: repeatsMax,
    },
    problems,
  };
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Bass lines (a walking bass, roots in halves) and a piano's lower staff may keep to long values. */
const keepsTime = (line: VoiceLine) =>
  line.part.instrument === "bass" || line.part.instrument === "doublebass" || /\.\d/.test(line.handle);
