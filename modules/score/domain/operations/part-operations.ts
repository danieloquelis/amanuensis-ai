import { INSTRUMENTS, isDrumKit } from "../instruments";
import { getPart, getStaff } from "../queries";
import type { Part } from "../schema";
import { barEvents, isNote, removeVoiceBar, voiceBars } from "../voice-access";
import type { Draft } from "./draft";
import type { OperationOf } from "./schema";

/**
 * Plays a part on another instrument. Pitches are stored as they sound, so the music sounds the
 * same; each staff takes the instrument's clef (a piano's second staff the bass clef). Drums play
 * hits rather than pitches, so a part turns into drums (or back) only while it is empty; drums get
 * their feet voice, and a pitched part keeps no empty feet bars.
 */
export function setInstrument(draft: Draft, op: OperationOf<"setInstrument">) {
  const part = getPart(draft, op.partId);
  const instrument = INSTRUMENTS[op.instrument];
  const crossing = isDrumKit(op.instrument) !== isDrumKit(part.instrument);
  if (crossing && partHasMusic(draft, part)) {
    throw new Error(
      isDrumKit(op.instrument)
        ? "Drums play hits, not pitches: clear these bars first, or add drums as their own part (addPart with instrument drums)."
        : "A drum part holds hits, not pitches: clear its bars first, or add the instrument as a new part.",
    );
  }
  if (part.staves.length > 1 && op.instrument !== "piano") {
    throw new Error(`${instrument.name} plays from one staff; this part has two. Only piano uses two staves.`);
  }
  part.instrument = op.instrument;
  part.name = op.name ?? instrument.name;
  delete part.abbreviation;
  part.staves.forEach((staff, index) => (staff.clef = index === 0 ? instrument.clef : "bass"));
  const [staff] = part.staves;
  if (crossing && isDrumKit(op.instrument) && staff.voices.length === 1) {
    staff.voices.push({ id: freeId(draft, `${staff.voices[0].id}-feet`) });
  }
  if (crossing && !isDrumKit(op.instrument)) {
    // The feet's bars were rests only: a pitched part does not show them as a second voice.
    const later = new Set(staff.voices.slice(1).map((voice) => voice.id));
    for (const measure of draft.measures) {
      for (const bar of voiceBars(measure)) if (later.has(bar.voiceId)) removeVoiceBar(measure, bar.voiceId);
    }
  }
}

const partHasMusic = (draft: Draft, part: Part) =>
  part.staves.some((staff) =>
    staff.voices.some((voice) => draft.measures.some((m) => barEvents(m, voice.id).some(isNote))),
  );

/** `base`, or `base-2`, `base-3`… when the score already uses it. */
function freeId(draft: Draft, base: string): string {
  const used = new Set(
    draft.parts.flatMap((p) => [p.id, ...p.staves.flatMap((s) => [s.id, ...s.voices.map((v) => v.id)])]),
  );
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Changes a staff's clef; the notes keep their sound and are drawn on other lines. */
export function setClef(draft: Draft, op: OperationOf<"setClef">) {
  getStaff(draft, op.staffId).clef = op.clef;
}
