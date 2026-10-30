import { useCallback, useEffect, useRef } from "react";
import { DRUM_PIECES, midiPitch, type ScoreEvent } from "@/modules/score";

const soundKey = (eventId: string, midi: number) => `${eventId}:${midi}`;

/** What an event sounds when it is selected: its (lowest) note, or its first drum piece; null for a rest. */
const soundOf = (event: ScoreEvent | null) =>
  event?.drums ? DRUM_PIECES[event.drums[0]].midi : event?.pitch ? midiPitch(event.pitch) : null;

/**
 * Lets the musician hear the note they are working on. The returned `audition` is for the sheet:
 * a pressed note always sounds, and a dragged one at each new pitch (a drum hit at each new piece).
 * Besides that, the selected note sounds whenever it or its sound changes (arrow keys, a typed
 * letter, Add note), unless that exact sound was just heard, so a drag does not sound again when
 * it is committed. Sounds are MIDI notes: a pitch, or a drum piece's General MIDI note.
 */
export function useNoteAudition(selected: ScoreEvent | null, sound: (midi: number, eventId: string) => void) {
  const lastHeard = useRef<string | null>(null);

  const audition = useCallback(
    (eventId: string, midi: number) => {
      lastHeard.current = soundKey(eventId, midi);
      sound(midi, eventId);
    },
    [sound],
  );

  const midi = soundOf(selected);
  const selectedId = selected?.id ?? null;
  const key = selectedId && midi !== null ? soundKey(selectedId, midi) : null;
  useEffect(() => {
    if (!key || midi === null || !selectedId || key === lastHeard.current) return;
    lastHeard.current = key;
    sound(midi, selectedId);
  }, [key, midi, sound, selectedId]);

  return audition;
}
