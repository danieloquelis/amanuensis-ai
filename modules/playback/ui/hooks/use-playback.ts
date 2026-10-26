import { useCallback, useEffect, useRef, useState } from "react";
import type { Score } from "@/modules/score";
import { AudioPlayer } from "../../infrastructure/audio-player";

/**
 * Transport state for the reference player. Playback stops when the tab is hidden; `stop` is
 * stable so callers can stop playback before any score edit.
 */
export function usePlayback() {
  const player = useRef<AudioPlayer | null>(null);
  const [playBeat, setPlayBeat] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    player.current?.stop();
    setPlayBeat(null);
    setPlaying(false);
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

  /** Starts playback, or stops it if already playing. */
  const toggle = async (score: Score, onError: (message: string) => void) => {
    if (playing) {
      stop();
      return;
    }
    try {
      setPlaying(true);
      await player.current?.play(score, (beat) => {
        setPlayBeat(beat);
        if (beat === null) setPlaying(false);
      });
    } catch {
      stop();
      onError("Playback could not start. Check this browser's audio permissions and try again.");
    }
  };

  return { playing, playBeat, toggle, stop };
}
