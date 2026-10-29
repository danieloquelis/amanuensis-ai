# Amanuensis AI

A voice-first musical workspace built around an owned notation engine. Meta-powered interpretation will use the same semantic commands as manual editing.

## Current implementation

The engine is AI-first: every capability below is a typed score operation, usable by people through the editor and by agents through the score tools (`@/modules/assistant`).

- **Melody:** notes and rests from whole to sixteenth, dots, articulations, dynamics pp–ff, accidentals. Shortening or deleting a note leaves rests written to the beat; edits never overwrite neighbouring notes.
- **Meter and key:** 2/4 to 12/8 per bar (a change applies until the next one), a key signature from C♭ to C♯ in major or minor, and local tempo changes.
- **Lead sheet:** chord symbols that sound softly in playback, slash bars, measure-repeat (%) bars, and section marks (A, B, Verse…).
- **Form:** repeats, segno, coda, To Coda, Fine, D.C. and D.S. (al Fine / al Coda). Any number of each; playback follows them.
- **Text:** indications anywhere, dragged freely on the page.
- **Engraving:** duration- and width-aware spacing, balanced justified lines, sloped beams, chord and mark rows above the staff.
- **Safety:** revision-checked atomic edits, undo/redo, local saving, native JSON with migrations, and print.

Meta inference, voice capture, server persistence and collaboration are not connected yet. Ties/slurs, hairpins, tuplets, alternate endings, nested repeats, mid-score key or clef changes, polyphony and MusicXML remain unsupported; the tools report these limits.

## Run

```sh
yarn install
yarn dev
```

Open http://localhost:3000. `yarn install` also downloads the instrument samples (about 11 MB) into `public/sounds/v1/`; they are not kept in git. Only their `manifest.json` (URL, size and hash of every file) and `CREDITS.md` are. Run `yarn sounds:fetch` to download them again; offline, the app plays reference tones instead. `yarn build` fetches them first and fails without them, so a deploy always has sound. The app icons (`app/icon.svg`, `app/apple-icon.png`, `app/favicon.ico`) are built from the brand mark in `public/brand/mark.svg` by `yarn icons`. Yarn uses `node_modules` because the installed Next.js Turbopack does not support Plug'n'Play. Keep `.env` private; the planned server adapter will use `MODEL_API_KEY`.

## Checks

```sh
yarn check      # format:check, lint, typecheck, unit tests
yarn build
yarn playwright install chromium
yarn test:e2e
```

Browser tests start the production build on port 3100. Build first. Unit tests cover rhythm, commands, validation, stale writes, idempotency, undo/redo, engraving and playback plans. Browser tests exercise actual editing, dragging, persistence and recovery.

## Editing

Select anything on the sheet and act on it; press Delete to remove it, Escape to deselect.

- **Notes:** click a note or rest. Type A–G to enter that note (in the key, nearest the previous one), ↑/↓ to step it, Delete to turn it into a rest. The strip under it sets the duration. Right-click for accidentals and articulations. Drag vertically for pitch, horizontally to reorder.
- **Bars:** click empty space in a bar (or its number) to select it; Delete removes it. Right-click for insert, duplicate, clear and a tempo change. Drag a barline to widen a bar.
- **Toolbar:** time signature, key, Chord, ƒ, Text, Marks and + Bar act on the selected note or bar. In Chord, type a symbol and press Enter: the cursor moves to the next bar, so `C ⏎ Am7 ⏎ Dm7 ⏎ G7 ⏎` writes a progression.
- **Chords, text, marks, sections, repeat signs:** click to select, Delete to remove, double-click a chord, text or section to edit it, drag text to move it.

Cmd/Ctrl+Z undoes, Cmd/Ctrl+Shift+Z redoes. Local edits save on this device.

## Architecture

See [the documentation index](docs/README.md), [system design](docs/architecture/system-design.md), [delivery gates](docs/planning/delivery-plan.md) and [code conventions](docs/architecture/code-conventions.md). The domain contains no React, Next.js, audio SDK or model SDK dependencies. UI and future AI tools call typed score operations; SVG geometry is derived state.
