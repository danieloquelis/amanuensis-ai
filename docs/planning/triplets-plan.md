# Triplets plan

Status: phases 0–3 implemented on 1 November 2026: triplets are stored, checked, drawn, played, written by the agent (`3[…]` score text, `makeTuplet`, `removeTuplet`, `replaceMeasure.tuplet`) and made in the editor (Triplet button on the note card). Phase 4a done the same day: `voice/domain/triplet-feel.ts` finds three notes sung with even gaps of a third of a beat (at the take's tempo, measured in seconds, since the reading bends its tempo map to put every note on the grid), and `voice_transcribe_melody` reports them as `soundsLikeTriplets` by bar and beat; the agent mentions them and leaves the sung notes as written. No false alarms on the 14 recorded takes in `tests/fixtures/voice`. Phase 4b is not started. Where the code differs from this plan: a triplet must also start on a beat (a sixteenth triplet on a half beat), which keeps beams, chords and positions on their grid; copying a run of notes (`copyNotes`) and shifting or stretching time refuse music with triplets, because both respell what they move; copied bars give their triplets fresh IDs (`renameTuplets`); beat positions match within 0.01 everywhere, so "2:1.33" names a triplet's second note. Since this plan was written, scores gained parts, staves and voices: tuplet groups are validated per voice bar.

## Goal

Notes in groups of three in the time of two (3:2), in simple meters: written, drawn, played, edited in the editor and by the agent, and flagged by the singing transcriber. Today they are rejected: `modules/score/domain/validation.ts` throws "Unsupported duration; tuplets are not available yet."

Musicians write triplets constantly (swing figures, ballads, "da-da-da" in the time of two). Without them the transcriber and the agent can only approximate them with sixteenths and ties.

## Decisions

### A note keeps its written value; a triplet is a mark on the note

```ts
// modules/score/domain/schema.ts, eventSchema
tuplet: z.strictObject({ id: idSchema, actual: z.literal(3), normal: z.literal(2) }).optional()
```

- `event.duration` stays the **written** value (an eighth inside an eighth-note triplet). Every place that decides how a note looks already reads `durationNotation(event.duration)`, and none of it changes: `EventGlyph.tsx` (noteheads, flags), `beams.ts` `isSixteenth`, `measure-analysis.ts` `findBeamGroups`, `spacing.ts` `eventExtents`, `slurs.ts` `hasStem`, `ties.ts`, the editor's `DurationButtons.tsx` and `note-edits.ts` `toggleDotOperation`.
- The **sounding** length is derived: written × normal / actual. Only code doing time arithmetic changes.
- The group's span is not stored. It is derived (sum of written values × 2/3) and must be 0.5, 1 or 2 beats (sixteenth, eighth or quarter triplets).
- The group `id` is stored because it cannot be inferred: `q e e q` as one quarter-triplet group sounds the same as two eighth-triplet groups but is bracketed differently. It is registered once per group in the validation `IdRegistry`.
- `actual` and `normal` are literals so that other ratios can be added later without reshaping the data. `schemaVersion` stays 2: the field is optional, so old files load unchanged.
- Rejected: a tuplet entity listing member IDs (as sketched in `docs/research/notation-engine.md`) or a `measure.tuplets[]` array. Both must be re-synchronized on every splice, clone and respell, as slurs need `pruneSlurs`. A mark on the event travels with the event.
- Rejected: storing the sounding duration (1/3 beat). Every engraving and editor reader would then need to know about tuplets.
- Compatible with the planned multi-voice score shape ([instruments and voices plan](instruments-voices-plan.md)): when bars hold several voices, events move into voices and keep their marks.

### Exact time, one place

Add to `modules/score/domain/rhythm.ts` and export from `modules/score/index.ts`:

- `soundingDuration(event): Fraction` (needs a small `multiply` for fractions)
- `soundingBeats(event): number`
- `eventOnsets(events): number[]`, computed with exact fractions

Floats drift (`0.5 + 1/3 + 1/3 + 1/3` is `1.4999999999999998`), and several places compare positions exactly (`rests.ts` `fitsBeat` checks `position === 0`; `setDuration` checks `available < op.duration`).

### Score text (what the agent reads and writes)

`3[C4e D4e E4e]`: written values inside the brackets, filling the time of two. Mixed values (`3[C4q D4e]`), ties and slurs combine: `(3[C4e D4e E4e~] E4q)`. A per-note suffix like `C4e3` was rejected because it cannot mark where a group starts and ends.

Positions: notes inside a group are best named by order (`2#3`). Beat positions use sounding onsets with two decimals ("2:1.33"), resolved with a 0.01 tolerance; a third is at least 1/24 beat from every 1/8 grid point, so this cannot be confused.

## Phases

Each phase leaves the app working and all checks green (`yarn check`, then `yarn build && yarn test:e2e`).

### Phase 0: one place for note lengths (no behaviour change)

Add the helpers above and switch every call site that treats `event.duration` as time:

| Where | Today | Change |
| --- | --- | --- |
| `score/domain/validation.ts` `validateMeasure` (~l.97–117) | sums `event.duration`; `isSupportedDuration` throws the tuplet error | sum `soundingDuration` (phase 1 also adds `validateTuplets`) |
| `score/domain/operations/rests.ts` `onsetOf` (~l.52) | raw numerator / denominator | `eventOnsets` |
| `score/domain/operations/event-operations.ts` `setDuration`, `restsStart` | `beats(event.duration)` | sounding helpers |
| `score/domain/operations/meter-operations.ts` `scaleRhythm`, `trimTrailingRests`, `fitMeasure` | `beats(...)` | sounding helpers |
| `score/domain/respell.ts` `respellScore` | `beats(event.duration)` | `soundingBeats` |
| `score/domain/harmonize.ts` (~l.98) | raw duration as time | `soundingBeats` (chord slot weights) |
| `score/application/positions.ts` `eventAt`, `notation-positions.ts` `onsets` / `positionOf` | raw beats | `eventOnsets` |
| `score/application/describe-score.ts` | `beats`, `beat` | sounding helpers |
| `score/application/score-text.ts` | onsets for chords and dynamics | `eventOnsets` |
| `engraving/domain/measure-analysis.ts` `analyzeEvents` | `onset`, `spring` from written value | sounding beats (triplet eighths then space slightly tighter, as is standard) |
| `playback/domain/plan.ts` `resolveWrittenEvents` (~l.162) | `length = beats(event.duration)` | `soundingBeats(event)` |
| `editor/application/selection.ts` `toolTarget` | written onsets | `eventOnsets` |
| `editor/ui/components/surface/SheetEvent.tsx` | `length`, sounding highlight | sounding beats |

Run `rg "beats\(.*duration|duration\.numerator|duration\.denominator" modules` to find any call site this table misses.

Tests: the existing unit and e2e suites pass unchanged; one new unit test for exact onsets.

### Phase 1: store, check, draw and play

- Schema: the `tuplet` field.
- New `score/domain/tuplets.ts`: `tupletGroups(events)`, `tupletSpan(group)`, `validateTuplets(measure, ids)`, called from `validateMeasure`. Rules: members adjacent and in one bar; ratio 3:2; written values undotted; span 0.5, 1 or 2 beats; no `measureRest` in a group; simple meters only (`beatGroupLength(meter) === 1`). Error messages teach: "A triplet fits three eighths (or a quarter and an eighth) into one beat."
- `respell.ts`: a tuplet group is opaque. It is never joined with a neighbouring rest or tie, never respelled, and `at` advances by its span. `rhythm-spelling.ts` is unchanged (group boundaries are always on the 1/8 grid).
- Engraving:
  - `findBeamGroups` keys members by tuplet id (so the eighths of a quarter-note triplet beam together across a beat), others by `floor(localBeat / groupLength)`.
  - New `engraving/domain/tuplets.ts` `placeTuplets(bar, events, beams, top)`, called in `layout-system.ts` after `beamBar` (stem ends must be final). Output `TupletMark { id, x1, x2, y, above, bracket }`, added to `scene.ts` and a `tuplets` field on `System`. Placed on the stem side, past the outermost stem tip or beam; a group of only rests goes above. A number alone when exactly one beam covers exactly the group, else a bracket with the number in a gap.
  - `above-staff.ts`: include tuplet marks in `inkTop` and `systemCeiling`, so chords and marks clear the "3".
  - New `engraving/ui/components/TupletMarks.tsx`, exported from `engraving/ui/index.ts`, rendered in `editor/ui/components/surface/SheetSystem.tsx` after `BeamLines`.
- Playback: phase 0 already handles timing.
- Nothing in the UI can create a triplet yet; they only enter through loaded JSON.

Tests:
- Unit, new `tests/unit/tuplets.test.ts`: valid bars; incomplete, non-adjacent and compound-meter groups rejected with their messages; respell leaves groups untouched.
- Unit: playback timings of 1/3 beat.
- Unit in `tests/unit/engraving.test.ts` with a new fixture `tests/fixtures/engraving/tuplets.json` (eighth, quarter and sixteenth triplets; a mixed `q e`; rests in a group; a tie into a group; chords above): the number clears every member's ink, the bracket spans first to last member, a fully beamed group has no bracket, nothing overlaps, the chord row sits above, playhead columns increase.
- e2e screenshot: add `tuplets` to the fixture list in `tests/e2e/engraving.spec.ts`, look at it, then accept the baseline.

### Phase 2: operations, score text and the agent

- New `score/domain/operations/tuplet-schemas.ts` and `tuplet-operations.ts`, registered in `apply-command.ts` (`schema.ts` is near the 200-line limit):
  - `makeTuplet { eventId }`: the selected undotted value (0.5, 1 or 2) becomes three triplet values of half its length (a quarter becomes three triplet eighths). The first keeps its ID, pitch and articulation; the other two are rests.
  - `removeTuplet { eventId }` (any member): the group collapses to one value of the span length, with the first member's pitch and ID. The exact inverse of `makeTuplet`.
- `setDuration`: a note outside a group never consumes rests inside one. A member works in written units inside its group: it consumes only later rests of the same group, leftover becomes rests carrying the mark, and growing past the group's end throws.
- `moveEvent`: a member moves only within its group; nothing moves into the middle of a group.
- `replaceMeasure`: new op field `tuplet?: number` (a group number local to the bar), mapped to `{ id: \`${idPrefix}-t${n}\`, actual: 3, normal: 2 }`.
- `duplicateMeasure` uses `structuredClone`: give each group in the copy a fresh id (`${idPrefix}-t${k}`), or the duplicate-id check fails.
- `setMeter`: scale keeps marks (4/4 → 2/4 turns eighth triplets into sixteenth triplets); a bar with triplets cannot go to a compound meter (clear message); `trimTrailingRests` treats a trailing group as notes ("would cut notes").
- Score text: `score-text.ts` prints `3[…]` with sounding onsets; `score-text-write.ts` parses it. The `TOKEN` regex gets an optional `3[` prefix after `(` and an optional `]` suffix before `)`; a bare `3[` or `]` token is also accepted; nested or unclosed groups are errors. `WrittenEvent` gets `tuplet: number | null`; `spelled()` passes members through without `spellRhythm` and advances `at` by the span. Move `parseBarsText` and `parseToken` into a new `score-text-parse.ts` first (the file is at 157 lines).
- `describe-score.ts`: `durationName` says "triplet eighth"; add `tuplet: "3:2"`; add a `tuplets` entry to `SCORE_VOCABULARY`.
- Agent:
  - `.describe()` text for the new operations; `setDuration` ("inside a triplet, values change within it"); `replaceMeasure.tuplet`; `setMeter` ("bars with triplets cannot go into 6/8, 9/8 or 12/8"); `fields.ts` `eventId` ("triplet notes: use 2#n").
  - `assistant/application/score-tool-gateway.ts` `UNSUPPORTED_NOTATION`: "tuplets" becomes "tuplets other than triplets".
  - `SCORE_TEXT_GUIDE` (in `score-text.ts`, already in the system prompt): "3[…] puts three written values in the time of two: 3[C4e D4e E4e] = 1 beat, 3[C4q D4q E4q] = 2 beats; name triplet notes by order (2#3)."
  - `score/domain/rhythm-readability.ts`: count triplets so the "plainer tempo" comparison in `voice_transcribe_melody` stays fair.

Tests (unit): each operation's happy path and rejections; `removeTuplet` undoes `makeTuplet` exactly; `duplicateMeasure` of a triplet bar validates; 4/4 → 2/4 scale keeps triplets and → 6/8 is rejected; `scoreText` → `writeBars` round trip is identical; positions "2#3" and "2:1.33" resolve. `tests/unit/agent-tools.test.ts` already checks every operation has a description; add a `score_write` with `3[…]` to `tests/unit/score-text.test.ts`.

### Phase 3: the editor

- `editor/application/note-edits.ts`: `tripletEdit(event): Edit`, returning `makeTuplet` ("Made triplet") or, for a member, `removeTuplet` ("Removed triplet").
- New `editor/ui/components/sheet-menu/TripletButton.tsx` in the rhythm row after the dot, wired in `editor/ui/components/selection/NoteActions.tsx` like `sheet-menu/TieButton.tsx`. Label "Triplet", `aria-pressed` when the note is in a group, disabled when `checkOperation(editor.score, op)` fails (dotted value, compound meter, whole-bar rest).
- The dot button is disabled for members (no dotted values inside triplets in version 1). Duration buttons on a member send ordinary `setDuration`, which now works inside the group: triplet eighth #1 → Quarter gives `3[q e]`.
- `SheetEvent.tsx` aria-label for members: "Bar 1, beat 1.33, C4, triplet eighth". Labels of other notes stay exactly as they are; `tests/e2e/workspace.spec.ts` matches strings like "1 beats".
- `toolTarget`: snap to the group's start for members (chord `beat` must stay a multiple of 0.125).
- Follow `minimal-controls`: no badges on existing controls; details go in `aria-label`.

Tests: unit for `tripletEdit`; e2e in `tests/e2e/workspace.spec.ts`: select a quarter → Triplet → three "triplet eighth" buttons → Quarter on the first gives `3[q e]` → Triplet again restores the quarter → Undo.

### Phase 4a: the transcriber flags triplets (it does not write them)

After `readTiming` in `modules/voice/domain/transcribe-melody.ts`, find beats where three onsets sit much closer to the thirds grid than to the sixteenths grid, and add "bar 3, beat 2 sounds like a triplet; written straight" to `warnings` (or `evidence`). The agent then mentions it and can offer `makeTuplet`. This is also listed in `docs/planning/delivery-plan.md`.

Tests: unit in the voice rhythm tests: synthetic onsets at thirds produce the warning; straight takes produce none.

### Phase 4b (optional, a separate project): the transcriber writes triplets

`tempo-map.ts` `readRhythm`: Viterbi over twelfths of a beat instead of sixteenths (`STEPS`, `SIXTEENTHS_PER_BEAT`, `positionCost`) with a `triplet` weight in `RhythmWeights`, allowing triplet positions only as complete groups within a beat. `rhythm.ts` `snap`, `placeNotes`, `toBars`: `BarEvent` gets a `tuplet` field and groups skip `spellRhythm`. `voice-transcription-tool.ts` `barText` prints `3[…]`. The main risk is straight singing misread as triplets: gate it on the labelled real-take regression tests (`yarn fit:singing` corpus and `tests/fixtures/voice/`).

## Out of scope for version 1

Nested tuplets; ratios other than 3:2 (duplets in 6/8, quintuplets, 6:4); tuplets across a barline; tuplets in compound meters; a whole-bar span (4 beats); dotted values inside a tuplet; respelling inside a group; chord symbols at triplet positions; slurs avoiding the triplet number; selecting or dragging the bracket; swing playback; reading 2/4 as 6/8 triplets; the transcriber writing triplets (phase 4b). Each rejection has a message that says so.

## Risks

- Float drift in onsets: exact fractions (phase 0).
- The respelling pass merging rests across a group boundary: groups are opaque.
- Duplicate tuplet ids after `duplicateMeasure`.
- Chords, `harmonize` and `toolTarget` assuming positions on a 1/8 grid.
- Hidden `===` comparisons on beats.
- The 200-line limit: `schema.ts` (~188), `score-text-write.ts` (~157) and `validation.ts` (~155) are close; new logic goes in new files.
- The agent writing incomplete groups: error messages that teach the rule.
- Triplet numbers pushing the chord row up: include them in `above-staff.ts`.

## Order with the instruments and voices plan

The [instruments and voices plan](instruments-voices-plan.md) also rewrites the lines phase 0 touches (its phase B0, "the accessor seam", routes every read of `measure.events` through `barEvents`). Its recommended order is A1 → B0 → triplets phase 0 → B1 → …, with triplets phases 1–3 any time after B1 and before its phase D (voices), so groups are validated per voice bar from the start. If triplets are done first instead, phase 0 here still works on today's shape, and B0 then wraps these helpers rather than rewriting them.

## Starting the session

Read `AGENTS.md`, [code conventions](../architecture/code-conventions.md) and this plan. Work phase by phase, running `yarn check` after each and `yarn build && yarn test:e2e` before finishing a phase. Commit to main only when the product owner says so.
