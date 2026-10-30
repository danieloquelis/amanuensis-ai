import { useCallback, useEffect, useRef, useState } from "react";
import type { InstrumentId, Score } from "@/modules/score";
import { scoreSounds } from "../../application/score-sounds";
import { AudioPlayer } from "../../infrastructure/audio-player";

const FALLBACK_MESSAGE = "Instrument sounds could not load; playing reference tones.";

/**
 * Transport state for the player. Playback stops when the tab is hidden; `stop` is stable so
 * callers can stop playback before any score edit.
 */
export function usePlayback() {
  const player = useRef<AudioPlayer | null>(null);
  const [playBeat, setPlayBeat] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  const stop = useCallback(() => {
    player.current?.stop();
    setPlayBeat(null);
    setPlaying(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    const audio = new AudioPlayer();
    player.current = audio;
    const stopWhenHidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      audio.dispose();
    };
  }, [stop]);

  /**
   * Starts playback (from a bar, if given), or stops it if already playing. `onError` also hears
   * that the score is playing with reference tones because the instrument could not load.
   */
  const toggle = async (score: Score, onError: (message: string) => void, fromMeasureId?: string) => {
    if (playing) {
      stop();
      return;
    }
    try {
      setPlaying(true);
      await player.current?.play(
        score,
        {
          onBeat: (beat) => {
            setPlayBeat(beat);
            if (beat === null) setPlaying(false);
          },
          onLoading: setLoading,
          onFallback: () => onError(FALLBACK_MESSAGE),
        },
        fromMeasureId,
      );
    } catch {
      stop();
      onError("Playback could not start. Check this browser's audio permissions and try again.");
    }
  };

  /** Sounds a single MIDI note on an instrument (a drum piece on the kit), e.g. one just clicked; silent while the score is playing. */
  const audition = useCallback(
    (midi: number, instrument: InstrumentId = "piano") => {
      if (!playing) player.current?.audition(midi, instrument);
    },
    [playing],
  );

  /** Starts loading a score's instruments, so its notes sound right from the first click. */
  const prepare = useCallback((score: Score) => player.current?.prepare(scoreSounds(score)), []);

  return { playing, loading, playBeat, toggle, stop, audition, prepare };
}
