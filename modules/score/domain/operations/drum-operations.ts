import { isDrumKit } from "../instruments";
import { DRUM_PIECES, MAX_DRUM_HITS, sortDrums } from "../drums";
import { grooveBar, type DrumValue, type GrooveName } from "../grooves";
import { getMeasure, getPart, locateEvent } from "../queries";
import { durationFromBeats } from "../rhythm";
import type { Part, ScoreEvent } from "../schema";
import { barEvents, putVoiceBar, setBarStyle } from "../voice-access";
import { detachFrom, type Draft, type OperationContext } from "./draft";
import type { OperationOf } from "./schema";

/** What a drum event strikes (its length stays); `null` makes it a rest. */
export function setDrums(draft: Draft, op: OperationOf<"setDrums">) {
  const { measure, event, voiceId } = locateEvent(draft, op.eventId);
  if (!op.drums) {
    delete event.drums;
    delete event.articulation;
    return;
  }
  event.pitch = null;
  delete event.stack;
  delete event.tie;
  delete event.measureRest;
  event.drums = sortDrums(op.drums);
  setBarStyle(measure, undefined, voiceId);
}

/** The drum part named, or the first one; a score without drums is told how to add them. */
function drumPart(draft: Draft, partId: string | undefined): Part {
  const part = partId ? getPart(draft, partId) : draft.parts.find((p) => isDrumKit(p.instrument));
  if (!part || !isDrumKit(part.instrument)) {
    throw new Error("Grooves are for a drum part: add one first (addPart with instrument drums).");
  }
  return part;
}

const toEvents = (values: DrumValue[], prefix: string): ScoreEvent[] =>
  values.map(({ drums, beats }, n) => ({
    id: `${prefix}${n}`,
    pitch: null,
    duration: durationFromBeats(beats),
    ...(drums ? { drums } : {}),
  }));

/**
 * A groove in each listed bar, hands and feet, replacing what the drum part played there. With
 * `fill`, the last bar ends in a fill and the next bar (if there is one) starts with a crash.
 */
export function putGroove(draft: Draft, op: OperationOf<"putGroove">, { idPrefix }: OperationContext) {
  const [hands, feet] = drumPart(draft, op.partId).staves[0].voices;
  op.measureIds.forEach((measureId, k) => {
    const measure = getMeasure(draft, measureId);
    const bar = grooveBar(op.groove as GrooveName, measure.meter, op.fill && k === op.measureIds.length - 1);
    detachFrom(
      draft,
      [...barEvents(measure, hands.id), ...barEvents(measure, feet.id)].map((e) => e.id),
    );
    putVoiceBar(draft, measure, hands.id, toEvents(bar.hands, `${idPrefix}-${k}h`));
    putVoiceBar(draft, measure, feet.id, toEvents(bar.feet, `${idPrefix}-${k}f`));
    setBarStyle(measure, undefined, hands.id);
  });
  const last = draft.measures.indexOf(getMeasure(draft, op.measureIds.at(-1)!));
  const next = draft.measures[last + 1];
  if (op.fill && next) crashOnDownbeat(barEvents(next, hands.id)[0]);
}

/** The crash that lands a fill: added to the downbeat's hit, or striking alone where it was silent. */
function crashOnDownbeat(event: ScoreEvent | undefined) {
  if (!event) return;
  const pieces = event.drums ?? [];
  if (pieces.includes("crash") || pieces.length >= MAX_DRUM_HITS) return;
  // A crash replaces the hi-hat or ride that would sound with it.
  const kept = pieces.filter((piece) => DRUM_PIECES[piece].head !== "x");
  event.drums = sortDrums([...kept, "crash"]);
  delete event.measureRest;
}
