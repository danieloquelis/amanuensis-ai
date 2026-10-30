import { createPart, INSTRUMENTS } from "../instruments";
import { getPart } from "../queries";
import {
  barEvents,
  measureEvents,
  putVoiceBar,
  removeVoiceBar,
  replaceVoiceBars,
  voiceBars,
  voiceIds,
} from "../voice-access";
import { detachFrom, fullMeasureRest, type Draft, type OperationContext } from "./draft";
import type { OperationOf } from "./schema";

/** A part's own staves' voices. */
const partVoices = (draft: Draft, partId: string) =>
  getPart(draft, partId).staves.flatMap((staff) => staff.voices.map((voice) => voice.id));

/** Puts every bar's voice bars back in declared order after the parts changed order. */
function sortVoiceBars(draft: Draft) {
  const order = voiceIds(draft);
  for (const measure of draft.measures)
    replaceVoiceBars(
      measure,
      [...voiceBars(measure)].sort((a, b) => order.indexOf(a.voiceId) - order.indexOf(b.voiceId)),
    );
}

/** A new instrument below the others (or after a given part), with a whole-bar rest in every bar. */
export function addPart(draft: Draft, op: OperationOf<"addPart">, { idPrefix }: OperationContext) {
  const part = createPart(op.instrument, {
    part: `${idPrefix}-part`,
    staff: `${idPrefix}-staff`,
    voice: `${idPrefix}-voice`,
  });
  if (op.name) part.name = op.name;
  const index = op.afterPartId ? draft.parts.indexOf(getPart(draft, op.afterPartId)) + 1 : draft.parts.length;
  draft.parts.splice(index, 0, part);
  draft.measures.forEach((measure, i) =>
    putVoiceBar(draft, measure, part.staves[0].voices[0].id, fullMeasureRest(measure.meter, `${idPrefix}-${i}`)),
  );
}

/** Takes an instrument out with its notes and the indications on them; one part always stays. */
export function removePart(draft: Draft, op: OperationOf<"removePart">) {
  if (draft.parts.length === 1) throw new Error("The score needs at least one instrument.");
  const part = getPart(draft, op.partId);
  const voices = new Set(partVoices(draft, part.id));
  const staves = new Set(part.staves.map((staff) => staff.id));
  for (const measure of draft.measures) {
    for (const bar of voiceBars(measure).filter((b) => voices.has(b.voiceId))) {
      detachFrom(
        draft,
        bar.events.map((e) => e.id),
      );
    }
    replaceVoiceBars(
      measure,
      voiceBars(measure).filter((b) => !voices.has(b.voiceId)),
    );
  }
  draft.annotations = draft.annotations.filter((a) => !a.staffId || !staves.has(a.staffId));
  draft.parts = draft.parts.filter((p) => p.id !== part.id);
}

export function movePart(draft: Draft, op: OperationOf<"movePart">) {
  const part = getPart(draft, op.partId);
  const rest = draft.parts.filter((p) => p.id !== part.id);
  const before = op.beforePartId === null ? rest.length : rest.indexOf(getPart(draft, op.beforePartId));
  rest.splice(before, 0, part);
  draft.parts = rest;
  sortVoiceBars(draft);
}

export function renamePart(draft: Draft, op: OperationOf<"renamePart">) {
  const part = getPart(draft, op.partId);
  part.name = op.name;
  if (op.abbreviation) part.abbreviation = op.abbreviation;
  else delete part.abbreviation;
}

/** A piano's grand staff: a bass staff for the left hand, or back to one when it holds no notes. */
export function setStaffCount(draft: Draft, op: OperationOf<"setStaffCount">, { idPrefix }: OperationContext) {
  const part = getPart(draft, op.partId);
  if (op.staves === part.staves.length) return;
  if (op.staves === 2) {
    if (part.instrument !== "piano") throw new Error(`${INSTRUMENTS[part.instrument].name} plays from one staff.`);
    const voice = `${idPrefix}-voice`;
    part.staves.push({ id: `${idPrefix}-staff`, clef: "bass", voices: [{ id: voice }] });
    draft.measures.forEach((m, i) => putVoiceBar(draft, m, voice, fullMeasureRest(m.meter, `${idPrefix}-${i}`)));
    return;
  }
  const lower = part.staves[1];
  const ids = lower.voices.map((v) => v.id);
  if (draft.measures.some((m) => ids.some((id) => barEvents(m, id).some((e) => e.pitch)))) {
    throw new Error("The lower staff still has notes; clear them first.");
  }
  for (const measure of draft.measures) {
    detachFrom(
      draft,
      measureEvents(measure)
        .filter((e) => ids.some((id) => barEvents(measure, id).includes(e)))
        .map((e) => e.id),
    );
    ids.forEach((id) => voiceBars(measure).some((b) => b.voiceId === id) && removeVoiceBar(measure, id));
  }
  draft.annotations = draft.annotations.filter((a) => a.staffId !== lower.id);
  part.staves = [part.staves[0]];
}

export function setPartMix(draft: Draft, op: OperationOf<"setPartMix">) {
  const part = getPart(draft, op.partId);
  if (op.volume !== undefined) part.volume = op.volume;
  if (op.muted === true) part.muted = true;
  if (op.muted === false) delete part.muted;
}
