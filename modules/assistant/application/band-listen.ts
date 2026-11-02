import { isDrumKit, isPlayable, partHandles, type Score } from "@/modules/score";
import { bandLines, barList, chordAt, harmonies, median, noteName, onBeat, type Hit, type Line } from "./band-hits";

/** What the band sounds like together: each line in a sentence, and what a musician would fix. */
export type Listening = { lines: string[]; problems: string[] };

/** A share of on-beat notes outside the chord that is more than passing tones. */
const CLASH_SHARE = 0.3;
const CLASH_MIN = 3;
/** The same bar this often (of the bars a line plays) is a loop, not a part. */
const LOOP_SHARE = 0.6;
const LOOP_MIN_BARS = 4;
/** Two lines this close (semitones, by their middle note in a bar) share a register. */
const CROWD_SEMITONES = 3;
const CROWD_MIN_BARS = 2;
const FILL_PIECES = new Set(["tom1", "tom2", "tom3", "crash"]);
/** A bass landing with fewer than this share of the kicks is not locked with the drums. */
const KICK_LOCK = 0.5;

/**
 * Listens to the band's parts as they stand: facts about each line (where it plays, how busy,
 * its range) and the problems a band would hear (clashes with the chords, a loop instead of a
 * part, a bass not landing with the kick, two lines in one register, notes out of range, silence
 * where the others play). `names` gives each part handle its musician's name.
 */
export function listenToBand(score: Score, names: ReadonlyMap<string, string> = new Map()): Listening {
  const handles = partHandles(score);
  const who = (line: Line) => {
    const name = names.get(handles.get(line.part.id) ?? "");
    return name ? `${name} (${line.handle})` : line.handle;
  };
  const lines = bandLines(score);
  const playing = lines.filter((line) => line.hits.length);
  const chords = harmonies(score);
  const problems: string[] = [];
  const summary = playing.map((line) => describe(line, who(line)));

  for (const line of playing) {
    const name = who(line);
    if (isDrumKit(line.part.instrument)) {
      if (line.hits.length && !line.hits.some((hit) => hit.drums.some((piece) => FILL_PIECES.has(piece)))) {
        problems.push(`${name}: no fill or crash anywhere, the same groove start to end`);
      }
      continue;
    }
    const out = line.hits.filter((hit) => hit.midi.some((m) => !isPlayable(m, line.part.instrument)));
    if (out.length) problems.push(`${name}: notes outside its range in bars ${barList(out.map((hit) => hit.bar))}`);
    if (chords.length) problems.push(...clashes(line, name, chords));
    const loop = loopedBars(line.hits);
    if (loop) problems.push(`${name}: the same bar in ${loop.count} of ${loop.of} bars it plays: vary it`);
  }
  for (const lock of kickLock(playing, who)) (lock.locked ? summary : problems).push(lock.text);
  problems.push(...crowding(playing, who), ...silences(score, lines, who));
  return { lines: summary, problems };
}

function describe(line: Line, name: string): string {
  const bars = line.hits.map((hit) => hit.bar);
  const perBar = Math.round(line.hits.length / new Set(bars).size);
  if (isDrumKit(line.part.instrument)) return `${name}: plays bars ${barList(bars)}, about ${perBar} hits a bar`;
  const notes = line.hits.flatMap((hit) => hit.midi);
  const range = `${noteName(Math.min(...notes))}–${noteName(Math.max(...notes))}`;
  return `${name}: plays bars ${barList(bars)}, about ${perBar} notes a bar, ${range}`;
}

/** Notes on the beat outside the chord sounding, when there are more of them than passing tones. */
function clashes(line: Line, name: string, chords: ReturnType<typeof harmonies>): string[] {
  let total = 0;
  const off: number[] = [];
  for (const hit of line.hits) {
    const chord = onBeat(hit.beat) ? chordAt(chords, hit.bar, hit.beat) : null;
    if (!chord) continue;
    for (const midi of hit.midi) {
      total++;
      if (!chord.tones.has(midi % 12)) off.push(hit.bar);
    }
  }
  const found: string[] = [];
  if (off.length >= CLASH_MIN && off.length / total >= CLASH_SHARE) {
    found.push(`${name}: ${off.length} of ${total} notes on the beat are outside the chord (bars ${barList(off)})`);
  }
  if (line.part.instrument === "bass") {
    const starts = line.hits.filter((hit) => hit.beat === 0 && chordAt(chords, hit.bar, 0));
    const roots = starts.filter((hit) => Math.min(...hit.midi) % 12 === chordAt(chords, hit.bar, 0)!.root);
    if (starts.length && roots.length < starts.length / 2) {
      found.push(`${name}: on the chord's root at the start of only ${roots.length} of ${starts.length} bars`);
    }
  }
  return found;
}

/** The commonest bar of a line, when it is most of what the line plays. */
function loopedBars(hits: Hit[]): { count: number; of: number } | null {
  const bars = new Map<number, string[]>();
  for (const hit of hits) bars.set(hit.bar, [...(bars.get(hit.bar) ?? []), `${hit.beat}:${hit.midi.join(".")}`]);
  if (bars.size < LOOP_MIN_BARS) return null;
  const counts = new Map<string, number>();
  for (const bar of bars.values()) counts.set(bar.join(" "), (counts.get(bar.join(" ")) ?? 0) + 1);
  const count = Math.max(...counts.values());
  return count / bars.size >= LOOP_SHARE ? { count, of: bars.size } : null;
}

/** How often the bass starts a note with the kick drum, and whether that is locked with it. */
function kickLock(lines: Line[], who: (line: Line) => string): { text: string; locked: boolean }[] {
  const kicks = lines
    .filter((line) => isDrumKit(line.part.instrument))
    .flatMap((line) => line.hits.filter((hit) => hit.drums.includes("kick")).map((hit) => `${hit.bar}:${hit.beat}`));
  if (!kicks.length) return [];
  return lines
    .filter((line) => line.part.instrument === "bass")
    .map((line) => {
      const starts = new Set(line.hits.map((hit) => `${hit.bar}:${hit.beat}`));
      const together = kicks.filter((kick) => starts.has(kick)).length;
      const text = `${who(line)}: lands with the kick on ${together} of ${kicks.length} kicks`;
      return { text, locked: together / kicks.length >= KICK_LOCK };
    });
}

/** Pairs of lines sitting in the same register in the same bars. */
function crowding(lines: Line[], who: (line: Line) => string): string[] {
  const pitched = lines.filter((line) => !isDrumKit(line.part.instrument));
  const middles = pitched.map((line) => {
    const byBar = new Map<number, number[]>();
    for (const hit of line.hits) byBar.set(hit.bar, [...(byBar.get(hit.bar) ?? []), ...hit.midi]);
    return new Map([...byBar].map(([bar, notes]) => [bar, median(notes)]));
  });
  const found: string[] = [];
  pitched.forEach((a, i) =>
    pitched.slice(i + 1).forEach((b, k) => {
      const other = middles[i + 1 + k];
      const bars = [...middles[i]].filter(([bar, mid]) => {
        const theirs = other.get(bar);
        return theirs !== undefined && Math.abs(theirs - mid) <= CROWD_SEMITONES;
      });
      if (bars.length < CROWD_MIN_BARS) return;
      const around = noteName(median(bars.map(([, mid]) => mid)));
      found.push(
        `${who(a)} and ${who(b)} sit in the same register (around ${around}) in bars ${barList(bars.map(([bar]) => bar))}`,
      );
    }),
  );
  return found;
}

/** Parts silent in bars where the others play. */
function silences(score: Score, lines: Line[], who: (line: Line) => string): string[] {
  const busy = new Set(lines.flatMap((line) => line.hits.map((hit) => hit.bar)));
  const found: string[] = [];
  for (const part of score.parts) {
    const own = lines.filter((line) => line.part.id === part.id);
    const plays = new Set(own.flatMap((line) => line.hits.map((hit) => hit.bar)));
    const quiet = [...busy].filter((bar) => !plays.has(bar));
    if (own.length && quiet.length) found.push(`${who(own[0])}: silent in bars ${barList(quiet)} while others play`);
  }
  return found;
}
