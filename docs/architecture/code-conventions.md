# Code conventions

How code is organized in this repository. These rules apply to people and coding agents alike. The import and layering rules are enforced by ESLint (`eslint.config.mjs`), formatting by Prettier. Run `yarn check` before you commit.

## Modules

Each domain capability lives in `modules/<name>/`: `score`, `engraving`, `editor`, `playback`, `projects`, `assistant`, `voice`, `page`, `workspace`. `app/` routes only render a screen from a module. `shared/` holds domain-free UI helpers and never imports from `modules/`.

A module is split into layers. Add a layer only when the module needs it:

```text
modules/<name>/
  domain/          pure rules and types: no React, no Next.js, no browser APIs
  application/     use cases and ports, built on domain; still framework-free
  infrastructure/  adapters to the outside world (localStorage, Web Audio, files, model APIs)
  server.ts        server-only API (adapters holding secrets); imported by app/ route handlers only
  ui/
    components/    React components, one per file, PascalCase.tsx, with colocated *.module.css
    hooks/         React hooks, use-kebab-case.ts
    index.ts       public React API
  index.ts         public framework-free API
```

Dependencies point inward: `ui → application → domain`. `infrastructure` implements ports that `application` declares (for example `ProjectRepository`). `domain` imports nothing from the other layers.

| Code | Goes in | Example |
| --- | --- | --- |
| A musical rule, invariant or calculation | `domain/` | `score/domain/rhythm.ts` `measureCapacity` |
| A score mutation | `score/domain/operations/`: a handler plus a schema entry | `setDuration` in `event-operations.ts` |
| Logic a UI needs but that has no React in it (what to select after an edit, what operation a button builds) | `<module>/application/` | `editor/application/selection.ts` |
| State, effects or event wiring for React | `ui/hooks/` | `editor/ui/hooks/use-sheet-gestures.ts` |
| Markup | `ui/components/` | `editor/ui/components/surface/SheetEvent.tsx` |
| Browser or network API calls | `infrastructure/` | `playback/infrastructure/audio-player.ts` |
| Generic UI with no musical meaning | `shared/ui/` | `shared/ui/hooks/use-dismissable-layer.ts` |

## Imports

- **Across modules**, import only from the public entrypoints: `@/modules/<name>`, `@/modules/<name>/ui`, or `@/modules/<name>/server` (route handlers only; ESLint forbids it in UI code). Never reach into another module's folders. To use something that isn't exported, export it deliberately from that module's `index.ts`.
- **Within a module**, use relative imports (`../domain/schema`).
- The two entrypoints are split on purpose. Tests, server code and other domain code can import `@/modules/<name>` without loading React or CSS.
- `index.ts` files list their exports explicitly. Avoid `export *`, so the public API is a decision rather than an accident.

## Components and hooks

- A component renders. When a component starts to own logic, move it out:
  - **Musical or editing decisions** go into a pure function in `application/` (or `domain/`) that tests can call directly.
  - **Stateful React logic** (refs, effects, listeners, multi-step interactions) goes into a hook in `ui/hooks/`.
- One exported component per file. Small private subcomponents in the same file are fine.
- Name event props `onX` and handlers inside a component as verbs (`selectBar`, `openBarMenu`).
- Group props for many interactive children into one object rather than threading ten callbacks, for example `SheetInteractions` in `editor/ui/components/surface/sheet-interactions.ts`.
- `"use client"` goes only on the screen components that `app/` routes render (currently `HomeScreen` and `WorkspaceRoute`). Everything they import is already client code (see `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`).
- Engraving UI components are stateless SVG glyphs. They accept extra SVG props (`role`, handlers, `className`) on their root element so the editor can make them interactive without the engraving module knowing about editing.
- Where something is drawn (which staves get barlines, where marks sit) is decided once in `engraving/domain` (`bar-furniture.ts`), and both the editable sheet and the read-only `StaticSystem` use it. A read-only view of a score renders `StaticSystem`; it never copies the sheet's drawing code.

## AI-first

The editor is one client of the engine; agents are another, with equal power.

- **New capability, new operation.** Add a typed operation, with `.describe()` on the variant and on any non-obvious field. The descriptions reach the model through the generated tool schema; `tests/unit/agent-tools.test.ts` checks that they do.
- **Defaults live in the domain.** Behaviour such as "keep note values if they fit, otherwise fit proportionally" (`setMeter` with `policy: "auto"`) or "apply until the next time-signature change" (`extend`) belongs in the operation, not in a UI helper. UI helpers in `editor/application` may only choose which operation to send.
- **Prompt rules need a test.** The system prompt states the tools' contract and product decisions; musical knowledge is the model's own. Add a rule only with a case in `scripts/lib/prompt-rule-cases.mts` that fails without it, and prefer saying a fact once, in the tool description it belongs to (see `docs/research/prompt-rules-eval.md`).
- **Readable for agents.** `describeScore` (score module) is the agent's view: bar numbers, beats from 1, pitch and duration names, chord symbols, IDs. Extend it when you add data.
- **The song, not the songbook.** The agent works on the open song. Creating, opening, listing and removing songs (`workspace`, `projects`) is app navigation and deliberately not an agent tool. Adding it later means a new kind of turn result that the browser acts on, not a score operation.
- **Musician's model in the UI.** Palettes add; they never toggle. Anything on the sheet is selected by clicking and removed with Delete.

## Score changes

- Every change to a score, whether from a person or the AI, is an `Operation` applied through `applyCommand`/`execute` with an expected revision. UI code never edits a `Score` object directly.
- To add an operation:
  1. Add its schema to `score/domain/operations/schema.ts`.
  2. Write a handler `(draft, op, { idPrefix }) => void` in the matching `*-operations.ts` file.
  3. Register it in `apply-command.ts`. TypeScript fails if a type has no handler.
  4. Add a unit test.
- Read and write a bar's events and display style only through `score/domain/voice-access.ts` (`barEvents`, `setBarEvents`, `putVoiceBar`, `voiceBars`, `barStyle`, `setBarStyle`, `voiceLine`, `everyEvent`, …), so a bar can hold several voices. ESLint rejects `measure.voices`, `measure.events` and `measure.style` elsewhere in `modules/` (migrations aside). Time arithmetic uses `soundingBeats` / `eventOnsets`, never the written `event.duration` directly. Ask `isNote(event)` / `isRest(event)` rather than testing `event.pitch` when the question is "is this a note?".
- Handlers mutate the cloned draft they are given. `applyCommand` clones, checks the revision, and re-validates the whole score afterwards.
- Validate before showing a preview with `checkOperation` (`@/modules/editor`) rather than calling `applyCommand` in a `try` block in a component.

## Style

- Prettier formats everything (`yarn format`). Don't hand-format or collapse code onto long lines.
- Files stay under 200 lines (enforced by ESLint). Split by responsibility when you get close.
- Name numbers that carry meaning (`STEM_LENGTH`, `MEASURE_WIDTH.max`). Shared limits live with the score schema (`TEMPO_RANGE`, `MEASURE_WIDTH`, `SCORE_LIMITS`).
- Comments explain *why* or state a contract. A short doc comment on each exported function is expected when its name doesn't say everything.
- CSS: one CSS module per component folder; target elements by class, never by `aria-label`. Group the `@media print` rules at the end of a file, unless cascade order requires otherwise (see the note in `workspace.module.css`).

## Tests

- Unit tests (`tests/unit`, `node:test` via `tsx`) import only public entrypoints such as `@/modules/score`. They cover domain and application code.
- Browser tests (`tests/e2e`, Playwright) drive the built app through accessible roles and labels. Changing an `aria-label` is a behaviour change.
- Engraving changes: add or extend a fixture in `tests/fixtures/engraving/`, assert layout invariants in `tests/unit/engraving.test.ts`, and check the screenshot diffs from `tests/e2e/engraving.spec.ts`. Refresh baselines (`yarn test:e2e engraving --update-snapshots`) only after looking at the new rendering.

## Checks

```sh
yarn check      # format:check + lint + typecheck + unit tests
yarn build && yarn test:e2e
```
