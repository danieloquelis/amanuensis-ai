import { isDrumKit } from "./instruments";
import { SCORE_LIMITS, type Measure, type Score } from "./schema";
import type { IdRegistry } from "./validation";
import { allStaves, barEvents, everyEvent, voiceBars, voiceIds, voiceInfo } from "./voice-access";

/**
 * Checks that parts, staves, voices and bars fit together:
 * - part, staff and voice IDs are unique among all score IDs;
 * - each bar lists voice bars in declared order, at most one per voice, only for declared voices;
 * - every staff's first voice has a bar in every measure;
 * - a slash or repeat style sits only on a staff's first voice, when that staff has no other
 *   voice there (the whole-bar rest under it is checked with the bar marks);
 * - a drum part is on a percussion staff, and only a drum part is (see also `validateDrumHits`);
 * - the score holds at most `SCORE_LIMITS.events` events in all.
 */
export function validateStructure(score: Score, ids: IdRegistry) {
  for (const part of score.parts) {
    ids.add(part.id);
    for (const staff of part.staves) {
      ids.add(staff.id);
      for (const voice of staff.voices) ids.add(voice.id);
      if (staff.clef === "percussion" && !isDrumKit(part.instrument)) {
        throw new Error("A percussion staff is only for drums.");
      }
      if (staff.clef !== "percussion" && isDrumKit(part.instrument)) {
        throw new Error("Drums are written on a percussion staff.");
      }
    }
  }
  const order = voiceIds(score);
  const firstVoices = allStaves(score).map((staff) => staff.voices[0].id);
  score.measures.forEach((measure, index) => {
    const positions = voiceBars(measure).map((bar) => order.indexOf(bar.voiceId));
    if (positions.some((position) => position === -1)) {
      throw new Error(`Bar ${index + 1} has notes for a voice the score does not declare.`);
    }
    if (positions.some((position, i) => i > 0 && position <= positions[i - 1])) {
      throw new Error(`Bar ${index + 1} lists its voices out of order or twice.`);
    }
    for (const voiceId of firstVoices) {
      if (!voiceBars(measure).some((bar) => bar.voiceId === voiceId)) {
        throw new Error(`Bar ${index + 1} is missing the main line of a staff.`);
      }
    }
    validateDrumHits(score, measure, index + 1);
    for (const bar of voiceBars(measure)) {
      if (!bar.style) continue;
      const staff = voiceInfo(score, bar.voiceId)!.staff;
      if (staff.voices[0].id !== bar.voiceId) throw new Error("Only a staff's main line can show slashes or a repeat.");
      const others = staff.voices.slice(1).some((voice) => barEvents(measure, voice.id).length);
      if (others) throw new Error("A slash or repeat bar cannot also hold a second voice.");
    }
  });
  if (everyEvent(score).length > SCORE_LIMITS.events) {
    throw new Error(`A score holds at most ${SCORE_LIMITS.events} notes and rests in all.`);
  }
}

/** Drum hits only on a drum part, which holds no pitches; a hit sounds once, so it is never tied or slurred. */
function validateDrumHits(score: Score, measure: Measure, bar: number) {
  const slurred = new Set(score.slurs.flatMap((slur) => [slur.startEventId, slur.endEventId]));
  for (const voiceBar of voiceBars(measure)) {
    const kit = isDrumKit(voiceInfo(score, voiceBar.voiceId)!.part.instrument);
    for (const event of voiceBar.events) {
      if (event.drums && !kit) throw new Error(`Bar ${bar}: drum hits go on a drum part.`);
      if (kit && event.pitch) throw new Error(`Bar ${bar}: a drum part holds hits, not pitches (e.g. <snare>q).`);
      if (event.drums && event.tie) throw new Error(`Bar ${bar}: a drum hit sounds once; it cannot be tied.`);
      if (event.drums && slurred.has(event.id)) throw new Error(`Bar ${bar}: slurs join notes, not drum hits.`);
    }
  }
}

/** An indication on a bar names a declared staff; a dynamic on a bar must name one. */
export function validateAnnotationStaff(score: Score) {
  const staffIds = new Set(allStaves(score).map((staff) => staff.id));
  const measureIds = new Set(score.measures.map((measure) => measure.id));
  for (const annotation of score.annotations) {
    if (annotation.staffId !== undefined && !staffIds.has(annotation.staffId)) {
      throw new Error("An indication names a staff that is not in the score.");
    }
    if (annotation.kind === "dynamic" && measureIds.has(annotation.targetId) && !annotation.staffId) {
      throw new Error("A dynamic on a bar must say which staff it belongs to.");
    }
  }
}
