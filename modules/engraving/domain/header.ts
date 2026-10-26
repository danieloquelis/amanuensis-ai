import { keySignatureSteps, type KeySignature } from "@/modules/score";
import type { AnalyzedBar } from "./measure-analysis";
import { positionY, type KeyAccidentalMark } from "./scene";

const CLEF_END = 84;
const KEY_START = 88;
const KEY_ACCIDENTAL_WIDTH = 11;
const METER_WIDTH = 32;
const HEADER_GAP = 8;

/** Treble-staff positions (steps above the bottom line) for each signature accidental, in order. */
const SHARP_POSITIONS = [8, 5, 9, 6, 3, 7, 4];
const FLAT_POSITIONS = [4, 7, 3, 6, 2, 5, 1];

/** End of the key signature (or the clef when there is none). */
const keyEnd = (key: KeySignature) =>
  key.fifths === 0 ? CLEF_END : KEY_START + Math.abs(key.fifths) * KEY_ACCIDENTAL_WIDTH;

/** Where the first bar of a system starts: after clef, key signature and any time signature. */
export function headerEnd(key: KeySignature, firstBar: AnalyzedBar): number {
  return keyEnd(key) + (firstBar.meterChanges ? METER_WIDTH : HEADER_GAP);
}

/** Centre of a time signature drawn in the system header. */
export const headerMeterX = (key: KeySignature) => keyEnd(key) + METER_WIDTH / 2;

/** Key signature accidentals repeated at the start of every system. `x` is each glyph's left edge. */
export function keySignatureMarks(key: KeySignature, top: number): KeyAccidentalMark[] {
  const positions = key.fifths > 0 ? SHARP_POSITIONS : FLAT_POSITIONS;
  return keySignatureSteps(key).map(({ alter }, index) => ({
    x: KEY_START + index * KEY_ACCIDENTAL_WIDTH,
    y: positionY(top, positions[index]),
    alter,
  }));
}
