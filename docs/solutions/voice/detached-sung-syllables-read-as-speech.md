# Detached sung syllables were read as speech

**Symptom.** A take like "so if you're gonna add da da da da da" came back with no sung span, and the agent asked the musician to sing again. The recognizer had written the syllables down as words.

**Root cause.** Two things compounded:

1. Sung spans are found acoustically, outside speech turns, with thresholds measured on legato singing (≥ 50–60 % voiced, ≥ 50 % of the time in notes held ≥ 0.15 s). Detached syllables are voiced in short bursts with gaps, exactly like talk (the tests' synthetic `talking` voice is built the same way), so they measure 36–38 % voiced and 14–21 % held.
2. The recognizer put the syllables inside a speech turn, or in a turn of their own. Turns are excluded from the search, and the only way back (`endTurnsBeforeSinging`) cuts a turn at a pause after some words — none when the syllables follow the words directly, or when the turn is nothing but syllables.

The adapter assumed "singing yields no words"; for short syllables it does.

**Fix.** `modules/voice/domain/syllable-spans.ts`: a turn whose text ends in a run of sung syllables (`closingSyllables` in `sung-syllables.ts`) is sung from where the run starts, located by sharing the turn's voiced time between words and syllables by letters and snapping to the nearest voiced onset. Two guards keep talk from being taken for singing: singing the voicing found soon after the turn, with nothing said between, is what the syllables stand for; and a run faster than 8 syllables a second cannot have been sung where it was placed.

**How it was found.** Archived takes in `.takes/` hold the audio and the recognizer's turns, so `createTake` can be replayed offline in seconds with no API calls. Replaying every take before and after a change shows exactly which ones it affects.

**Tests.** `tests/unit/voice-take.test.ts`: syllables as their own turn; syllables at the end of a turn with no pause; syllables written into the turn before the singing they stand for.
