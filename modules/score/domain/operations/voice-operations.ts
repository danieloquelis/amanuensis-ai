import { getMeasure, getStaff, resolveVoice } from "../queries";
import { putVoiceBar, removeVoiceBar, voiceBars, voiceInfo } from "../voice-access";
import { detachFrom, fullMeasureRest, type Draft, type OperationContext } from "./draft";
import type { OperationOf } from "./schema";

/**
 * Gives bars a further voice on a staff: declares it when the staff has none of that number yet
 * (only the next one: voice 3 needs voice 2), then a whole-bar rest in each listed bar without it.
 */
export function addVoiceBars(draft: Draft, op: OperationOf<"addVoiceBars">, { idPrefix }: OperationContext) {
  const staff = getStaff(draft, op.staffId);
  if (op.voice > staff.voices.length + 1) {
    throw new Error(`Add voice ${staff.voices.length + 1} first; this staff has ${staff.voices.length}.`);
  }
  if (op.voice === staff.voices.length + 1) staff.voices.push({ id: `${idPrefix}-voice` });
  const voiceId = staff.voices[op.voice - 1].id;
  op.measureIds.forEach((measureId, index) => {
    const measure = getMeasure(draft, measureId);
    if (voiceBars(measure).some((bar) => bar.voiceId === voiceId)) return;
    putVoiceBar(draft, measure, voiceId, fullMeasureRest(measure.meter, `${idPrefix}-${index}`));
  });
}

/** Takes a voice out of bars, or (with no bars named) out of every bar and off its staff. */
export function removeVoiceBars(draft: Draft, op: OperationOf<"removeVoiceBars">) {
  const voiceId = resolveVoice(draft, op.voiceId);
  const info = voiceInfo(draft, voiceId)!;
  if (info.voiceIndex === 0) throw new Error("The main line of a staff cannot be removed; clear its bars instead.");
  const measures = op.measureIds ? op.measureIds.map((id) => getMeasure(draft, id)) : draft.measures;
  for (const measure of measures) {
    const bar = voiceBars(measure).find((b) => b.voiceId === voiceId);
    if (!bar) continue;
    detachFrom(
      draft,
      bar.events.map((e) => e.id),
    );
    removeVoiceBar(measure, voiceId);
  }
  if (!op.measureIds) info.staff.voices = info.staff.voices.filter((voice) => voice.id !== voiceId);
}
