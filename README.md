# Amanuensis AI

A voice-first musical workspace built around an owned notation engine. Meta-powered interpretation will use the same semantic commands as manual editing.

## Current implementation

The score engine now supports:

- Per-measure meters (2/4, 3/4, 4/4, 5/4, 3/8, 6/8, 9/8, 12/8), range changes and correct compound-meter beam grouping.
- Notes/rests from whole through sixteenth, dotted values, and full-measure rests. Shortening a note leaves editable space rather than inserting a rest; duration edits never overwrite adjacent notes.
- Explicit meter-change policies: preserve durations using trailing empty space, or proportionally fit the rhythm. No silent note truncation or invented tuplets.
- Insert, duplicate, clear and delete measures; replace measure contents; reorder events within a measure; pitch dragging and keyboard edits.
- Anchored text indications with add/edit/remove, dynamics pp–ff, staccato, accents, tenuto and fermatas.
- Non-overlapping repeat ranges with two to four total passes, local tempo changes, expressive reference playback and repeat-aware playhead.
- Revision-checked atomic batches, undo/redo, and bounded AI tools for context, preview, application and undo. See [engine contracts](docs/architecture/implemented-score-engine.md).
- Local saving, validated native JSON with v1 migration, and print output.

Editing actions live in compact toolbar popovers; there is no permanent tools sidebar or inspector. The opening melody remains hand-authored example data. Meta inference, voice recording/transcription, Rive assets, server persistence and collaboration are not connected yet. Ties/slurs, hairpins, tuplets, alternate endings, nested repeats, polyphony and MusicXML remain unsupported. Tools report these limits. No model calls occur and `.env` credentials are not read by client components.

## Run

```sh
yarn install
yarn dev
```

Open http://localhost:3000. Yarn uses `node_modules` because the installed Next.js Turbopack does not support Plug'n'Play. Keep `.env` private; the planned server adapter will use `MODEL_API_KEY`.

## Checks

```sh
yarn lint
yarn typecheck
yarn test
yarn build
yarn playwright install chromium
yarn test:e2e
```

Browser tests start the production build on port 3100. Build first. Unit tests cover rhythm, commands, validation, stale writes, idempotency, undo/redo, engraving and playback plans. Browser tests exercise actual editing, dragging, persistence and recovery.

## Editing

Select a note or rest on the sheet. Drag vertically or use Up/Down for pitch. Drag horizontally to reorder within a bar. A small strip beneath the selected note changes duration; right-click or tap its ellipsis for accidentals, articulation and rest/note conversion. Drag an internal barline to adjust spacing; double-click it to reset. Double-click text on the sheet to edit it. Click a bar number or note to select it. The toolbar exposes meter, dynamics, text, repeats and measure actions only when needed.

To write **4/4 → 6/8 → 4/4**, click the bar 2 number, open the toolbar time signature, choose 6/8, choose **Fit rhythm proportionally**, then **Preview meter change** and **Apply change**. Only the selected range changes; bar 3 retains 4/4. **Keep note durations** instead adds editable space or trims trailing rests and refuses to cut notes. **Clear to rests** is explicit and previewed. Changes undo as a single transaction.

Dynamics affect reference-tone volume, accents attack level, staccato/tenuto note length and fermatas time (a documented 1.5× reference hold). Text indications remain semantic context and printed text, not synthesized interpretation. Tempo values are explicitly quarter-note BPM, including in compound meter. Repeats use total passes and restore written context on each pass.

Local edits save on this device; **Save a copy** downloads the lossless native file. **Open** replaces the active local score with a validated file. If storage is corrupt or unavailable, it stays untouched. Download a copy to retain edits in that case. One drag, accepted preview, or tool batch is one undo step. Use Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z.

This slice assumes one editing tab. Undo history and idempotency receipts are session-local. The future server command gateway must add atomic persistence and field-aware conflict/undo handling before concurrent editing or agent writes are enabled. Print is intended for short phrases; publication pagination is later work.

## Architecture

See [the documentation index](docs/README.md), [system design](docs/architecture/system-design.md), and [delivery gates](docs/planning/delivery-plan.md). The domain contains no React, Next.js, audio SDK or model SDK dependencies. UI and future AI tools call typed score operations; SVG geometry is derived state.
