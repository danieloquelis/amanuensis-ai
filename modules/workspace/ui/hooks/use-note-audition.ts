import { useCallback, useEffect, useRef } from "react";
import { pitchName, type Pitch, type ScoreEvent } from "@/modules/score";

const soundKey = (eventId: string, pitch: Pitch) => `${eventId}:${pitchName(pitch)}`;

/**
 * Lets the musician hear the note they are working on. The returned `audition` is for the sheet:
 * a pressed note always sounds, and a dragged one at each new pitch. Besides that, the selected
 * note sounds whenever it or its pitch changes (arrow keys, a typed letter, Add note), unless that
 * exact note and pitch was just heard, so a drag does not sound again when it is committed.
 */
export function useNoteAudition(selected: ScoreEvent | null, sound: (pitch: Pitch) => void) {
  const lastHeard = useRef<string | null>(null);

  const audition = useCallback(
    (eventId: string, pitch: Pitch) => {
      lastHeard.current = soundKey(eventId, pitch);
      sound(pitch);
    },
    [sound],
  );

  const pitch = selected?.pitch ?? null;
  const key = selected && pitch ? soundKey(selected.id, pitch) : null;
  useEffect(() => {
    if (!key || !pitch || key === lastHeard.current) return;
    lastHeard.current = key;
    sound(pitch);
  }, [key, pitch, sound]);

  return audition;
}
