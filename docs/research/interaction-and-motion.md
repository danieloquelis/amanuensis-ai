# Interaction and motion research

Research date: 2026-10-26. Product recommendations below are proposals, not measured user findings. This document changes no application code.

## Product posture

Amanuensis is a musical workspace with an assistant. The score is the primary artifact; a conversation is a history of musical instructions, recorded phrases, clarifications, and score changes. The assistant shows concise action summaries and evidence the musician can inspect, rather than lengthy conversational responses or hidden reasoning traces.

Proposed first audience: composers, songwriters, and music students who can describe musical intent and sing a single melody but find notation entry disruptive. Validate this audience before expanding into beginners who need music teaching or professional orchestral engraving.

Voice-only audio input means unaccompanied human speech, singing, and humming. Typed instructions remain supported. It does not mean users must operate every control with their voice. Recordings of instruments, backing tracks, and complete songs are outside the initial product contract; detection is imperfect, so communicate unsupported input without claiming certainty about its source.

## Workspace

| Area | Contents | Interaction contract |
| --- | --- | --- |
| Left assistant panel | Record control, text composer, timestamped voice clips, compact action cards, questions | Each action refers to a score range or selection; histories retain useful context without becoming a transcript wall. |
| Right score canvas | Owned notation rendering, selection, insertion point, pending changes, annotations | Musical objects have stable identifiers. Selection is visible and available to assistant tools. |
| Score toolbar | Play/pause/stop, tempo, count-in, zoom, undo/redo | Native accessible controls; playback and document mutation are separate actions. |
| Context inspector | Pitch, duration, accidental, articulation, selected annotation | Complements dragging and allows precise keyboard editing. |
| Project header | Title, save status, current revision | Save failure remains visible; optimistic local changes are not misrepresented as persisted. |

Start with approximately one-third assistant and two-thirds score, using a resizable divider. On narrow screens, switch between score and assistant with persistent recording and transport status; do not squeeze a full desktop engraving surface into an unreadable split view. Desktop is the first editing target; narrow-screen capture and review can precede full editing.

## First complete journey

1. The user starts a recording and says: “Four-four, D minor, about eighty beats per minute. Start with this,” sings a phrase, and says, “Make the last note a half note.”
2. The recording card shows elapsed time and a clear recording label. The user ends the take explicitly. Optional live speech/singing labels remain provisional.
3. Analysis produces timestamped speech, singing, silence, and uncertain spans. The assistant extracts explicit meter/key/tempo instructions and links the sung phrase to the intended insertion point.
4. The assistant presents “Drafted 2 bars · D minor · 4/4 · 80 BPM,” with a visually distinct proposed score region. If rhythm is unresolved, it asks one concrete question: “Should the phrase start on beat 1 or as a pickup?”
5. The user can audition, accept, retry, or adjust the proposal. Playback of a proposal is explicitly labeled so it is not confused with the saved score.
6. The user drags the last note upward. This emits the same semantic editing command as a tool call and increments the document revision. The assistant context now contains the changed pitch and selected note, rather than just a screenshot or a generic “canvas changed” message.
7. The user says, “Repeat that, but make the ending softer.” The assistant resolves “that” against the active selection and current revision. If no clear selection exists, it asks which phrase. A stale proposal is recomputed or explicitly conflicted before it can apply.

A pending preview is a useful default for a newly transcribed phrase or broad transformation. A small, explicit command such as “raise the selected note a semitone” can apply immediately with undo. Do not force a confirmation dialog for every reversible edit.

## State model and concise language

Keep capture, interpretation, proposal, persistence, and playback as independent state regions. A single giant status enum cannot represent, for example, playback while a proposal is being prepared. In the first release, recording and playback are mutually exclusive to avoid recording the app's own output; starting a take stops playback with a clear state change. Hands-free interruption is later work.

| State region | Key states | Example visible copy |
| --- | --- | --- |
| Capture | idle, requesting permission, recording, stopping, unavailable | “Recording · 00:12”; “Microphone unavailable. Type an instruction or retry.” |
| Interpretation | queued, analyzing, uncertain, ready, failed, cancelled | “Finding notes and rhythm”; “Was this sung phrase a melody or note names?” |
| Proposal | none, previewing, awaiting answer, applying, applied, stale | “Change bars 3–4”; “Score changed. Updating this proposal.” |
| Persistence | saved, saving, unsaved, failed | “Saved”; “Changes kept here; save failed.” |
| Transport | stopped, playing, paused | “Playing bars 1–2”; “Paused at bar 2, beat 3.” |

An action card should contain a short outcome, affected range, at most a few relevant assumptions, and context-specific actions. “Changed 3 notes · bars 2–3” is preferable to a paragraph explaining every tool. Expandable details may show recognized words, note candidates, and executed operations. Status descriptions are observable work summaries, not chain-of-thought disclosure. Spoken assistant output is optional and off by default so it does not interrupt composition.

## Ambiguity is a first-class interaction

Automatic classification must be correctable. Let the user select a recorded span and relabel it as instruction, melody, rhythm, or ignore. “Speaking” versus “singing” is acoustic evidence; “instruction” versus “musical example” is intent. Sung solfege can be an example, lyrics can be sung text, and spoken “C, D, E” can name notes. Do not equate the two axes.

Offer Auto, Speak, and Sing capture hints as optional overrides. They constrain interpretation without creating separate disconnected workflows. Keep the original clip and segmentation references long enough to retry analysis under the project's retention policy; ask no user to re-record merely because an intent label was wrong.

Show actionable uncertainty locally: “Choose C♯ or D here” or “Straight eighths or triplets?” Do not display uncalibrated model confidence as a reassuring percentage. Mark uncertain notes with an icon or outline as well as color. Differentiate silence, an incomplete phrase, and an intentional rest; never silently fill every pause with a notated rest.

## Canvas and playback behavior

Vertical dragging proposes pitch changes with a visible pitch label. Time movement snaps to a displayed rhythmic grid; duration changes use explicit handles or the inspector. Editing cannot leave negative durations or silently discard overflowing beats. A command preview should explain when subsequent notes will shift. Undo groups one completed drag into one transaction.

Annotations must declare meaning. A crescendo, articulation, or tempo indication is musical data. A freeform comment is contextual text. A decorative mark is visual data unless explicitly assigned semantics. All three are inspectable by the agent, but only supported musical semantics affect playback. Unsupported custom instructions are shown as text rather than falsely synthesized.

Playback uses the score's timing model and an audio clock. The playhead follows that clock; animation events never schedule musical sound. A user may audition a selection or the full score, pause at the current position, and stop to return to the chosen start position. Changes during playback should initially stop and restart from a deliberate position rather than mixing two revisions unpredictably.

## Rive boundary and verified capabilities

The official React documentation supports rendering `.riv` assets through hooks, a component, or the imperative runtime; hooks expose state-machine and data-binding control. Current examples use `@rive-app/react-webgl2`, the singular `stateMachine` property, and view-model bindings. Select the renderer after a small device test; this research does not assert a package version to install. [Rive React runtime](https://rive.app/docs/runtimes/react/react)

Rive's React changelog marks `stateMachines`, `animations`, `automaticallyHandleEvents`, and `useStateMachineInput` deprecated in v4.33.0. Avoid copying older tutorials that use these APIs. Recheck the pinned runtime and asset compatibility at implementation time. [Official React changelog](https://github.com/rive-app/rive-react/blob/main/CHANGELOG.md)

Proposed use: one restrained voice indicator and brief transitions for listening, processing, a completed edit, or a question. Define a versioned asset view model containing activity, microphone level, uncertainty indication, and reduced-motion preference. The application owns these values. Rive reads them; it does not own capture state, issue model requests, mutate a score, or schedule playback.

Keep the score renderer, note hit testing, and precise playhead outside Rive. Native DOM controls remain available even if the asset, WASM, or WebGL initialization fails. Store a static fallback and document each authored asset's artboard/view-model contract. Load animation after the functional workspace, dispose runtime resources on unmount, and pause nonessential animation when the page is hidden. Throttle microphone-level presentation independently of audio analysis.

No Rive asset has been authored or purchased in this research. Asset design and runtime integration require a later implementation task.

## Accessibility requirements

Target WCAG 2.2 AA for the application and additionally support disabling nonessential interaction motion. The latter corresponds to the AAA animation criterion; it is not mislabeled as an AA requirement. Respect the operating system's reduced-motion preference and provide an in-app motion setting. Replace the animated voice indicator with a static state label and simple meter. [W3C animation guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

Automatically running decorative motion lasting more than five seconds needs a pause, stop, or hide mechanism under the conditions described by WCAG. Prefer no idle looping animation at all. [W3C pause, stop, hide guidance](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide)

Provide keyboard access for capture, transport, selection, pitch/duration changes, and undo. Expose a semantic score outline or event inspector that names bar, beat, pitch, and duration; SVG appearance alone does not establish accessibility. Keep native labels, visible focus, and text equivalents for status and uncertainty. Announce meaningful state changes without streaming every audio sample or playhead tick to assistive technology. Initiate playback through a user action and retain visible stop and volume controls. These requirements derive from the general text alternatives, keyboard, color, and audio-control provisions; this document is not a conformance certification. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## Scope and validation

First slice: one monophonic phrase, short explicit recording sessions, typed music commands, manual correction, selection-aware tools, revision-aware proposals, playback, and undo. Defer persistent ambient listening, overlapping voices, instrument audio, orchestration, fully hands-free editing, lyric engraving, and elaborate animation.

Proposed usability study: five to eight target musicians perform a known eight-note capture, change two notes, apply a spoken rhythmic instruction, recover from an intentional misclassification, and identify a stale proposal. Include trained and less-trained singers and a keyboard-only pass. This study diagnoses usability; it does not establish population-level accuracy.

Proposed acceptance targets, to calibrate after a measured baseline:

- At least 80% of study participants complete the capture-to-playback flow without facilitator intervention.
- Median correction time is lower than manually entering the same phrase in the prototype; measure both conditions.
- Every seeded stale proposal is blocked or recomputed before applying, and every completed edit is undoable.
- Every tested relabeling preserves the original take and permits re-analysis without recording again.
- Ordinary assistant result cards use at most two short sentences; necessary questions expose concrete musical choices.
- Capture acknowledgement and direct score selection feel immediate; set numerical latency budgets after instrumenting the target devices. Report analysis p50/p95 separately from network time and first-frame rendering.
- Recording, notation editing, and transport remain functional with animation disabled or failed.

Open product decisions: desired entry-level music knowledge; whether an initial phrase should require preview acceptance or auto-commit with undo; supported singing range and languages; permissible recording duration; retention of original voice clips; and the initial custom-notation vocabulary. None should be silently delegated to the language model.
