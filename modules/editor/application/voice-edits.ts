import { barEvents, numberedVoice, type Score } from "@/modules/score";
import type { Edit } from "./note-edits";

/** The voice the editor offers beside the main line: the second, stems down. */
const SECOND_VOICE = 2;

/** Whether a bar has a second voice. */
export function hasSecondVoice(score: Score, measureId: string): boolean {
  const voiceId = numberedVoice(score, SECOND_VOICE);
  const measure = score.measures.find((m) => m.id === measureId);
  return !!voiceId && !!measure && barEvents(measure, voiceId).length > 0;
}

/**
 * Adds a second, independent line to a bar (a whole-bar rest, ready for notes), or removes the
 * one it has with its notes.
 */
export function secondVoiceEdit(score: Score, measureId: string): Edit {
  if (hasSecondVoice(score, measureId)) {
    const voiceId = numberedVoice(score, SECOND_VOICE)!;
    return {
      operation: { type: "removeVoiceBars", voiceId, measureIds: [measureId] },
      receipt: "Removed second voice",
    };
  }
  return {
    operation: { type: "addVoiceBars", voice: SECOND_VOICE, measureIds: [measureId] },
    receipt: "Added second voice",
  };
}
