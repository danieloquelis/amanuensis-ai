# Assistant streaming: showing the agent's work live

How the score could show what the assistant is doing while a turn runs: a light sweeping over the staves while it thinks, and each edit appearing on the sheet as soon as it is made. Researched 30 October 2026 against `muse-spark-1.3-contributor` (the model in use) and the code as it stands. Nothing here is implemented yet.

## Why

A turn that reads an attached page takes 25 s to 7 minutes: 5–18 model steps of about 20–30 s each (see [sheet reading](sheet-reading.md), "The agent reads a page (phase 2)"). Today the musician sees one activity line in the chat ("Reading the page", "Writing the bars") and the whole score changes at once at the end.

The goal:

1. While the agent thinks, a light sweeps left to right across the staff lines and notes, like a skeleton shimmer.
2. Each edit appears on the sheet as soon as the agent makes it, animated in. Later edits replace earlier ones, also animated. No sound.
3. If possible, notes appear while the model is still producing a `score_write` call.

The editor must stay correct: the turn still becomes one undo step, or nothing on failure.

## Meta Model API: what streams

From the docs ([Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions), [schemas](https://dev.meta.ai/docs/api-reference/chat-completions/schemas), [tool calling](https://dev.meta.ai/docs/tool-calling), [reasoning](https://dev.meta.ai/docs/reasoning)):

| Question | Documented answer |
| --- | --- |
| `stream: true`? | Yes, server-sent events. Lines `data: {chunk}`, ending with `data: [DONE]`. Each chunk has `choices[0].delta`. |
| Tool calls streamed? | Yes. "Accumulate `tool_calls` deltas across chunks by `index`." Only `index` is required in a delta; `id`, `function.name` and `function.arguments` come in pieces. The Responses API sends `response.function_call_arguments.delta` / `.done`. |
| Reasoning ("thinking") streamed? | No. Raw reasoning "is not emitted as stream events". The chunk schema lists `delta.reasoning_content`, but the reasoning guide says it is not returned. The Responses API (not Chat Completions) can stream a short reasoning **summary** (`reasoning: { summary: "auto" }`). |
| `reasoning_effort` with streaming? | Yes, same parameter. The docs warn of "an initial latency before the first visible content chunk in streaming mode". |
| Usage in a stream? | `stream_options: { include_usage: true }`; `usage` comes on the final chunk, with `completion_tokens_details.reasoning_tokens` and `prompt_tokens_details.cached_tokens`. An interrupted stream may omit it. |
| Timeouts | Long non-streaming requests can return HTTP 504; "streaming requests are exempt". |

### What we measured

Three small real requests (about 600 tokens in, 900–1,600 out each), scripts kept outside the repository. A one-tool system prompt and a `score_write`-like tool (`requestId`, `text`), effort low, `parallel_tool_calls: false`.

| Probe | Response headers | First visible output | Tool call opens | Arguments complete | Done | Tokens in / out (reasoning) |
| --- | --- | --- | --- | --- | --- | --- |
| Chat Completions, 4 bars | 1.5 s | 9.1 s (reply text) | 9.1 s | 9.9 s | 9.9 s | 608 / 904 (749) |
| Chat Completions, 16 bars | 1.6 s | 12.7 s (reply text) | 12.8 s | 14.8 s | 14.9 s | 622 / 1,616 (1,198) |
| Responses API, 8 bars, summary on | 1.2 s | 3.5 s (summary), 10.8 s (reply text) | 10.8 s | 11.8 s | 11.9 s | 619 / 1,179 (931) |

Findings:

- **Streaming works** with `muse-spark-1.3-contributor`, for both Chat Completions and the Responses API.
- **Nothing arrives while the model reasons** on Chat Completions: no chunks, no keep-alive comments, no `reasoning_content` (0 characters in both runs). The first chunk carried the reply's whole text at once ("Writing your C major scale — up and down…").
- **Tool arguments come one JSON value at a time, not token by token.** Each call came as three pieces: the call's `id` and `name` with empty arguments, then `{"requestId":"…"`, then `,"text":"…"}` holding **all** the bars at once (16 bars in one chunk, about 2 s after the call opened). The Responses API behaved the same: two argument deltas, 29 characters and then the whole text.
- **The reasoning summary does stream** on the Responses API: two one-sentence parts at 3.5 s and 7.3 s ("Composing an 8-bar G major 3/4 melody…"), several seconds before any other output.
- **Usage** came on the chunk with `finish_reason: "tool_calls"`, including reasoning and cached tokens. Token counts are the same as without streaming; streaming does not change cost.

So goal 3 (notes appearing while a `score_write` is being produced) is **not possible with this API as it behaves today**: the bars arrive in one piece at the end of the call. These were short probes; a longer call might be flushed in more pieces, and this is worth checking again when Meta updates the model.

## How a turn runs today

- `runAssistant` (`modules/assistant/application/run-assistant.ts`) keeps a server-side `Session` copy of the score. Each tool call that writes (`score_edit`, `score_write`, a transcription) is executed against it, and the committed `Command` is pushed onto `commands`; `score_undo` pops it.
- Progress already streams: `progressResponse` (`infrastructure/progress-stream.ts`) writes NDJSON lines `{type: "progress", event}` and a final `{type: "result"}`. `ProgressEvent` is `hearing | heard | thinking | tool`. The client (`infrastructure/assistant-client.ts`) passes each event to `useAssistant`, which shows it as the turn's activity line.
- At the end, `useAssistant` calls `editor.applyCommands(result.commands)`, which runs `executeAll` against the editor's session: one undo step, all or nothing.
- IDs are deterministic: `applyCommand` gives each operation the prefix `<requestId>-<index>`, so replaying the same commands on the same score gives the same note IDs as the server session had.

**Editing during a turn today:** the sheet stays fully interactive while the agent works (`interactive={ready}`). Any change the musician makes (a note, a title, an undo) moves the revision. At the end, the first command's `expectedRevision` no longer matches, `executeAll` throws, and the turn is marked failed ("The score changed while I was working. Try again.") after possibly minutes of work. There is no way to stop a running turn: no `AbortController` on the client, and the route does not watch `request.signal`.

## Proposed event protocol

One new progress event:

```ts
/** The turn's committed commands changed: keep the first `keep`, then append `add`. */
| { stage: "edits"; keep: number; add: Command[] }
```

- A commit sends `{ keep: n, add: [command] }`; `score_undo` sends `{ keep: n - 1, add: [] }`. The client's list always equals the server's `commands`, so the final result holds no surprises.
- Commands, not scores: they are small (a `score_write` of 16 one-part bars is about 7 KB of JSON), they are already validated, and the client can rebuild the exact score with the same code that commits it at the end.
- It is not the model's text, so it fits `ProgressEvent`'s rule ("never the model's text").
- `Turn.activity` should not hold it: the activity line keeps showing `thinking`/`tool`, and saved chats drop activity anyway.

Phase 2 events, only if wanted:

| Event | Source | Use |
| --- | --- | --- |
| `{ stage: "reply"; text }` | Reply text streamed before a tool call | A real activity line ("Writing your 16 bars") instead of a rotating phrase |
| `{ stage: "summary"; text }` | Responses API reasoning summary | Feedback in the first 3–4 s; it is model text, so this is a product decision |
| `{ stage: "draft"; text }` | Partial `score_write` arguments | Only if Meta starts streaming argument tokens (see above) |

## Server changes

**Phase 1 (no model streaming needed):**

- `application/run-assistant.ts`: after each tool call, if `commands` changed, emit `edits`. The file is at 194 lines; move the commit bookkeeping into a new `application/edit-feed.ts` (tracks what was sent, returns the `keep`/`add` event) so the loop stays readable.
- `ProgressEvent` gains `edits` (and imports `Command` from `@/modules/score`).
- `progress-stream.ts`, the routes and `assistant-client.ts` need no change: they pass any progress event through.
- The voice route gets the same events for free, since transcriptions commit through the same `commands` list.

**Phase 2 (streaming adapter):**

- `application/model-port.ts`: add an optional listener, keeping the wire format out of the application layer:

  ```ts
  export type ModelDelta =
    | { kind: "text"; text: string }
    | { kind: "toolStarted"; name: string }
    | { kind: "toolArguments"; name: string; partial: string }
    | { kind: "summary"; text: string };
  complete(messages, tools, onDelta?: (delta: ModelDelta) => void): Promise<ModelReply>;
  ```

  The promise still resolves with the whole `ModelReply`, so `runAssistant` and the scripted fakes in tests keep working; fakes ignore `onDelta`.
- `infrastructure/meta-model.ts`: send `stream: true` and `stream_options: { include_usage: true }`; read the SSE lines in a new `infrastructure/sse-lines.ts`; accumulate `tool_calls` by `index`; map chunks to `ModelDelta`. Replace the fixed three-minute timeout with an idle timeout that resets on each chunk, since streams are exempt from the provider's 504. Note that Chat Completions sends nothing while the model reasons, so the idle limit must still allow a long think.
- Reasoning summaries need the Responses API (`/v1/responses`, `input` instead of `messages`, `reasoning.effort`, `function_call` / `function_call_output` items). That is a second adapter, `infrastructure/meta-responses-model.ts`, behind the same `ModelPort`; the rest of the assistant does not change.
- Stopping a turn: thread `request.signal` from the route into `runAssistant` and the model `fetch`, and stop the loop between steps when it aborts.

## Client and editor changes

**Show a preview layer; don't apply and roll back.** Applying each command to the editor's session and undoing on failure would fill the undo history, save half-finished scores to local storage on every step (`persist`) and stop playback each time (`onBeforeEdit`). Instead, the sheet draws a score derived from the session and the turn's commands so far; the session itself is not touched until the end. This is the "temporary score branch, clearly labelled" that [score and tools](../architecture/score-and-tools.md) asks for, and it is how drag previews already work (`applyGesturePreview` feeds `layoutScore` in `ScoreSurface`).

| Piece | Where | What |
| --- | --- | --- |
| Live commands | `modules/assistant/ui/hooks/use-live-turn.ts` (new; `use-assistant.ts` is at its size limit) | Applies `edits` events to a `Command[]`; exposes `live: { commands, thinking } \| null`; cleared when the turn ends |
| Preview score | `modules/editor/application/turn-preview.ts` (new, pure) | `turnPreview(session, commands): Score \| null`: `executeAll` on the current session; `null` if it no longer applies |
| What arrived | same file | `arrivals(before, after): { added: Set<string>; changed: Set<string> }` by event ID: new IDs, and IDs whose pitch or length changed |
| Hook | `modules/editor/ui/hooks/use-turn-preview.ts` (new) | Memoizes the preview and the arrivals since the last preview shown |
| Wiring | `modules/workspace/ui/components/WorkspaceScreen.tsx`, `ScoreCanvas.tsx` | Passes `assistant.live` to the editor; the canvas draws the preview score (bar count and footer too) |
| Sheet | `modules/editor/ui/components/surface/ScoreSurface.tsx`, `SheetSystem.tsx`, `SheetEvent.tsx` | New props `arriving` (IDs and kind) and `working` (shimmer); `interactive` is false during a preview |

**At the end of the turn** nothing changes: `applyCommands(result.commands)` commits the same commands as one undo step. Because IDs are deterministic, the committed score is identical to the last preview, so nothing flashes or animates again. On failure or a network error the preview is dropped and the sheet returns to the session's score.

**Editing during a turn.** Three options:

| Option | Behaviour | Cost |
| --- | --- | --- |
| A. Read-only sheet while a turn previews, with Stop | No conflicts; Stop keeps what is already on the sheet as one undo step (`applyCommands(live.commands)`), which matches "what I changed so far is applied" | Needs a Stop button and abort wiring; blocks edits for minutes |
| B. Keep editing; drop the preview on conflict | Today's behaviour plus a preview; the turn still fails at the end | Wastes the turn, as today |
| C. Rebase the turn's commands onto the musician's edits | Both kinds of change survive | Commands carry revisions and may target removed notes; needs revalidation rules. Not now |

Recommended: **A**. Selection, the selection card, the toolbar and undo/redo shortcuts are disabled while previewing; playback still plays the committed score. With the "act, don't ask" rule, Stop keeps the partial work and Undo removes it.

## Animation

Existing tokens in `app/globals.css`: `--ease-out`, `--ease-in-out`, `--ease-spring` (a slight overshoot), `--fast` 160 ms, `--medium` 260 ms. A global `prefers-reduced-motion` rule sets `animation: none` and `transition: none` everywhere.

**Notes popping in.** Each event is a `<g>` in `SheetEvent` keyed by its ID, with absolute coordinates and no transform of its own, so a CSS transform on it is free:

```css
.arriving {
  transform-box: fill-box;
  transform-origin: center;
  animation: note-in var(--medium) var(--ease-spring) both;
  animation-delay: var(--arrive-delay, 0ms);
}
@keyframes note-in {
  from { opacity: 0; transform: scale(0.6); }
}
```

- The class must come from `arrivals`, not from mounting: `SheetSystem` is keyed by its first bar, so a line break that moves remounts a whole system, and a mount-based animation would pop every note in it again.
- A rewrite by a later `score_write` gives new IDs (they come from its `requestId`), so the replacement pops in as new. An edit that keeps the ID (`setPitch`) gets a smaller "changed" pulse.
- **Stagger by place:** a 16-bar write arrives in one piece, but setting `--arrive-delay` from each note's order on the page (about 20 ms per note, capped near 1.2 s) makes it look written left to right. This is the realistic stand-in for goal 3.
- Beams, ties and slurs are drawn outside the event `<g>` (`BeamLines` keys beams by coordinates), so they appear at once; give the system's beams a short opacity fade when any of its notes arrive.
- Removed notes disappear at once in phase 1. A fade-out needs the previous scene's events drawn as a non-interactive ghost layer for one animation; later, if wanted.
- No sound: the preview does not change the selection, so `useNoteAudition` does not fire, and nothing calls `onBeforeEdit`.

**The thinking shimmer.** A band of light that passes over the ink only: a pseudo-element over the sheet with `mix-blend-mode: lighten`. On the near-white paper (#fffef9) "lighten" keeps the paper as it is and turns the dark ink (#343a37) sage where the band passes, so staff lines and notes glow in turn.

```css
.sheet { position: relative; overflow: clip; }
.working::after {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 35%;
  background: linear-gradient(90deg, transparent, rgb(143 208 160 / 85%), transparent);
  mix-blend-mode: lighten;
  pointer-events: none;
  animation: sweep 2.2s var(--ease-in-out) infinite;
}
@keyframes sweep {
  from { transform: translateX(-100%); }
  to { transform: translateX(300%); }
}
```

- It animates `transform` only, so it stays smooth on a large sheet.
- **Reduced motion:** with the global rule the band would sit still over the first third of the sheet. It needs its own rule: hide the band and dim the ink slightly instead (a static "working" state), with the chat's activity line as the text status.
- Hide it in `@media print`. Show it from the first `thinking` event to the end of the turn; arrivals play on top of it.

**Re-layout as bars arrive.** `layoutScore` is pure and recomputed per preview, so these shifts are real:

| Shift | Effect | Softening |
| --- | --- | --- |
| Bars fill with notes | Bar widths change; notes already drawn in the same system jump sideways | Phase 1: accept, the pop-ins draw the eye. Later: glide moved notes using the previous and next scene's `x`/`y` per ID (Web Animations on the event `<g>`, 200 ms `--ease-out`); no DOM measuring needed |
| Bars are added | Line breaks move, systems remount | Arrivals are diff-based, so nothing re-pops. When the agent sets up the bar count before writing (as it often does on a page), systems settle early |
| Page grows | The paper gets taller | It grows downward only; don't scroll the sheet for the musician |

React 19.3's `<ViewTransition>` could cross-fade the sheet, but it captures elements as images, and named transitions on elements inside an `<svg>` are not expected to work (to be confirmed), so it cannot move single notes.

## Cost and latency

| | Today | Phase 1 | Phase 2 |
| --- | --- | --- | --- |
| Anything on the sheet moves | End of turn (25 s – 7 min) | Shimmer at once | Same |
| First score change | End of turn | After step 2 (the set-up edit: in the latest page eval, 9 pages, the first committed edit was always the 2nd tool call) | Same |
| First notes | End of turn | After step 3, roughly 40–90 s on a long page (steps average 20–30 s) | Same |
| First words about what it is doing | Rotating phrases | Same | Reply text a second or two before each tool runs; summaries after about 3 s with the Responses API |
| Tokens and steps | — | Unchanged | Unchanged |

Do not make the agent write fewer bars per call for the sake of the animation: each extra step resends the page images (135k–570k input tokens per page, mostly cached).

## Risks and open questions

- **Wrong notes on display.** The musician sees drafts the agent will rewrite after `page_check`. This is what the owner asked for; the shimmer must make it obvious the turn is not finished.
- **Read-only sheet for minutes** (option A). Needs a visible Stop. Is "Stop keeps what is written" right, or should Stop discard?
- **Showing reasoning summaries** breaks the current rule that the activity line never shows the model's text. Product decision.
- **Argument streaming may change.** Re-run the probe on new model versions; the `ModelDelta` shape is ready for a `draft` event if arguments start arriving in pieces (parse whole `bar …` lines from the partial `text`, write them with `writeBars` against the session score, and show them as a draft layer that the committed command replaces).
- **A client that drops mid-turn.** Today the server runs to the end; with `request.signal` it can stop. Either way the editor commits nothing, as now.
- **Large multi-part scores.** `executeAll` plus `layoutScore` per `edits` event is the same work as one edit today, at most once per model step. No concern expected.

## Writing bars as streamed text

Tool-call arguments arrive whole, but the reply's own text streams token by token. Chat apps render code blocks and artifacts that way: they parse markers in the text as it arrives. The agent could write bars the same way, between `<score>` and `</score>` in its reply, with the server parsing each finished `bar …` line as it streams, sending it as a `draft` event, and committing the block (as `score_write`) when it closes.

Measured 30 October 2026, `muse-spark-1.3-contributor`, effort low, Chat Completions with `stream: true`, asked for 8 bars between `<score>` tags:

| | Time |
| --- | --- |
| First text (silent reasoning before it) | 9.4 s |
| The 8 bars, in 19 text chunks of a few tokens each | 0.8 s |

- **Text streams finely**: about one chunk every 40 ms, so bars could appear one by one.
- **But writing is the fast part.** A step spends seconds to tens of seconds reasoning, unseen, then writes its bars in about a second. The minutes of a long turn come from the number of steps. Live edits per step (plan step 1) are the main gain; bars drawn from streamed text make each writing step feel live, a smaller gain on top.
- **The model prefers a tool when one is offered.** In the same request with a tool available, it called the tool instead of writing text; `tool_choice: "none"` is refused (400). Writing in `<score>` blocks must be the prompt's normal way to write, measured with `yarn eval:sheet-agent` before it replaces `score_write`.
- **Checking comes later.** A bar is validated only when its block closes (or line by line as a draft), so a wrong bar may show briefly before it is corrected. The owner has said that is fine while the turn is visibly unfinished.

## Plan

1. **Shimmer and live edits.** `edits` event and `edit-feed.ts`; `use-live-turn.ts`; `turn-preview.ts` (`turnPreview`, `arrivals`) with unit tests; `use-turn-preview.ts`; sheet `working` and `arriving` props and CSS, staggered pop-in, reduced-motion and print rules; read-only sheet while previewing. No model streaming.
2. **Stop.** `AbortController` in `assistant-client.ts`, a Stop control in the compose bar, `request.signal` into `runAssistant`; Stop commits the commands shown so far as one undo step.
3. **Streaming adapter.** `ModelDelta`, SSE reading in `meta-model.ts`, idle timeout, `reply` event for the activity line. Optionally a Responses API adapter for reasoning summaries.
4. **Bars drawn as they are written.** The agent writes bars in `<score>` blocks in its streamed reply; finished lines become `draft` events drawn as they arrive; the closed block is committed like `score_write`. Measure with the agent eval before switching.
5. **Finer motion, if still wanted.** Glide for moved notes from scene coordinates and fade-out of removed notes.

Tests per [test scope](../architecture/code-conventions.md#tests): unit tests for `edit-feed` (commit and undo produce the right `keep`/`add`), `turnPreview` (equals the final commit; `null` after a conflicting edit) and `arrivals`; one end-to-end check that a scripted turn shows notes before it finishes and leaves one undo step.
