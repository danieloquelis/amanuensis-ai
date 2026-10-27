# Sung melody → notation: research notes

Started 2026-10-27. Status: working local pipeline, measured on synthetic singing only. Real-voice evaluation is the next gate.

## What the models can and cannot do (measured)

One synthetic take (spoken instruction, sung melody, spoken instruction; 12.5 s):

| Model | Instruction vs singing | Transcript | Melody notes | Latency |
| --- | --- | --- | --- | --- |
| Muse Spark 1.2, audio input | Correct spans; timestamps off by 0.5–3 s between runs | Exact | Wrong (C D E G C for C E G E D F A), self-rated "low" | 7–11 s |
| Muse Spark 1.3, audio input | — reasoned through its 4,000-token budget, returned nothing | — | — | 22 s |
| Muse Voice Transcribe 1.0 | Speech turns with precise start/end ms; sung part produced no words | Exact | n/a | ~3 s |

Conclusion: transcribe words with **Muse Voice Transcribe**; derive **notes and rhythm locally**; use Spark for meaning (applying instructions to the transcribed melody), not for pitch. Spark 1.2 remains a candidate tie-breaker for sung lyrics that ASR would transcribe as speech.

## Local pipeline (`modules/voice/domain`, no model calls)

1. **Pitch** (`pitch-tracker.ts`): YIN on 20 ms windows every 10 ms, input peak-normalized. The chosen period is the earliest dip nearly as deep as the deepest one: voices often have a stronger 2nd harmonic than fundamental, which otherwise yields octave-up errors.
2. **Notes** (`notes.ts`):
   - a note changes only when the pitch steps away from the note's centre (its mean, attack excluded) and stays on one side for 60 ms; vibrato and scoops return sooner and never split a note;
   - a deep loudness dip on one pitch (< 25 % of the surrounding peak) is a re-sung note;
   - isolated octave-jump frames are folded back, and note leaps over an octave are folded (octave errors show up as exactly ±12);
   - a short slide straight into a note (a scoop) becomes that note's attack, so the onset is where the singer started moving, not where the pitch settled;
   - pitches stay as sung (fractional); tuning is handled in step 3.
3. **Musical priors** (`musical-priors.ts`): nobody sings in perfect pitch, so the written note is what a musician would hear, not the nearest semitone.
   - **Tuning follows the singer against a scale, not the semitone grid.** Measured against the grid, a singer drifting past 50 cents sharp suddenly reads as 50 flat and every note after that jumps a semitone. Measured against the diatonic scale (all 12), the true key fits with a steady tuning; the scale whose local tuning varies least wins, with a slight preference for less retuning. A given key restricts this to its scale.
   - **Key** (Krumhansl–Schmuckler, weighted by note length) unless given.
   - **Key reach**: a note sung between two pitches, where only one is in the key, is taken as the in-key one (within 0.7 semitones). Clearly sung chromatic notes stay chromatic.
   - **Chord reach**: when the chords are known, a note sung between two pitches takes the chord tone of the chord sounding at its written onset. Clear pitches are left alone, so passing notes and tensions survive.
   - Notes sung more than 0.3 semitones from the chosen pitch keep an `alternative`, so the assistant can weigh it against the user's words.
4. **Rhythm** (`rhythm.ts`):
   - tempo is spoken or estimated (the BPM under which onsets fit the grid best, with a mild preference near 96);
   - onsets snap beat-first, then eighth, then sixteenth;
   - gaps under an eighth are breaths (legato), longer gaps become rests;
   - a note before a rest is written to the next beat (quarter + rest, not eighth + dotted rest);
   - notes crossing a barline are split (no ties yet) with a warning.
5. **Spelling**: `spellMidi` in the score module uses the key's spelling, else sharps/flats by key.

## Evaluation (`yarn eval:voice`, free)

198 synthetic takes: 6 melodies (arpeggio, eighths, dotted, repeated notes, leaps, low voice) × 3 tempi (72/96/120) × 11 conditions. The synthetic singer has a full harmonic source, vowel formants, vibrato, glides, detuning, timing jitter and noise, and, for imperfect singers, random per-note pitch errors and tuning drift across the take (`tests/support/synthetic-voice.ts`).

The imperfect-singer conditions: "imperfect pitch" (each note up to ±35 cents off), "drifting" (tuning slides to −60 cents by the end), and "amateur" (±40 cents per note, drifting +50 cents, vibrato, glides, loose timing, a little noise). "amateur, chords known" is the same takes with the chord changes passed in.

| Version | Exact notation | Pitch | Tempo within 5 % |
| --- | --- | --- | --- |
| First working pipeline | 115/126 (91 %) | 99 % | 101/126 |
| + beat-first snapping, merge split pieces of one held pitch | **121/126 (96 %)** | **99 %** | 101/126 |
| Tried: move onsets back to where a glide starts | 104/126 (83 %), pitch 91 % | — | rejected: stole vibrato frames from held notes |
| Imperfect singers added (180 takes); key reach | 160/180 (89 %); amateur 4/18 | 97 % | 139/180 |
| + tuning followed against the scale; scoops become attacks | 168/180 (93 %); amateur 8/18 | 98 % | 140/180 |
| + chord reach (198 takes) | **182/198 (92 %)**; amateur 8/18 → **14/18 with chords known** | **98 %** | 154/198 |

Remaining misses: notes sung more than ~0.7 semitones off (no prior can tell what was meant), a whole note read an octave low, and one eighth swallowed by its neighbour at 120 BPM. These are where the assistant should use the `alternative` and the user's words, or ask.

**Real take** (the user singing the guitar intro of "El Muelle de San Blas", Maná; written in D major over Em | A | Dsus2 | G, each bar an eighth rest then E G E B~ E G E-style figures, 28 notes; the bass root on beat 1 was not sung):

- The singer was ~4.5 semitones below the written key, with drift up to ~1.5 semitones within a bar (bar 3), scooped attacks and sagging sustains. Normal for singing without a reference.
- Fixes this take motivated: transposing the take into the requested key (searched in tenths of a semitone, scored against the scale and chord tones); the bar position of the first note (from chords, or given); per-chord retuning plus snapping to chord tones for arpeggios (`snapToChordTones`, chosen by the agent from intent); slides between notes absorbed.
- Result with key, chords and start given: tempo 89 BPM (matches the take), rhythm right in most places, about 19 of 28 pitches right (bar 2 fully, bar 3 poorly). Remaining errors: an octave misread, the badly drifted bar, release blips read as sixteenths, two quiet notes missed.
- The bar position is a weak signal from notes alone (arpeggio neighbours are often shared chord tones); the tool reports `startBeatSure: false` and the agent should take it from the musician's words or ask.

## The agent's workflow for a voice take

The take is multimodal input; the agent reasons over it with tools, as a musician would.

1. **Hear**: Muse Voice Transcribe gives the spoken words with times (paid, cheap). Singing is found locally (`findSungSpans`): stretches voiced more than half the time, outside the speech turns. Speech never exceeded 44 % voiced on the real take; singing never dropped below 53 %. It works without speech turns too.
2. **Read**: the agent gets the take as a timeline (`describeTake`), e.g. `0.0–21.3 s said: "…Allegro, over Em A D G…"` / `22.2–32.5 s sang: sung-1 (10.3 s)`. Words are instructions; sung spans are music to write.
3. **Settle tempo**: a spoken number wins. A tempo word, the singing, or both go to `music_infer_tempo`. With both, the singing picks a tempo inside the word's range. Even quarters sung at 66 fit 66, 99 and 132 equally; "Allegro" settles it at 132.
4. **Settle key**: a named key, or the score's own. Otherwise named chords, the singing, or both go to `music_infer_key`. Chords decide: the key whose scale holds the most chords, then tonic, start/end on the tonic, V → I. Em A D G gives D major (all four chords are in D; A → D). Melody fit nudges the ranking. When the top two are close (and not just relative keys sharing a signature), the tool says `clear: false` and the agent asks.
5. **Transcribe**: `voice_transcribe_melody` with tempo, key, chords (by bar), and what kind of line it is: `snapToChordTones` for arpeggios and riffs, `startBeat` when the musician said where it starts. The take is transposed into the key. It returns bars ready for `replaceMeasure`, the transposition, whether the start was sure, and doubtful notes with their other reading.
6. **Write**: `score_edit` with one batch, so the whole take is one undo step. The agent names doubtful notes in its reply.

Every analysis tool is local and deterministic. The model spends tokens on reasoning, not on listening. `music_*` tools are offered on every turn ("what key is Em A D G?"); `voice_*` tools only when there is a take.

## Known limits and next steps

- **Real voices**: synthetic singing is easier (clean harmonics, steady vowels). Next gate: a small consented corpus of real takes; `yarn eval:voice --file take.m4a [--bpm 90]` analyses one locally.
- **Tempo estimation** is the weakest part (80 %). Spoken tempo or a count-in avoids it; a better estimator could weigh durations as well as onsets.
- Not handled yet: pickups (anacrusis), triplets, ties across barlines, swing, rubato, notes outside C3–C6.
- **Still to build**: the browser recorder (16 kHz mono WAV), a voice route that calls Muse Voice Transcribe and runs the agent with the take, and the Sing button. Analysis takes ≈0.01 s per second of audio in Node, so it can run on the server inside the request.
