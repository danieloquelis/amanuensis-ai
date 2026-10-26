# Implemented musical engine

This describes current code, rather than the full product roadmap. The application remains local and monophonic. All musical mutations go through the same validated command engine; the renderer and playback compiler derive their state from the resulting document.

## Document v2

Each measure carries an explicit meter. Returning to 4/4 after a 6/8 passage is represented in the data and drawn on the score. Time is stored as exact rational quarter-note beats; 6/8 holds three quarter-note beats, grouped in two dotted-quarter pulses. Global tempo and local tempo changes explicitly use quarter-note BPM, so switching meter does not silently reinterpret tempo.

Events have stable IDs, spelled pitches (or rests), exact durations and optional articulation. Shortening, deleting or padding leaves ordinary rests, grouped to the beat (`operations/rests.ts`). Drafts saved with the earlier `gap` (empty-space) marker open with those events as rests. Full-measure rests are explicit and adapt to local capacity. Indications anchor to event or measure IDs; dynamics are musical instructions, while free text is printed and exposed as contextual information without executing it. Repeat ranges use measure IDs and total passes. Overlapping/nested repeats and alternate endings are rejected.

Version 1 native files migrate to v2 with the original IDs, title, revision, pitches and timing intact. Unsupported fields are rejected instead of discarded. The local storage key remains unchanged so previous drafts can be opened.

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

Playback first resolves written dynamics and tempo, then unfolds repeat ranges. It schedules on the audio clock; the playhead follows written score positions even after jumps. Dynamics affect gain; accents increase attack level; staccato/tenuto affect note gating; fermatas extend reference duration by 1.5×. These are preview conventions, not a promise of expressive sampled performance. Free text does not alter sound.

## Remaining musical vocabulary

Ties/slurs, crescendo/diminuendo hairpins, tuplets, pickups, alternate endings (1st/2nd endings), nested repeats, mid-score key changes, clef changes, cautionary signatures at line ends, polyphony and custom drawn symbols are still separate work. They need semantic commands, validation, drawing and playback policies together. No unsupported mark should be drawn as if its behavior were implemented.

## Verification

Unit coverage includes mixed-meter round trips, rejected destructive changes, exact rhythm, full-measure rests, 6/8 beaming, expressive/repeated playback, anchored indications, migration, atomicity and stale tool previews. Browser coverage includes applying mixed meters, editing expressions/text, repeats, rest entry, undo/reload and existing direct-edit/export flows.

### Direct sheet interaction

The sheet exposes note-duration buttons on selection and context menus for notes, barlines and annotations. Vertical note dragging changes pitch; horizontal dragging reorders within the current measure (`moveEvent`, with a null destination meaning the end). Dragging any barline inside a line uses `setMeasureWidth` to persist that bar's engraved width without changing rhythm; the line's other bars re-justify. These edits use the same revision-checked command pipeline as AI tools, persistence and undo. Drag previews stay local and Escape cancels them.
