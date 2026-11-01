import { durationFromBeats, soundingBeats } from "./rhythm";
import { spellRhythm } from "./rhythm-spelling";
import type { Score, ScoreEvent } from "./schema";
import { sameNotes } from "./stacks";
import { everyEvent, isRest, setBarEvents, voiceBars } from "./voice-access";

const EPSILON = 1e-9;

/**
 * Runs of events that sound as one: a note and the notes it is tied to within the bar, or rests
 * in a row. A triplet is one run of its own, never joined with what is around it.
 */
function soundingGroups(events: ScoreEvent[]): ScoreEvent[][] {
  const groups: ScoreEvent[][] = [];
  events.forEach((event, i) => {
    const before = events[i - 1];
    const sameTriplet = before?.tuplet !== undefined && before.tuplet.id === event.tuplet?.id;
    const plain = before && !before.tuplet && !event.tuplet;
    const joins =
      sameTriplet || (plain && ((isRest(before) && isRest(event)) || (before.tie && sameNotes(before, event))));
    if (joins) groups.at(-1)!.push(event);
    else groups.push([event]);
  });
  return groups;
}

/**
 * Every bar written as a musician would read it (see `spellRhythm`), after each command: notes
 * tied within a bar and rests in a row are joined into what they sound like and spelled again,
 * so `q~q` on beats 1–2 reads as `h` and a half note from the off-beat as `q.~e`. A bar already
 * spelled so is left as it is, and so is every triplet. A respelled note keeps its IDs from the first part on (its
 * articulation and markings stay with it); new parts take `idPrefix` IDs; a slur that ended on
 * one of its parts ends on its last.
 */
export function respellScore(draft: Score, idPrefix: string): void {
  let created = 0;
  const lastPart = new Map<string, string>();
  const firstPart = new Map<string, string>();
  for (const measure of draft.measures)
    for (const voiceBar of voiceBars(measure)) {
      if (voiceBar.events.some((event) => event.measureRest)) continue;
      const events: ScoreEvent[] = [];
      let at = 0;
      for (const group of soundingGroups(voiceBar.events)) {
        const length = group.reduce((sum, event) => sum + soundingBeats(event), 0);
        const lead = group[0];
        if (lead.tuplet) {
          // A triplet is written as it is: never respelled.
          events.push(...group);
          at += length;
          continue;
        }
        const parts = spellRhythm(at, length, measure.meter, isRest(lead));
        at += length;
        const unchanged =
          parts.length === group.length && parts.every((part, k) => Math.abs(part - soundingBeats(group[k])) < EPSILON);
        if (unchanged) {
          events.push(...group);
          continue;
        }
        const written = parts.map((part, k): ScoreEvent => {
          const last = k === parts.length - 1;
          return {
            id: group[k]?.id ?? `${idPrefix}-s${created++}`,
            pitch: lead.pitch,
            ...(lead.stack ? { stack: lead.stack } : {}),
            duration: durationFromBeats(part),
            ...(k === 0 && lead.articulation ? { articulation: lead.articulation } : {}),
            ...((last ? group.at(-1)!.tie : !isRest(lead)) ? { tie: true as const } : {}),
          };
        });
        for (const event of group) {
          firstPart.set(event.id, written[0].id);
          lastPart.set(event.id, written.at(-1)!.id);
        }
        events.push(...written);
      }
      setBarEvents(measure, events, voiceBar.voiceId);
    }
  if (!lastPart.size) return;
  const kept = new Set(everyEvent(draft).map((e) => e.id));
  for (const slur of draft.slurs) {
    if (!kept.has(slur.startEventId)) slur.startEventId = firstPart.get(slur.startEventId) ?? slur.startEventId;
    slur.endEventId = lastPart.get(slur.endEventId) ?? slur.endEventId;
  }
  for (const annotation of draft.annotations) {
    if (!kept.has(annotation.targetId)) annotation.targetId = firstPart.get(annotation.targetId) ?? annotation.targetId;
  }
}
