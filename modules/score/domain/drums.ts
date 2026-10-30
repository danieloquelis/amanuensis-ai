/**
 * A drum kit on a percussion staff. A hit is an event with `drums` (the pieces struck together)
 * and no pitch. Each piece has its place on the staff and its notehead, as drum music is written:
 * hands (cymbals, snare, toms) in voice 1 with stems up, feet (kick, hi-hat pedal) in voice 2 with
 * stems down. `midi` is the General MIDI drum note, which names the sample that plays it.
 */

export const DRUM_PIECE_CODES = [
  "kick",
  "snare",
  "stick",
  "tom1",
  "tom2",
  "tom3",
  "hat",
  "hatopen",
  "hatfoot",
  "crash",
  "ride",
  "bell",
] as const;

export type DrumPiece = (typeof DRUM_PIECE_CODES)[number];

/** Notehead shapes: normal for drums, x for cymbals, a circled x for a side stick, a diamond for a ride bell. */
export type DrumHead = "normal" | "x" | "circle-x" | "diamond";

export type DrumPieceInfo = {
  name: string;
  /** Staff steps above the bottom line (the bottom line is 0, the top line 8). */
  position: number;
  head: DrumHead;
  /** 1: hands (stems up); 2: feet (stems down). */
  voice: 1 | 2;
  midi: number;
};

export const DRUM_PIECES: Record<DrumPiece, DrumPieceInfo> = {
  kick: { name: "bass drum", position: 1, head: "normal", voice: 2, midi: 36 },
  snare: { name: "snare", position: 5, head: "normal", voice: 1, midi: 38 },
  stick: { name: "side stick", position: 5, head: "circle-x", voice: 1, midi: 37 },
  tom1: { name: "high tom", position: 7, head: "normal", voice: 1, midi: 50 },
  tom2: { name: "mid tom", position: 6, head: "normal", voice: 1, midi: 47 },
  tom3: { name: "floor tom", position: 3, head: "normal", voice: 1, midi: 43 },
  hat: { name: "hi-hat", position: 9, head: "x", voice: 1, midi: 42 },
  hatopen: { name: "open hi-hat", position: 9, head: "x", voice: 1, midi: 46 },
  hatfoot: { name: "hi-hat pedal", position: -1, head: "x", voice: 2, midi: 44 },
  crash: { name: "crash cymbal", position: 10, head: "x", voice: 1, midi: 49 },
  ride: { name: "ride cymbal", position: 8, head: "x", voice: 1, midi: 51 },
  bell: { name: "ride bell", position: 8, head: "diamond", voice: 1, midi: 53 },
};

/** Pieces struck together on one stem, at most. */
export const MAX_DRUM_HITS = 4;

/** The pieces of a hit, none for a rest or a pitched note. */
export const drumsOf = (event: { drums?: readonly DrumPiece[] }): readonly DrumPiece[] => event.drums ?? [];

/** Pieces as stored: each once, lowest on the staff first (a snare before a hi-hat). */
export function sortDrums(pieces: readonly DrumPiece[]): DrumPiece[] {
  const unique = [...new Set(pieces)];
  if (unique.length > MAX_DRUM_HITS) throw new Error(`A drum hit strikes at most ${MAX_DRUM_HITS} pieces at once.`);
  return unique.sort(
    (a, b) =>
      DRUM_PIECES[a].position - DRUM_PIECES[b].position || DRUM_PIECE_CODES.indexOf(a) - DRUM_PIECE_CODES.indexOf(b),
  );
}

/** "snare and hi-hat", for labels. */
export const drumNames = (pieces: readonly DrumPiece[]) =>
  pieces
    .map((piece) => DRUM_PIECES[piece].name)
    .join(", ")
    .replace(/, ([^,]+)$/, " and $1");

/** An open hi-hat rings until the next closed or pedal hit chokes it. */
export const CHOKES_OPEN_HAT: readonly DrumPiece[] = ["hat", "hatfoot"];
