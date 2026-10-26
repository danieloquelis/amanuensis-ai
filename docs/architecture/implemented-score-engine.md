# Implemented musical engine

This describes current code, rather than the full product roadmap. The application remains local and monophonic. All musical mutations go through the same validated command engine; the renderer and playback compiler derive their state from the resulting document.

## Document v2

Each measure carries an explicit meter. Returning to 4/4 after a 6/8 passage is represented in the data and drawn on the score. Time is stored as exact rational quarter-note beats; 6/8 holds three quarter-note beats, grouped in two dotted-quarter pulses. Global tempo and local tempo changes explicitly use quarter-note BPM, so switching meter does not silently reinterpret tempo.

Events have stable IDs, spelled pitches (or rests), exact durations and optional articulation. A `gap` marker reserves unfinished rhythm without engraving a rest and can be filled with a note or explicit rest. Full-measure rests are explicit and adapt to local capacity. Indications anchor to event or measure IDs; dynamics are musical instructions, while free text is printed and exposed as contextual information without executing it. Repeat ranges use measure IDs and total passes. Overlapping/nested repeats and alternate endings are rejected.

Version 1 native files migrate to v2 with the original IDs, title, revision, pitches and timing intact. Unsupported fields are rejected instead of discarded. The local storage key remains unchanged so previous drafts can be opened.

## Shared operations

- `setPitch`, `setDuration`, `removeEvent` (leaves equal editable space), `moveEvent` (within a bar).
- `appendMeasure`, `duplicateMeasure`, `clearMeasure`, `deleteMeasure`, `replaceMeasure`.
- `setMeter` on explicit measure IDs; `setTempo` globally or at a bar; `removeTempo`.
- `setArticulation`, `putAnnotation`, `putRepeat`, `removeNotation`, `rename`.
- `batch` validates and commits a bounded ordered set of operations as one revision and undo step.

Commands are runtime-validated. An expected revision and unique request ID are required. Failure leaves the original score untouched. Retrying the same request does not duplicate notes; reusing an ID with different content fails. Deleted anchors remove dependent indications; duplication copies note/measure annotations with fresh IDs. User previews report their scope before destructive measure changes.

Meter changes have an explicit policy:

- **Preserve:** keep note durations; pad with editable space or trim trailing rests/spaces. Reject a change that would cut a note.
- **Scale:** multiply note durations by the ratio of new to old bar capacity. Only supported written values are accepted; a change requiring tuplets fails with an explanation.

This is not automatic re-barring across measure boundaries. A future re-bar operation must model ties and preserve event provenance, not silently redistribute notes.

## AI tool boundary

`modules/assistant/application/score-tools.ts` exports JSON Schema function definitions and `createScoreToolGateway(getSession, setSession)`:

| Tool | Contract |
| --- | --- |
| `score_get_context` | Return the semantic score, revision, validated selection, duration units and unsupported capabilities. |
| `score_preview` | Validate a command/batch without mutation; return the proposed score, changed/deleted measure IDs and a revision-bound preview ID. |
| `score_apply` | Apply a stored preview against its exact revision; duplicate applications are harmless. |
| `score_undo` | Undo the latest local transaction only at the supplied revision. |

The JSON Schemas are generated from the same Zod runtime schemas used to validate commands. An adapter can hand these definitions to Muse Spark and route tool requests to the gateway. No model provider is called by this module. Provider-specific schema compatibility and actual Muse tool execution still require integration tests.

Bind a gateway to one authorized project. The model cannot choose a repository or execute arbitrary code. Indication text must be treated as user content, not a new tool instruction. The current gateway is an in-process, single-writer implementation: server authorization, durable idempotency, cross-tab coordination and conflict-aware collaborative undo are still required before remote AI writes are enabled.

Preview registrations are bounded to 128 per gateway. Operation batches are bounded to 64 commands; documents to 32 measures. Tool results return structured errors. Re-query after a stale preview; never change its revision and retry an obsolete patch.

## Playback and engraving

The owned SVG engine derives staff positions, changing signatures, rhythmic grouping, dotted values, rests, accidental state, repeat marks and anchored indications. Compound meter beams follow dotted-quarter groups. Indication layout is intentionally conservative and not yet publication-grade collision solving/pagination.

Playback first resolves written dynamics and tempo, then unfolds repeat ranges. It schedules on the audio clock; the playhead follows written score positions even after jumps. Dynamics affect gain; accents increase attack level; staccato/tenuto affect note gating; fermatas extend reference duration by 1.5×. These are preview conventions, not a promise of expressive sampled performance. Free text does not alter sound.

## Remaining musical vocabulary

Ties/slurs, crescendo/diminuendo hairpins, tuplets, pickups, alternate endings, nested repeats, key/clef changes, polyphony and custom drawn symbols are still separate work. They need semantic commands, validation, drawing and playback policies together. No unsupported mark should be drawn as if its behavior were implemented.

## Verification

Unit coverage includes mixed-meter round trips, rejected destructive changes, exact rhythm, full-measure rests, 6/8 beaming, expressive/repeated playback, anchored indications, migration, atomicity and stale tool previews. Browser coverage includes applying mixed meters, editing expressions/text, repeats, rest entry, undo/reload and existing direct-edit/export flows.

### Direct sheet interaction

The sheet exposes note-duration buttons on selection and context menus for notes, barlines and annotations. Vertical note dragging changes pitch; horizontal dragging reorders within the current measure (`moveEvent`, with a null destination meaning the end). Internal barline dragging uses `setMeasureWidth` to persist a layout override without changing rhythm. These edits use the same revision-checked command pipeline as AI tools, persistence and undo. Drag previews stay local and Escape cancels them.
