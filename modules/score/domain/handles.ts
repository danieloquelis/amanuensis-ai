import { INSTRUMENTS } from "./instruments";
import type { Part, Score, Staff } from "./schema";

/**
 * Names for parts, staves and voices that score text and agents use instead of IDs. A part is
 * named from its name ("Trumpet in B♭" → "trumpet"), made unique by order ("trumpet-2"); its
 * second staff is "piano.2"; a voice is "piano.2/v2" (or "v2" on the first staff). They are
 * derived, never stored, so renaming a part renames its handle.
 */

/** The first word of a part's name in lowercase letters. */
const firstWord = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")[0] || "part";

/**
 * A part's handle, made unique by order: the instrument's ID while the part has its instrument's
 * own name ("Double Bass" → "doublebass", "Violoncello" → "cello"), otherwise the first word of
 * its name ("Lead trumpet" → "lead").
 */
export function partHandles(score: Pick<Score, "parts">): Map<string, string> {
  const handles = new Map<string, string>();
  const used = new Map<string, number>();
  for (const part of score.parts) {
    const base = part.name === INSTRUMENTS[part.instrument].name ? part.instrument : firstWord(part.name);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    handles.set(part.id, count === 1 ? base : `${base}-${count}`);
  }
  return handles;
}

/** "piano" for a part's first staff, "piano.2" for its second. */
export function staffHandle(score: Pick<Score, "parts">, staffId: string): string | null {
  const handles = partHandles(score);
  for (const part of score.parts) {
    const index = part.staves.findIndex((staff) => staff.id === staffId);
    if (index !== -1) return index === 0 ? handles.get(part.id)! : `${handles.get(part.id)}.${index + 1}`;
  }
  return null;
}

/** A part by ID or handle ("trumpet"); null when there is none. */
export function findPart(score: Pick<Score, "parts">, ref: string): Part | null {
  const handles = partHandles(score);
  return score.parts.find((part) => part.id === ref || handles.get(part.id) === ref) ?? null;
}

/** A staff by ID or handle ("piano" is its first staff, "piano.2" its second); null when there is none. */
export function findStaff(score: Pick<Score, "parts">, ref: string): Staff | null {
  for (const part of score.parts) {
    const byId = part.staves.find((staff) => staff.id === ref);
    if (byId) return byId;
  }
  const [name, number] = ref.split(".");
  const part = findPart(score, name);
  return part?.staves[(number ? Number(number) : 1) - 1] ?? null;
}

/**
 * A voice by ID or handle: "v2" (voice 2 of the first staff), "piano.2/v2", or a part or staff
 * handle alone ("trumpet": its first staff's main line). Null when there is none.
 */
export function findVoiceId(score: Pick<Score, "parts">, ref: string): string | null {
  for (const part of score.parts)
    for (const staff of part.staves) if (staff.voices.some((voice) => voice.id === ref)) return ref;
  const match = /^(?:([a-z][\w-]*(?:\.\d)?)\/)?v(\d)$/.exec(ref);
  const staff = match ? (match[1] ? findStaff(score, match[1]) : score.parts[0].staves[0]) : findStaff(score, ref);
  const number = match ? Number(match[2]) : 1;
  return staff?.voices[number - 1]?.id ?? null;
}
