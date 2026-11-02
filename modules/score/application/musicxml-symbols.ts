import type { ChordQuality } from "../domain/chords";
import { DRUM_PIECES, type DrumPiece } from "../domain/drums";
import { STEPS } from "../domain/pitch";
import type { Chord, Clef } from "../domain/schema";

/** MusicXML counts durations in divisions of a quarter: 24 holds 32nds, triplets and sextuplets exactly. */
export const DIVISIONS = 24;

export const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A note's written value (quarter beats, undotted) as its MusicXML type. */
const TYPES: Record<number, string> = {
  4: "whole",
  2: "half",
  1: "quarter",
  0.5: "eighth",
  0.25: "16th",
  0.125: "32nd",
};

/** The type and dot of a written value in quarter beats (1.5 is a dotted quarter). */
export function noteType(beats: number): { type: string; dotted: boolean } {
  if (TYPES[beats]) return { type: TYPES[beats], dotted: false };
  const base = beats / 1.5;
  return TYPES[base] ? { type: TYPES[base], dotted: true } : { type: "quarter", dotted: false };
}

const CLEFS: Record<Clef, string> = {
  treble: "<sign>G</sign><line>2</line>",
  bass: "<sign>F</sign><line>4</line>",
  treble8vb: "<sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change>",
  alto: "<sign>C</sign><line>3</line>",
  percussion: "<sign>percussion</sign>",
};
export const clefXml = (clef: Clef, number?: number) =>
  `<clef${number ? ` number="${number}"` : ""}>${CLEFS[clef]}</clef>`;

/** Where a drum piece sits, as the pitch of a treble staff's position (the bottom line is E4), and its head. */
export function drumDisplay(piece: DrumPiece): { step: string; octave: number; head: string } {
  const { position, head } = DRUM_PIECES[piece];
  const index = STEPS.indexOf("E") + position;
  return { step: STEPS[index % STEPS.length], octave: 4 + Math.floor(index / STEPS.length), head };
}

/** Chord qualities as MusicXML kinds; the symbol as written goes in the kind's text. */
const KINDS: Partial<Record<ChordQuality, string>> = {
  "": "major",
  m: "minor",
  dim: "diminished",
  aug: "augmented",
  sus2: "suspended-second",
  sus4: "suspended-fourth",
  "5": "power",
  "6": "major-sixth",
  m6: "minor-sixth",
  "7": "dominant",
  maj7: "major-seventh",
  m7: "minor-seventh",
  mMaj7: "major-minor",
  dim7: "diminished-seventh",
  m7b5: "half-diminished",
  "9": "dominant-ninth",
  maj9: "major-ninth",
  m9: "minor-ninth",
  "11": "dominant-11th",
  m11: "minor-11th",
  "13": "dominant-13th",
};

const rootXml = (tag: string, root: Chord["root"]) =>
  `<${tag}-step>${root.step}</${tag}-step>${root.alter ? `<${tag}-alter>${root.alter}</${tag}-alter>` : ""}`;

/** A chord symbol as MusicXML harmony, `offset` divisions into the bar. */
export function harmonyXml(chord: Chord, offset: number): string {
  const kind = KINDS[chord.quality] ?? "other";
  // The suffix as the sheet shows it ("maj7", "7♭9"), for tools that print the symbol as written.
  const text = escapeXml(chord.quality.replace(/b(?=\d)/g, "♭").replace(/#(?=\d)/g, "♯"));
  const bass = chord.bass ? `<bass>${rootXml("bass", chord.bass)}</bass>` : "";
  const at = offset ? `<offset>${offset}</offset>` : "";
  return `<harmony><root>${rootXml("root", chord.root)}</root><kind text="${text}">${kind}</kind>${bass}${at}</harmony>`;
}
