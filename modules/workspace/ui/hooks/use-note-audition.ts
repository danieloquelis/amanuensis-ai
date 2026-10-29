import { useCallback, useEffect, useRef } from "react";
import { pitchName, type Pitch, type ScoreEvent } from "@/modules/score";

const soundKey = (eventId: string, pitch: Pitch) => `${eventId}:${pitchName(pitch)}`;

/**
 * Lets the musician hear the note they are working on. The returned `audition` is for the sheet:
 * a pressed note always sounds, and a dragged one at each new pitch. Besides that, the selected
 * note sounds whenever it or its pitch changes (arrow keys, a typed letter, Add note), unless that
 * exact note and pitch was just heard, so a drag does not sound again when it is committed.
 */
export function useNoteAudition(selected: ScoreEvent | null, sound: (pitch: Pitch, eventId: string) => void) {
  const lastHeard = useRef<string | null>(null);

  const audition = useCallback(
    (eventId: string, pitch: Pitch) => {
      lastHeard.current = soundKey(eventId, pitch);
      sound(pitch, eventId);
    },
    [sound],
  );

  const pitch = selected?.pitch ?? null;
  const selectedId = selected?.id ?? null;
  const key = selectedId && pitch ? soundKey(selectedId, pitch) : null;
  useEffect(() => {
    if (!key || !pitch || !selectedId || key === lastHeard.current) return;
    lastHeard.current = key;
    sound(pitch, selectedId);
  }, [key, pitch, sound, selectedId]);

  return audition;
}
