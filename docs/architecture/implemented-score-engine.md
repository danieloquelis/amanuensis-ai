# Implemented musical engine

This describes current code, rather than the full product roadmap. The application remains local; a staff may hold two voices. All musical mutations go through the same validated command engine; the renderer and playback compiler derive their state from the resulting document.

## Document v3

Each measure carries an explicit meter. Returning to 4/4 after a 6/8 passage is represented in the data and drawn on the score. Time is stored as exact rational quarter-note beats; 6/8 holds three quarter-note beats, grouped in two dotted-quarter pulses. Global tempo and local tempo changes explicitly use quarter-note BPM, so switching meter does not silently reinterpret tempo.

Events have stable IDs, spelled pitches (or rests), exact durations and optional articulation. Shortening, deleting or padding leaves ordinary rests, grouped to the beat (`operations/rests.ts`). Drafts saved with the earlier `gap` (empty-space) marker open with those events as rests. Full-measure rests are explicit and adapt to local capacity. Indications anchor to event or measure IDs; dynamics are musical instructions, while free text is printed and exposed as contextual information without executing it. Repeat ranges use measure IDs and total passes. Overlapping/nested repeats and alternate endings are rejected.

A score declares its parts (an instrument, a name, one or two staves, an optional mixer level), each staff its clef and voices. A bar (`measure.voices`) holds one voice bar per voice that plays there, in declared order; every staff's first voice has a bar in every measure, and each voice bar fills the bar on its own. A bar's slash or repeat style sits on a staff's first voice bar. A dynamic on a bar names its staff (`annotation.staffId`). Today the editor creates one piano part with one treble staff and one voice; `structure-validation.ts` checks the declarations against the bars, and the total number of events is capped (`SCORE_LIMITS.events`).

**Instruments.** A part is played on piano (default), guitar, trumpet in B♭, flute or trombone (`score/domain/instruments.ts`: name, clef, transposition, comfortable range). Pitches are stored as they sound (concert pitch) and may lie anywhere from A0 to C8. `setInstrument` changes what plays a part without touching its notes and sets the clef (guitar: treble with an 8 below; trombone: bass); `setClef` overrides it; `newScore` takes an `instrument`. The sheet shows a transposing part as written (`transposition.ts`: B♭ trumpet a major 2nd up in its written key, respelled beyond six accidentals; guitar an octave up), as players read it; `layoutScore(score, { concertPitch: true })` draws the sound instead, for a later concert-pitch view. Notes outside the instrument's range are drawn in a warning colour, labelled "out of range", and listed in score text (`out of range for …`), never refused. Typed letters name the written note the sheet shows; letters and drags keep to the instrument's range.

**Voices.** A staff may hold a second, independent line (voice 2): `addVoiceBars` declares it and gives bars a whole-bar rest in it, `replaceMeasure` with `voiceId` ("v2" works) writes it, `clearMeasure` with `voiceId` rests one line, `removeVoiceBars` takes it out of bars or off the staff. Each voice fills its bars on its own. Score text shows it as `bar 2 v2: …` lines (written back the same way; `bar 2 v2: -` removes it), and its notes are addressed as `2v2#1` / `2v2:3`. The engraving spaces bars by onset columns shared by every voice; with two voices, voice 1 stems up and voice 2 down, their rests move apart, heads a second apart sit side by side, accidentals carry across voices to the barline, and ties, slurs and articulations go on each voice's stem side; a voice resting the whole bar beside another has its rest centred. Playback plays every voice from each bar's start, ties are joined per voice, and the playhead follows voice 1. The editor offers Add / Remove second voice on a bar and in the note menu; notes of voice 2 are labelled "voice 2". The transcriber writes a span into voice 2 when asked (`voice: "v2"`), in a low register, and what was just sung is protected per bar and voice.

Code reads and writes bars only through `score/domain/voice-access.ts` (`barEvents`, `putVoiceBar`, `voiceBars`, `barStyle`, `voiceLine`, …); ESLint enforces it. Ties join the next event of the same voice and never jump a bar where that voice is silent; slurs stay within one voice; respelling, meter fitting, duplication and validation run per voice bar. `clearMeasure` and `setMeasureStyle` take an optional `staffId`, `replaceMeasure` an optional `voiceId`.

Older files migrate step by step in `migrations.ts` (v1 → v2 → v3): a v2 score becomes one piano part (`part-1`, `staff-1`, `voice-1`, renamed if a file already uses those IDs), each bar's events its voice bar, a bar's style that voice bar's style, and a dynamic on a bar gets the staff. The browser re-saves a draft as v3 after the next edit. The engraving fixtures stay v2 on purpose, so every test run exercises the migration; `tests/fixtures/engraving-scenes/` holds their layout from before v3, which must stay identical. Version 1 native files migrate to v2 with the original IDs, title, revision, pitches and timing intact. Unsupported fields are rejected instead of discarded. The local storage key remains unchanged so previous drafts can be opened.

## Shared operations

- `setPitch`, `setDuration`, `removeEvent` (leaves a rest of equal length), `moveEvent` (within a bar).
- `appendMeasure`, `duplicateMeasure`, `clearMeasure`, `deleteMeasure`, `replaceMeasure`.
- `setMeter` on measure IDs with `policy` preserve/scale/auto and optional `extend` (to the next change); `setTempo` globally or at a bar; `removeTempo`; `setKey` (global key signature, display only).
- `setArticulation`, `putAnnotation`, `moveAnnotation`, `putRepeat`, `rename`.
- `putChord`, `setMeasureStyle` (notes/slashes/repeat), `setSection`, `putMark`.
- `removeNotation` removes any indication, chord, mark or repeat by ID.
- `batch` validates and commits a bounded ordered set of operations as one revision and undo step.

Commands are runtime-validated. An expected revision and unique request ID are required. Failure leaves the original score untouched. Retrying the same request does not duplicate notes; reusing an ID with different content fails. Deleted anchors remove dependent indications, chords and marks; duplication copies a bar's annotations and chords with fresh IDs (not its section or marks).

Meter changes have an explicit policy:

- **Preserve:** keep note durations; pad with rests or trim trailing rests. Reject a change that would cut a note.
- **Scale:** multiply note durations by the ratio of new to old bar capacity. Only supported written values are accepted; a change requiring tuplets fails with an explanation.

This is not automatic re-barring across measure boundaries. A future re-bar operation must model ties and preserve event provenance, not silently redistribute notes.

## Lead sheet and form

- **Chords** are score-level items anchored to a bar and a beat (`putChord` with text such as `F#m7b5` or `Bb7/D`; stored as root, quality and bass). A chord holds until the next chord in the written score and sounds softly under the melody.
- **Bar styles:** `setMeasureStyle` shows a bar as notes, rhythm slashes, or a measure-repeat sign (%). Slashes and % replace the bar's notes; a % bar plays its source bar again. Writing a note into such a bar turns it back into a normal bar.
- **Sections** (`setSection`) are boxed rehearsal labels at a bar start.
- **Marks** (`putMark`) are independent items: segno and coda at a bar start; Fine, To Coda, D.C., D.C. al Fine/Coda, D.S., D.S. al Fine/Coda at its end. A score may have any number of each, and a bar several.
- **Playback order:** repeats play their passes until the first D.C./D.S.; each jump mark is taken once (D.C. to the first bar, D.S. to the nearest segno before it); after an "al Coda" jump, To Coda goes to the next coda; after other jumps, Fine stops.
- **Indications** may carry a free `offset` (`moveAnnotation`).

## AI tool boundary

`@/modules/assistant` exports function definitions (`scoreTools`) and `createScoreToolGateway(getSession, setSession)`. The JSON Schemas, including the description of every operation and field, are generated from the same Zod schemas that validate the calls.

| Tool | Contract |
| --- | --- |
| `score_get_context` | The readable score (`describeScore`): bars numbered from 1 with notes (pitch and duration names), chords, marks, sections, repeats and indications, with IDs; the revision; the supported vocabulary; known limits. |
| `score_edit` | Apply an operation or batch directly as one undoable edit; returns the revision and one line per changed bar. |
| `score_preview` | Validate without changing anything; returns a revision-bound preview ID, the change summary and the proposed readable score. |
| `score_apply` | Apply a stored preview against its exact revision; duplicates are harmless. |
| `score_undo` | Undo the latest edit at the supplied revision. |

Stale revisions, unknown IDs and invalid notation are rejected without changes, with a message naming the problem. Indication text is user content, never a tool instruction. The gateway is in-process and single-writer: server authorization, durable idempotency and multi-writer undo are still required before remote agents write.

## Playback and engraving

The owned SVG engine (`modules/engraving/domain`) runs in stages: measure analysis (staff positions, key-aware accidentals, beam groups and stem directions, ink extents), spacing, line breaking, justification, beaming, then indication labels.

- **Spacing.** Each event has a spring that grows about 1.28× per doubling of duration, plus a minimum gap so accidentals, dots and flags never collide. At stretch `s` a gap is `max(spring × s, minimum)`.
- **Line breaking.** A small Knuth–Plass search chooses breaks that keep stretch even across lines (four short bars stay on one line; twelve become 4 + 4 + 4). Lines are justified exactly to the margin. A short final line stays ragged instead of being stretched more than 2×.
- **Width overrides.** `setMeasureWidth` sets a bar's engraved width. The rest of its line re-justifies, and a bar is never drawn narrower than its content needs.
- **Signatures.** The clef and key signature start every line; a time signature appears at the start and wherever the meter changes. The score ends with a final barline unless a repeat closes it.
- **Beams.** Beams follow the contour gently (half the interval, at most one staff space, slope ≤ 0.3) and are flat for concave groups. Stem direction follows the note farthest from the middle line. Stems keep at least 3.5 spaces and reach the middle line from ledger lines. Compound-meter beams follow dotted-quarter groups.
- **Indications.** Text wraps at word boundaries. Indication placement is still conservative (fixed rows); collision avoidance between labels and pagination remain later work.

Invariants (no ink overlap, contiguous justified bars, beam slope and stem length, key-aware accidentals, determinism) are unit-tested against `tests/fixtures/engraving/`. Screenshot baselines in `tests/e2e/engraving.spec.ts` catch visual regressions.

Playback first resolves written dynamics and tempo, then unfolds repeat ranges. The plan (`playback/domain/plan.ts`) speaks MIDI: each event carries `notes` (MIDI numbers; empty is silence) and a `velocity`. Dynamics map to velocity (`DYNAMIC_VELOCITY`, pp 33 to ff 112); an accent adds 16; staccato/tenuto and slurs affect note gating; fermatas extend the written duration by 1.5×. Chord symbols comp as soft piano voicings (velocity 30). Free text does not alter sound.

Sound goes through a port (`playback/application/sound-port.ts`). Each note plays on its part's instrument: the Splendid Grand Piano (public domain) for piano and chord symbols, FluidR3 GM sounds (one `-mp3.js` file per instrument) for guitar, trumpet, flute and trombone, all through smplr, from samples self-hosted under `public/sounds/v1/` (two velocity layers, one sample every minor third, Opus and AAC). The samples are not in git: the committed `manifest.json` lists each file's URL, size and sha256, and `yarn sounds:fetch` downloads and verifies them. It runs after `yarn install` (warning only when offline) and before `yarn build` (failing, so a deploy never lacks sound). `yarn sounds:fetch --update` rebuilds the manifest and `CREDITS.md` after the sample selection in `sound-sources.ts` changes. Samples load on the first Play or audition; the Play button reads "Loading sounds" meanwhile. When they cannot load within 10 s, playback uses triangle-wave reference tones and says so in the error banner. The transport schedules on the audio clock in a 1.5 s lookahead window refilled every 100 ms; the playhead follows written score positions even after jumps. Browser tests read what was asked to sound through `globalThis.__amanuensisSoundProbe`.

## Remaining musical vocabulary

Ties/slurs, crescendo/diminuendo hairpins, tuplets, pickups, alternate endings (1st/2nd endings), nested repeats, mid-score key changes, clef changes, cautionary signatures at line ends, polyphony and custom drawn symbols are still separate work. They need semantic commands, validation, drawing and playback policies together. No unsupported mark should be drawn as if its behavior were implemented.

## Verification

Unit coverage includes mixed-meter round trips, rejected destructive changes, exact rhythm, full-measure rests, 6/8 beaming, expressive/repeated playback, anchored indications, migration, atomicity and stale tool previews. Browser coverage includes applying mixed meters, editing expressions/text, repeats, rest entry, undo/reload and existing direct-edit/export flows.

### Direct sheet interaction

The sheet exposes note-duration buttons on selection and context menus for notes, barlines and annotations. Vertical note dragging changes pitch; horizontal dragging reorders within the current measure (`moveEvent`, with a null destination meaning the end). Dragging any barline inside a line uses `setMeasureWidth` to persist that bar's engraved width without changing rhythm; the line's other bars re-justify. These edits use the same revision-checked command pipeline as AI tools, persistence and undo. Drag previews stay local and Escape cancels them.
