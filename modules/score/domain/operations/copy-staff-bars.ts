import { getMeasure, getStaff } from "../queries";
import { measureCapacity } from "../rhythm";
import { barEvents, createMeasure, putVoiceBar, removeVoiceBar, voiceBars } from "../voice-access";
import { copyAnchored, type CopyMap } from "./copy-anchored";
import { detachFrom, fullMeasureRest, type Draft, type OperationContext } from "./draft";
import type { OperationOf } from "./schema";

/**
 * Pastes one staff's music from whole bars onto a staff (the same or another instrument's): each
 * voice of the copied staff replaces the same voice of the target staff, bar by bar, with the
 * indications on its notes, its bar dynamics and the slurs within the copy. Other staves, chords
 * and meters stay. Notes are stored as they sound, so a trumpet line pasted on the piano sounds the same.
 */
export function copyStaffBars(draft: Draft, op: OperationOf<"copyBars">, { idPrefix }: OperationContext) {
  const from = getStaff(draft, op.fromStaffId);
  const to = getStaff(draft, op.toStaffId ?? op.fromStaffId);
  const sources = op.measureIds.map((id) => structuredClone(getMeasure(draft, id)));
  const before = { annotations: structuredClone(draft.annotations), slurs: structuredClone(draft.slurs) };
  const start = draft.measures.indexOf(getMeasure(draft, op.toMeasureId));
  const map: CopyMap = { first: new Map(), last: new Map() };
  sources.forEach((source, k) => {
    let target = draft.measures[start + k];
    if (!target) {
      const id = `${idPrefix}-bar${k}`;
      target = createMeasure(draft, { id, meter: { ...source.meter } }, (staff) =>
        fullMeasureRest(source.meter, `${id}-s${staff}`),
      );
      draft.measures.push(target);
    }
    if (measureCapacity(target.meter) !== measureCapacity(source.meter)) {
      const bar = draft.measures.indexOf(target) + 1;
      throw new Error(`Bar ${bar} has a different time signature; copy the whole bars to bring theirs.`);
    }
    const measure = target;
    to.voices.forEach((voice, v) => {
      const fromVoice = from.voices[v];
      const copied = fromVoice ? barEvents(source, fromVoice.id) : [];
      const present = voiceBars(measure).some((bar) => bar.voiceId === voice.id);
      if (present)
        detachFrom(
          draft,
          barEvents(measure, voice.id).map((e) => e.id),
        );
      if (!copied.length) {
        if (v > 0 && present) removeVoiceBar(measure, voice.id);
        else if (v === 0) putVoiceBar(draft, measure, voice.id, fullMeasureRest(measure.meter, `${idPrefix}-${k}r`));
        return;
      }
      const events = copied.map((event, n) => {
        const id = `${idPrefix}-${k}v${v}n${n}`;
        map.first.set(event.id, id);
        map.last.set(event.id, id);
        return { ...event, id };
      });
      putVoiceBar(draft, measure, voice.id, events);
    });
    // The target staff's bar dynamics give way to the copied staff's.
    draft.annotations = draft.annotations.filter((a) => !(a.targetId === measure.id && a.staffId === to.id));
    before.annotations
      .filter((a) => a.targetId === source.id && a.staffId === from.id)
      .forEach((a, n) =>
        draft.annotations.push({ ...a, id: `${idPrefix}-${k}b${n}`, targetId: measure.id, staffId: to.id }),
      );
  });
  copyAnchored(draft, before, map, idPrefix);
}
