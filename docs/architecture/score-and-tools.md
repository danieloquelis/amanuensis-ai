# Score state and agent tool contracts

These are design contracts, not implemented interfaces. Details may evolve after the first notation fixture, but the invariants below should hold.

## Source of truth

`ScoreDocument` contains schema version, project/score ID, revision, parts/staves/voices, stable measure IDs, notes/rests, clef/key/meter/tempo context, ties/slurs, annotations and explicit user overrides. Several parts (a piano may have a grand staff), and up to two voices per staff, are supported.

Notes have stable IDs, spelled pitch (`step`, `alter`, `octave`), measure-local onset and duration, written notation hints and optional evidence references. Musical time uses reduced rational **quarter-note beats**, never float seconds: an eighth note is 1/2 and a 3/4 bar holds 3. Performance timestamps remain sample indices/seconds in separate evidence records.

Store enharmonic spelling, not MIDI pitch alone. A tie joins equal sounding pitches across note fragments; a slur expresses phrasing. Persist fragments and relationships across bars so layout does not regenerate musical IDs. Keep visual offsets separate from musical timing. Only supported semantics influence playback.

An incomplete draft bar may exist with an explicit status. Accepted completed bars must have valid capacity and ordering, with rests inserted only by a defined finalize operation. Overlap, overfill, missing anchors, unsupported durations, invalid ties or impossible ranges return actionable validation errors. Never truncate a phrase to make a command pass.

## Owned renderer contract

Input: score revision + engraving configuration + viewport/print constraints + glyph metrics. Output: deterministic scene containing staff lines, glyphs, curves, bounding boxes, hit regions and semantic ID mappings.

Stages: notation normalization, rhythmic grouping, intrinsic glyph measurement, horizontal spacing, system breaking, vertical collision resolution, beam/slur/tie geometry, then SVG scene generation. Use staff-space units. React is the presentation adapter, not the engraving algorithm.

The initial renderer is SVG for inspectable geometry and crisp scalable output. Canvas/WebGL can be considered after measurement behind the same scene contract. Interaction overlays never become the saved score. Effects are removed from print output. Licensed SMuFL glyphs are recommended for the first engine, subject to founder agreement and asset license review; commissioned glyphs can replace that adapter later.

## Tool surface

The language model sees a small typed tool catalog, not a generic file editor or raw JSON patch API. Example proposed tool names:

| Tool | Inputs | Result |
| --- | --- | --- |
| `score.get_context` | Score ID, selected IDs/range, optional since-revision | Current revision, relevant notes/context, overrides, annotations and changes |
| `voice.get_evidence` | Authorized take/span/candidate IDs | Structured speech/performance evidence and unresolved assumptions |
| `score.preview` | Expected revision, typed operation batch | Validated proposal ID, affected range, diff and warnings |
| `score.apply` | Expected revision, proposal ID or explicit operation batch, request ID | New revision, stable IDs, change receipt and undo transaction ID |
| `score.undo` | Expected revision, transaction ID, request ID | Validated compensating transaction or conflict |
| `assistant.ask` | One musical question, concrete choices, affected targets | Clarification state; no score mutation |

Playback/audition requests return a client action for a user-authorized transport session; the server does not play browser audio. Capture access, project deletion and arbitrary code execution are not model tools.

Supported operation examples: `insertPhrase`, `replaceRange`, `setPitch`, `setDuration`, `moveEvent`, `transposeRange`, `setContext`, `addNotation`, `removeNotation`, `addAnnotation`, `removeEvents`. Exact operation schemas must specify insertion versus overwrite and whether later events move. A musical interval and a chromatic semitone count are distinct transpose options.

Every mutation includes an authenticated actor, score ID, expected revision, request ID, source (manual/agent), target IDs and bounded payload. Derive authorization from the session; never trust a model-provided actor ID. Tool results report validation errors and supported alternatives, not stack traces.

## Tool execution loop

1. Obtain current score and acknowledged selection context. Resolve spoken references against stable IDs; unclear references become a question.
2. Combine explicit instructions with acoustic candidates and recorded assumptions. Give the agent relevant measures plus neighboring key/meter/tempo and annotations, not the entire conversation forever.
3. Muse Spark requests a typed operation. Application validates capability, targets, expected revision and musical invariants.
4. New vocal material and broad transformations produce a preview. Small explicit edits may commit directly with Undo. Preview permission is product behavior, not an extra infrastructure approval flow.
5. Apply atomically, return the new revision and concise musical receipt, and notify UI and active agent context.
6. On stale state, fetch changes and replan. Do not automatically substitute a new revision onto an old patch.

A preview is bound to an exact revision and operation payload. Accepting it after a manual change requires revalidation/repreview. Audition previews from a temporary score branch, clearly labeled; the saved score does not change until application.

## Manual-edit example

The agent reads revision 12 with note N7 = C4. The user drags N7 to D4; one completed gesture commits revision 13. An agent proposal based on 12 attempts to replace the phrase. Server returns `STALE_REVISION`, with latest revision 13 and touched IDs. The agent reads the edit and either preserves D4 while applying the remaining instruction, or asks about an actual conflict. Its old proposal never silently overwrites N7.

After revision 13, “make that note longer” resolves to N7 from selection, with current D4 and measure capacity. A user override protects D4 from unsolicited reanalysis but does not prevent an explicitly requested later pitch change.

Notifications improve freshness; revision checks guarantee correctness. Selection and viewport are ephemeral context, not revisions of musical content. Selection changes during a run require target revalidation where the instruction depends on selection.

## Undo, idempotency and custom marks

Group one drag or one accepted agent operation batch into one transaction. Store before/after values for touched entities and provenance. Undo generates a validated compensating transaction rather than replacing the whole score snapshot; conflicting newer changes prevent blind restoration. Redo obeys the same rule. An identical request ID returns the prior outcome; reuse with a different payload is rejected.

Custom marks contain an anchor/range, label/description, kind, provenance and optional supported playback meaning. The agent receives these semantic fields. A freehand symbol alone is insufficient context, so freehand drawing is deferred until labeling/anchoring exists. If deletion removes an anchor, explicitly delete, reanchor or report the orphan; do not retain invisible meaning.

## Serialization and exports

Native versioned JSON preserves all supported content and annotation metadata; schema migrations must be explicit. Print/PDF derives from a clean SVG layout. A bounded MusicXML export follows after native save/print is reliable and reports unsupported content. MusicXML import and MIDI are later work. External renderers may validate export fixtures, but are never the shipped rendering engine.
