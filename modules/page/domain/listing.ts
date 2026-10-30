import type { Head } from "./heads";
import type { Staff } from "./staves";

// The heads found on a staff as a musician would name them, and as text a model reads reliably.

/** Step of each clef's bottom line, counting C0 as 0: E4 for treble, G2 for bass, F3 for alto, D3 for tenor. */
const BOTTOM_LINE: Record<string, number> = {
  treble: 4 * 7 + 2,
  treble8vb: 4 * 7 + 2,
  bass: 2 * 7 + 4,
  alto: 3 * 7 + 3,
  tenor: 3 * 7 + 1,
};
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
/** Heads closer than this many staff spaces across share a column (a chord). */
const COLUMN = 0.5;

/** The clefs whose positions name pitches; a drum staff's positions are instruments. */
export const PITCHED_CLEFS = Object.keys(BOTTOM_LINE);

/** The line or space a head sits on, by name (letter and octave) on its clef; null for a clef without pitches. */
export function headName(clef: string, position: number): string | null {
  const bottom = BOTTOM_LINE[clef];
  if (bottom === undefined) return null;
  const step = bottom + position;
  return `${LETTERS[((step % 7) + 7) % 7]}${Math.floor(step / 7)}`;
}

/** Letters a key signature alters, in the order it adds them: sharps from F, flats from B. */
const SHARPS = "FCGDAEB";
const FLATS = "BEADGCF";

/** A head's name with the key signature applied: "E5" in E♭ major (fifths -3) is "Eb5". */
export function inKey(name: string, fifths: number): string {
  const letter = name[0];
  if (fifths > 0 && SHARPS.slice(0, fifths).includes(letter)) return `${letter}#${name.slice(1)}`;
  if (fifths < 0 && FLATS.slice(0, -fifths).includes(letter)) return `${letter}b${name.slice(1)}`;
  return name;
}

/** One column of heads as score text: "Eb5", or a chord "<G3 Eb4>". */
export function columnText(names: string[], fifths = 0): string {
  const spelled = names.map((name) => inKey(name, fifths));
  return spelled.length > 1 ? `<${spelled.join(" ")}>` : spelled[0];
}

/** A staff left to right: columns of heads (lowest first) and barlines. */
export type StaffItem = { x: number; names: string[] } | { x: number; barline: true };

export function staffItems(staff: Staff, index: number, clef: string, heads: Head[], barlines: number[]): StaffItem[] {
  const items: StaffItem[] = barlines.map((x) => ({ x, barline: true }));
  let column: Head[] = [];
  const close = () => {
    if (!column.length) return;
    const names = column.sort((a, b) => a.position - b.position).map((head) => headName(clef, head.position) ?? "?");
    items.push({ x: column[0].x, names });
    column = [];
  };
  for (const head of heads.filter((h) => h.staff === index).sort((a, b) => a.x - b.x)) {
    if (column.length && head.x - column[column.length - 1].x > staff.space * COLUMN) close();
    column.push(head);
  }
  close();
  return items.sort((a, b) => a.x - b.x);
}

/**
 * A staff as one line of text: "G5 <A4 C5> | B4 …", a chord's heads in `<…>`, `|` at each barline,
 * with the key signature (`fifths`) applied.
 */
export function staffText(items: StaffItem[], fifths = 0): string {
  return items.map((item) => ("barline" in item ? "|" : columnText(item.names, fifths))).join(" ");
}

type Column = { x: number; names: string[] };

/**
 * The columns between barlines, in order: one list per bar of the staff. The stretch after a
 * system's last barline is dropped when it is empty; an empty stretch between barlines is a bar
 * of rests.
 */
function splitBars(items: StaffItem[]): Column[][] {
  const bars: Column[][] = [[]];
  for (const item of items) {
    if ("barline" in item) bars.push([]);
    else bars[bars.length - 1].push(item);
  }
  if (!bars[bars.length - 1].length) bars.pop();
  return bars;
}

/** The columns of each bar of a staff, in order, each column's head names lowest first. */
export function barColumns(items: StaffItem[]): string[][][] {
  return splitBars(items).map((columns) => columns.map((column) => column.names));
}

/**
 * The page bar by bar, as score text is written: each bar with the heads of every staff in its
 * system (`perSystem` staves, top to bottom), bars numbered on from one system to the next, with
 * the key signature (`fifths`) applied.
 */
export function barsText(items: StaffItem[][], clefs: string[], perSystem: number, fifths = 0): string {
  const lines: string[] = [];
  let bar = 0;
  for (let first = 0; first < items.length; first += perSystem) {
    const staves = items.slice(first, first + perSystem).map(splitBars);
    const count = Math.max(...staves.map((bars) => bars.length));
    for (let k = 0; k < count; k++) {
      lines.push(`page bar ${++bar}${k === 0 ? ` (system ${first / perSystem + 1})` : ""}`);
      staves.forEach((bars, s) => {
        const clef = clefs[first + s];
        const pitched = headName(clef, 0) !== null;
        const heads = pitched ? staffText(bars[k] ?? [], fifths) || "(no heads)" : "(read the drums from the picture)";
        lines.push(`  staff ${s + 1}, ${clef}: ${heads}`);
      });
    }
  }
  return lines.join("\n");
}
