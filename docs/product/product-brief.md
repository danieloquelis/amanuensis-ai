# Product brief

## Problem

A musician can hear a phrase, sing it, and describe how it should behave before they can efficiently enter it into notation software. Capturing that thought currently involves several different tasks: remembering the melody, finding pitches, interpreting timing, entering notation and correcting the result. A voice assistant that merely transcribes words does not preserve the music; a pitch tracker alone does not understand “repeat that phrase, but make the last note a dotted quarter.”

Amanuensis AI turns a person's vocal demonstration and musical instructions into an editable score. It must preserve the distinction between what the user performed, what they explicitly requested, and what the system inferred.

## Product promise

**Speak the musical idea. Sing the phrase. Shape the score.**

The product is a musical workspace with an assistant, rather than a general chat interface with sheet music attached. The score remains understandable and editable if the assistant is unavailable.

## Initial audience and job

Proposed primary audience: musicians and songwriters comfortable with basic notation and terms such as meter, key, interval and note duration. This is a focus hypothesis to validate, not an exclusion of beginners.

Primary job: “When I have a melodic idea, help me capture a readable, playable version without losing the idea while entering notes.”

Secondary job: “Let me correct and develop that phrase using either musical language or direct manipulation, without the assistant forgetting my edits.”

## First complete workflow

1. Start a score, optionally setting key, meter and tempo by voice or controls.
2. Record a short take: “In D minor, three-four, about eighty beats per minute,” followed by humming.
3. Show recognized instruction and candidate phrase separately. If timing is ambiguous, offer a musical choice or count-in recording.
4. Audition the candidate and apply it. An explicit, unambiguous edit to existing notes may apply directly with Undo.
5. Drag a note up, change its duration, and add a slur or dynamic.
6. Say “Repeat this bar, but end on the tonic.” Resolve “this” from the current selection and score revision.
7. Play, stop, save, reopen, and export a readable score.

## Voice-only boundary

Accept one human speaking, humming or singing into the microphone; text instructions remain supported. Start with takes up to 30 seconds. Do not expose a commercial-track or instrumental-audio upload workflow. Background instruments or multiple overlapping voices should produce a request to record the voice alone, not an attempted full arrangement.

This is an input policy and a probabilistic detection problem, not a claim that an audio classifier can prove a sound's origin. Keep an “uncertain” outcome. Do not reinterpret a sung lyric such as “delete everything” as an instruction without an explicit spoken command context.

## Proposed first-release scope

| Included | Deferred |
| --- | --- |
| One melodic part; treble or bass clef | Multiple simultaneous voices, choir, orchestral scores |
| Spoken musical instructions plus sung/hummed phrases | General audio transcription and instrumental input |
| Simple meters 2/4, 3/4, 4/4; explicit constant tempo | Complex meter changes, rubato transcription, swing inference |
| Whole through sixteenth notes/rests, dots, ties, basic beams | Nested tuplets, grace notes, complex contemporary notation |
| Keys, accidentals, slurs, basic dynamics and articulation | Automatic harmonization and accompaniment |
| Selection, pitch/duration edits, insert/delete, undo/redo | Multiplayer editing and full offline AI |
| Owned SVG engraving, playback, save/reopen, print/PDF | Pixel-perfect interoperability with every notation application |
| Anchored text annotations understood as annotations | Arbitrary executable/custom notation semantics |

Use a small set of properly engraved notation before expanding symbol coverage. A beautiful display with incorrect rhythm is a failed outcome.

## Success and evaluation

Targets below are proposed release gates; none have been measured. Use consented recordings and hold out speakers, devices and rooms from tuning data.

- At least 80% of pilot users capture, correct and audition a four-bar phrase within two minutes, without facilitator help.
- Median manual pitch/duration correction burden at most 20% of notes on the supported clean monophonic test set. Report noisy takes separately.
- No invalid committed measures, stale AI overwrites or lost acknowledged edits in the acceptance suite.
- Initial listening feedback under 100 ms on the agreed reference device; p95 phrase proposal within five seconds after a supported take ends, measured across the whole pipeline.
- Selection and drag feedback under 50 ms at p95 on a 32-bar reference score; score content remains usable with animations disabled.
- Track clarification rate, unsupported-input detection errors, completion rate and cost per accepted phrase. Do not optimize transcript word accuracy at the expense of musical correctness.

## Differentiation hypothesis

The opportunity is the combination of technical musical language, vocal evidence, an owned expressive score surface, and reliable shared state between human and agent. This is a product hypothesis, not a researched claim that no competitors provide these capabilities.
