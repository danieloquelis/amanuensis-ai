# Owned notation engine: research and proposed design

Research date: 2026-10-26. Status: architecture proposal, no implementation or benchmark results. This document respects the requirement to own engraving, layout, interaction, and score tooling. It does not propose wrapping an existing notation renderer.

This is an exploratory research report. The consolidated [tool contracts](../architecture/score-and-tools.md) define the proposed public tool names, and the [product brief](../product/product-brief.md) controls initial notation scope. Broader options below are not release commitments.

## Recommendation

Build a deterministic score engine with an owned SVG engraver and a semantic command API. The agent and the pointer editor call the same commands. The score document is authoritative; SVG coordinates, chat history, and screenshots are projections. Keep acoustic evidence, musical interpretation, engraving, and audio playback separate so improving one does not corrupt the others.

The first useful product should handle a short, single melodic line. Attractive spacing, reliable correction, and faithful playback are substantial work even within that scope. General engraving of arbitrary orchestral notation should not be an MVP promise.

## What the sources establish

| Verified fact | Architectural implication (our proposal) |
| --- | --- |
| SMuFL defines glyph registration, metrics, and metadata for applications consuming music fonts. [Specification](https://w3c.github.io/smufl/latest/specification/index.html) | Adopt a glyph adapter and staff-space coordinate system while owning layout rules. A font is not an engraving engine. |
| MusicXML represents pitch using diatonic step, chromatic alteration, and octave. [Pitch](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/pitch/) | Preserve enharmonic spelling; MIDI note number alone cannot distinguish C-sharp from D-flat notation. |
| MusicXML uses divisions per quarter note to express duration and explicitly accounts for tuplets. [Divisions](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/divisions/) | Use exact rational musical time internally and calculate export divisions from denominators. |
| MusicXML distinguishes a sounding tie from its visual notation. [Tie](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/tie/) | Playback sustains a tie chain; engraving may render multiple note fragments across bars or systems. |
| MusicXML offers `other-notation`, but arbitrary extensions do not guarantee interoperability. [Other notation](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/other-notation/) | Preserve custom annotations in our native document and report export losses. |
| Web Audio schedules source start/stop against the audio context clock. [Web Audio API](https://www.w3.org/TR/webaudio-1.0/) | Use an audio-clock scheduler; animation frames follow playback and never drive musical timing. |

Font decision remains explicit: use a licensed SMuFL font initially, or commission owned glyphs. The recommended first option accelerates legibility without outsourcing the renderer. If “no open source things” also excludes fonts, commission the narrow MVP glyph set; font design then becomes a launch dependency. Do not silently install a font or equate a standards-compliant font with permission to redistribute it. Review the selected asset's actual license before bundling.

## Four representations with different responsibilities

1. **Performance evidence:** take ID, sample/time spans, pitch contour, onset candidates, voiced probability, confidence, and model versions. Immutable evidence is distinct from edited notes. A changed score does not rewrite what the singer performed.
2. **Semantic score:** stable IDs, exact timing, spelled pitches, rests, meter, tempo, key, articulations, ties, annotations, and explicit user decisions. This is the editing and agent boundary.
3. **Engraving scene:** systems, staff positions, glyphs, paths, bounding boxes, anchors, hit regions, and mapping to semantic IDs. It is reproducibly derived from a score revision plus engraving settings.
4. **Playback plan:** sounding events, absolute seconds, pitch frequencies, gains, and mapping back to score IDs. It is derived from the same score revision and a tempo map.

Raw audio seconds and musical beats must never share a field. An inferred quantization maps one to the other and records the hypothesis and confidence. Keep alternatives until the user resolves a musically significant ambiguity.

## Proposed semantic document

The following describes contracts, not a committed implementation schema.

| Entity | Required information |
| --- | --- |
| Score | `scoreId`, schema version, monotonic revision, title, parts, meter/tempo/key changes, engraving settings |
| Part / staff / voice | Stable IDs, instrument label, clef; MVP permits one staff and one monophonic voice |
| Measure | Stable ID, ordering, start in score beats, expected length, pickup/incomplete status |
| Note | Stable ID, voice/measure references, local onset, duration, pitch `{step, alter, octave}`, optional written-value hint, evidence references, confidence |
| Rest | Stable ID, onset/duration, explicit versus automatically derived rest |
| Tuplet | Stable ID, member IDs, actual/normal ratio; deferred in first vertical slice but representable |
| Tie / slur | Stable ID, endpoint note IDs, distinct musical meanings |
| Annotation | Stable ID, semantic kind, anchor or anchored range, text, optional playback meaning and visual override |
| User override | Target ID/property, chosen value, provenance; re-analysis must preserve it unless a requested operation explicitly targets it |
| Evidence reference | Take ID and start/end seconds; optional acoustic candidate ID |

Use reduced integer fractions `{numerator, denominator}` with denominator greater than zero, measured in **quarter-note beats**: quarter = 1/1, eighth = 1/2, eighth-note triplet = 1/3. A 6/8 measure holds 3 quarter-note beats, while its conventional compound beat grouping remains separately represented. Never use floating point for bar completeness or note alignment. Bound numerator/denominator sizes and serialize safely.

Written duration and sounding duration are related but not identical: ties, dots, and tuplets affect spelling and grouping. Preserve requested notation when valid; otherwise derive a deterministic decomposition and show it in the edit preview. Store semantic note fragments and tie relationships when a note crosses a bar; maintain a performance-group ID so the source event remains traceable. Do not create new unstable IDs on every re-layout.

Validation includes existing references, positive durations, legal pitch range, no overlap in the MVP voice, valid tie endpoints/pitches, bar capacity, well-formed annotation anchors, supported notation, and explicit pickup rules. An underfilled draft measure is allowed and visibly incomplete; finalization may insert rests. Overfilled measures require an explicit split/reflow operation rather than silent truncation.

## Owned engraving pipeline

1. Normalize and validate the document; calculate meter groups, accidental state, and note spelling.
2. Create notation fragments: noteheads, accidentals, stems, flags, dots, ledger lines, rests, ties, and supported annotations.
3. Measure glyphs and attached symbols using the selected font metadata. Use staff spaces internally and convert to output pixels only at the view boundary.
4. Solve horizontal spacing from rhythmic weights and minimum occupied widths. Duration is not a linear pixel width. Include accidentals, dots, and text in collision constraints.
5. Break measures into systems given available width, then justify spacing. Recompute affected systems after an edit and propagate if their widths change.
6. Resolve stem directions, beam groups/slopes, tie curves, annotation lanes, and collisions. Use deterministic rules before optional user overrides.
7. Emit a scene graph with paint primitives, semantic references, visual bounds, and larger interaction bounds.
8. Render the scene to SVG for the initial browser surface and print export. Keep backend-specific details out of score semantics so canvas/WebGL could be evaluated later if measured scale requires it.

The first render target is continuous systems with zoom and pan. Page layout/print adds explicit page size, margins, and system breaks. Fonts must finish loading before final metrics/layout; otherwise fallback font metrics can produce wrong geometry. Cache by score revision, layout width, font version, and style version.

Beauty comes from disciplined spacing, curves, optical weight, restrained color, and readable typography. Add selection halos, recording feedback, change highlights, and playback motion in a presentation layer. Effects must not alter engraving geometry or exported score content. Rive can animate surrounding status/control states, while score geometry and hit testing stay under the engraving engine.

## Direct manipulation and accessibility

Hit testing returns semantic IDs and a role such as notehead, accidental, duration handle, or annotation. Transform pointer coordinates through pan/zoom before querying hit regions. Overlapping hit regions need deterministic priority and cycling or a small chooser.

Vertical note dragging changes diatonic staff position, with key-aware spelling and explicit accidental controls. Horizontal movement changes snapped musical onset rather than arbitrary x position. On pointer movement show a preview; on release dispatch one atomic semantic command. Duration changes use handles or controls. Invalid overlaps show a clear blocked preview, with a deliberate replace/ripple mode available later.

Layout nudging is a separate mode: it stores an anchored engraving override, not a different pitch or onset. This distinction lets “move the note up” mean pitch by default and keeps visual adjustments from changing sound.

Provide keyboard selection, pitch stepping, duration changes, delete, undo/redo, and a synchronized accessible list/inspector describing measure, beat, pitch, and duration. SVG graphics alone are not a sufficient accessibility model. Selection/playhead and hover are ephemeral UI state; score changes are persistent document events.

## Agent tools and one mutation path

The agent should manipulate musical concepts, never raw SVG, arbitrary JavaScript, or free-form JSON patches. Initial tool families:

| Tool | Purpose |
| --- | --- |
| `score.read` | Return revision, metadata, selected/ranged notes, annotations, incomplete bars, and relevant overrides |
| `score.changes_since` | Return committed semantic changes after a revision, with snapshot fallback when history is unavailable |
| `score.preview_operations` | Validate typed operations and return a projected semantic diff, warnings, and affected IDs without saving |
| `score.commit_operations` | Atomically apply validated operations against an expected revision |
| `score.undo_transaction` | Request a validated compensating transaction; do not erase later unrelated edits |
| `transport.preview` | Audition a bounded phrase or proposed revision without changing the score |

Typed operations include insert phrase, set pitch, set duration, move note, remove notes, set meter/key/tempo, add supported articulation, add/edit anchored annotation, and explicitly replace a selected phrase. Tool schemas enumerate supported capabilities. Unsupported notation returns a structured limitation rather than a plausible but meaningless mark.

A mutation carries `scoreId`, `expectedRevision`, `transactionId`/idempotency key, actor/source, typed operations, and user-intent reference. The server verifies ownership, schema, references, musical invariants, and expected revision in the same atomic commit. Return new revision, changed IDs, warnings, and a compact musical summary. A duplicate idempotency key returns the original result.

Use optimistic concurrency for the MVP. Example: the agent reads revision 12; the user drags a note and commits revision 13; the agent's revision-12 patch is rejected as stale. The agent reads the changes and re-plans. Never overwrite the user's note because the model completed late. Stale previews are invalidated; clients display only the preview's stated revision. This also protects against two tabs. Real-time multi-user CRDT merging is outside MVP scope.

After every accepted edit, publish a revision event to the UI and active agent run. Supply changed entities and relevant context on the next model/tool step. The agent still must re-read/validate at commit: notification alone is not a concurrency guarantee. Selection and viewport can be included as context, but they are not document truth. Cancel or supersede old runs when a new user instruction changes their intent.

Keep an append-only transaction journal plus current snapshot, not necessarily a full event-sourcing infrastructure. Each transaction has before/after values needed for undo. Undo against a newer document checks the touched fields; a conflicting undo cannot blindly restore the whole snapshot.

## Custom notation that AI can understand

Every custom mark must have a semantic anchor and a label/description: for example, “breathy entry” attached to note N, or “gradually more tense” across measures 2–4. Store visual shape separately from intended musical meaning. Distinguish informational marks from supported playback directives. Unknown marks remain visible/readable in agent context but do not invent synthesis behavior.

Start with text annotations, standard dynamics, and a small set of articulations. Arbitrary freehand shapes and bespoke playback plugins are later scope. When added, a freehand shape needs an accessible description and anchored target; visual recognition may assist interpretation but must not be the sole state representation.

## Playback and export

Compile notes/ties/rests through the tempo map into audio events. MVP uses a simple synthesized reference timbre to verify pitch/rhythm, with a licensed sampled instrument evaluated later. Schedule a short lookahead window against `AudioContext.currentTime`; use the browser timer only to replenish that window. Stop cancels future work and releases active voices. Seek rebuilds the schedule. The visual playhead follows the audio clock.

Playback uses a fixed score revision. For MVP, committing a musical edit stops playback and offers restart from the current musical position, avoiding half-old/half-new schedules. Recording disables score playback by default to avoid transcribing the app's own audio; a later monitored mode needs explicit echo handling and evaluation.

Native versioned JSON is the lossless save format. Initial deliverable exports are clean SVG/print and a bounded MusicXML 4.0 subset. MusicXML export preserves notation supported by both sides and reports unsupported annotations/effects. Calculate integer divisions from rational denominators and enforce complexity bounds. MIDI is useful later for playback interchange but cannot preserve complete engraving or custom semantics. MusicXML import is separate later work, not implied by export.

## Delivery boundaries and evaluation

**First vertical slice:** one staff, one voice, treble clef, fixed 4/4, fixed tempo, spelled chromatic pitches, quarter/eighth/half/whole durations, rests, barlines, selection, pitch correction, playback, save/reload, transaction undo. Feed a hand-authored semantic phrase first; integrate acoustic candidates only once this path is reliable.

**Useful melody MVP:** additional common meters and compound grouping, key signatures, sixteenths, dotted values, ties across bars, beam groups, basic dynamics/articulations, text annotations, short phrase replacement, zoom, clean print, bounded MusicXML export. Support ordinary triplets before claiming robust free-sung rhythm transcription; until then clearly label triplet candidates as unsupported for acceptance rather than quantizing them incorrectly.

**Later:** polyphony, chords, multiple staves/instruments, tuplets beyond the supported subset, lyrics, grace notes, repeats, transposition, microtonality, cross-staff beams, advanced slurs, arbitrary symbols, live collaboration, and publication-grade pagination.

Proposed verification gates (not measured results):

- Musical invariant tests for bar sums, ties, accidentals, compound-meter grouping, and rational timing; command replay and save/reload retain stable semantic identity.
- Small musician-reviewed engraving fixtures covering crowded accidentals, ledger lines, beams, dotted rhythms, ties at system breaks, and long annotations; visual snapshots supplement review rather than define correctness alone.
- Pointer and keyboard edits yield the same semantic operations; undo reverses one gesture/agent transaction without reverting unrelated work.
- A deliberately delayed agent commit cannot overwrite a newer manual edit; repeated commit requests cannot duplicate notes.
- Playback event timelines exactly match rational duration conversion within numerical tolerance; separately measure audible scheduling under main-thread load and stop latency on target browsers.
- Export fixtures validate against the MusicXML schema and round-trip through an independent reader for supported semantics, with external rendering used only as a test oracle, not as our shipped engine.
- Benchmark 32-bar and 128-bar melody documents on a named baseline device. Set performance budgets after the first prototype; no claim of 60 fps or publication-grade quality is justified yet.

Largest risks are scope growth in engraving, ambiguous rhythm interpretation, preserving notation semantics during edits, custom-mark portability, and early pressure for arbitrary scores. Mitigate with an explicit capability matrix, deterministic fixtures, musician review, and unsupported-feature errors rather than broad marketing claims.
