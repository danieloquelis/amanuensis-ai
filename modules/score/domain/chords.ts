import { STEPS, type Step } from "./pitch";

/** Chord qualities with their intervals in semitones above the root. */
export const CHORD_QUALITIES = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "5": [0, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "6/9": [0, 4, 7, 9, 14],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  mMaj7: [0, 3, 7, 11],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  "7sus4": [0, 5, 7, 10],
  "7b5": [0, 4, 6, 10],
  "7#5": [0, 4, 8, 10],
  "7b9": [0, 4, 7, 10, 13],
  "7#9": [0, 4, 7, 10, 15],
  "7#11": [0, 4, 7, 10, 18],
  add9: [0, 4, 7, 14],
  "9": [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  "11": [0, 7, 10, 14, 17],
  m11: [0, 3, 7, 10, 14, 17],
  "13": [0, 4, 7, 10, 14, 21],
} as const satisfies Record<string, readonly number[]>;

export type ChordQuality = keyof typeof CHORD_QUALITIES;
export const CHORD_QUALITY_NAMES = Object.keys(CHORD_QUALITIES) as ChordQuality[];

/** Other common spellings, normalized before lookup. */
const QUALITY_ALIASES: Record<string, ChordQuality> = {
  maj: "",
  M: "",
  min: "m",
  "-": "m",
  "°": "dim",
  o: "dim",
  "+": "aug",
  sus: "sus4",
  M7: "maj7",
  ma7: "maj7",
  Maj7: "maj7",
  "∆": "maj7",
  "∆7": "maj7",
  Δ: "maj7",
  Δ7: "maj7",
  min7: "m7",
  "-7": "m7",
  "m(maj7)": "mMaj7",
  mM7: "mMaj7",
  "-∆7": "mMaj7",
  "°7": "dim7",
  o7: "dim7",
  ø: "m7b5",
  ø7: "m7b5",
  "m7(b5)": "m7b5",
  "-7b5": "m7b5",
  "7+": "7#5",
  "7aug": "7#5",
  M9: "maj9",
  "∆9": "maj9",
  min9: "m9",
  "-9": "m9",
  "69": "6/9",
  "2": "sus2",
};

export type ChordRoot = { step: Step; alter: -1 | 0 | 1 };

const ROOT = /^([A-Ga-g])([#♯b♭]?)/;

function parseRoot(text: string): { root: ChordRoot; rest: string } | null {
  const match = ROOT.exec(text);
  if (!match) return null;
  const accidental = match[2];
  const alter = accidental === "#" || accidental === "♯" ? 1 : accidental === "b" || accidental === "♭" ? -1 : 0;
  return { root: { step: match[1].toUpperCase() as Step, alter }, rest: text.slice(match[0].length) };
}

/**
 * Parses a chord symbol such as "Cmaj7", "F#m7b5", "B♭7/D" or "Cø". Returns null when the
 * text is not a supported chord, so callers can explain the vocabulary.
 */
export function parseChordSymbol(input: string): { root: ChordRoot; quality: ChordQuality; bass?: ChordRoot } | null {
  const text = input.trim().replace(/♯/g, "#").replace(/♭/g, "b");
  const head = parseRoot(text);
  if (!head) return null;
  let qualityText = head.rest;
  let bass: ChordRoot | undefined;
  const slash = qualityText.lastIndexOf("/");
  if (slash !== -1 && qualityText.slice(0, slash) !== "6") {
    const bassPart = parseRoot(qualityText.slice(slash + 1));
    if (!bassPart || bassPart.rest) return null;
    bass = bassPart.root;
    qualityText = qualityText.slice(0, slash);
  }
  const quality = (qualityText in CHORD_QUALITIES ? qualityText : QUALITY_ALIASES[qualityText]) as
    ChordQuality | undefined;
  if (quality === undefined) return null;
  return bass ? { root: head.root, quality, bass } : { root: head.root, quality };
}

const accidentalText = (alter: number) => (alter === 1 ? "♯" : alter === -1 ? "♭" : "");
const rootText = (root: ChordRoot) => `${root.step}${accidentalText(root.alter)}`;

/** Display text: "C♯m7♭5/E". */
export function formatChord(chord: { root: ChordRoot; quality: ChordQuality; bass?: ChordRoot }): string {
  const quality = chord.quality.replace(/b(?=\d)/g, "♭").replace(/#(?=\d)/g, "♯");
  return `${rootText(chord.root)}${quality}${chord.bass ? `/${rootText(chord.bass)}` : ""}`;
}

/** Pitch class (0–11, C = 0) of a chord root or bass. */
export function pitchClass(root: ChordRoot): number {
  const semitones = [0, 2, 4, 5, 7, 9, 11][STEPS.indexOf(root.step)];
  return (semitones + root.alter + 12) % 12;
}
