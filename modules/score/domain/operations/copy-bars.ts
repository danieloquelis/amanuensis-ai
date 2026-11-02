import { getMeasure } from "../queries";
import { renameTuplets } from "../tuplets";
import { createMeasure, measureEvents, replaceVoiceBars, voiceBars } from "../voice-access";
import { copyAnchored, type CopyMap } from "./copy-anchored";
import { AFTER_LAST_BAR } from "./copy-schemas";
import { copyStaffBars } from "./copy-staff-bars";
import { detachFrom, fullMeasureRest, type Draft, type OperationContext } from "./draft";
import type { OperationOf } from "./schema";

/**
 * Pastes whole bars: each copied bar (every voice, with its meter, chords, indications and the
 * slurs within the copy) replaces a bar from the target on, in order; bars are added past the
 * end. What the target bars held goes. Sections, navigation marks and repeats stay where they are:
 * they label places in the form. With `fromStaffId`, only one staff's music is copied (see copyStaffBars).
 */
export function copyBars(draft: Draft, op: OperationOf<"copyBars">, context: OperationContext) {
  if (op.fromStaffId) return copyStaffBars(draft, op, context);
  const { idPrefix } = context;
  // Read everything copied before writing, so overlapping ranges ("bars 1–2 onto bar 2") work.
  const sources = op.measureIds.map((id) => structuredClone(getMeasure(draft, id)));
  const before = { annotations: structuredClone(draft.annotations), slurs: structuredClone(draft.slurs) };
  const chords = structuredClone(draft.chords);
  const start =
    op.toMeasureId === AFTER_LAST_BAR
      ? draft.measures.length
      : draft.measures.indexOf(getMeasure(draft, op.toMeasureId));
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
    detachFrom(
      draft,
      measureEvents(target).map((e) => e.id),
    );
    const targetId = target.id;
    draft.annotations = draft.annotations.filter((a) => a.targetId !== targetId);
    draft.chords = draft.chords.filter((c) => c.measureId !== targetId);
    target.meter = { ...source.meter };
    const bars = voiceBars(source).map((bar, v) => ({
      ...bar,
      events: bar.events.map((event, n) => {
        const id = `${idPrefix}-${k}v${v}n${n}`;
        map.first.set(event.id, id);
        map.last.set(event.id, id);
        return { ...event, id };
      }),
    }));
    bars.forEach((bar, v) => renameTuplets(bar.events, `${idPrefix}-${k}v${v}`));
    replaceVoiceBars(target, bars);
    map.first.set(source.id, targetId);
    chords
      .filter((c) => c.measureId === source.id)
      .forEach((c, n) => draft.chords.push({ ...c, id: `${idPrefix}-${k}c${n}`, measureId: targetId }));
  });
  copyAnchored(draft, before, map, idPrefix);
}
