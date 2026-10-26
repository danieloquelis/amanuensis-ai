# Experience brief

## Workspace

Desktop: a resizable assistant panel on the left, approximately one third of the width, and a score workspace on the right. Keep the score visible during recording and tool activity. On narrow screens, switch between score and assistant with persistent recording/transport controls; avoid squeezing both into unreadable columns.

The left panel contains recording controls, a compact transcript, interpretation cards, clarification choices and a chronological action history. Text input is always available. Do not display private model reasoning or a stream of generic assistant prose. Show observable progress and short musical explanations: “Reading rhythm,” “Added 2 bars,” “Changed ending to D4.”

The right panel contains the score, contextual notation controls, selection inspector, zoom, play/stop, tempo and undo/redo. The document should resemble carefully drawn sheet music: intentional spacing, restrained color, stable staff geometry and clear hierarchy. Selection, uncertainty and proposals are visual overlays rather than permanent notation colors.

## Interaction examples

| Situation | User-facing result |
| --- | --- |
| Speech followed by humming | Separate chips for “Instruction” and “Melody”; timeline spans can be relabeled |
| Unclear meter | “Three beats or four?” with two audible previews where possible |
| Agent creates a phrase | Ghosted notes plus “Add 2 bars · D minor · 3/4”; Apply / Retry |
| User says “raise the selected note a semitone” | Validated edit, pitch change shown, short receipt and Undo |
| User drags a note during inference | Manual edit remains; obsolete proposal is refreshed before application |
| Missing selection for “repeat this” | “Which bar?” with selectable score targets |
| Unsupported accompaniment in input | “Record the melody with your voice alone.” |
| Provider fails | Keep the take for retry within retention policy; preserve manual score editing |

Clarifications should resolve a concrete musical ambiguity. Avoid asking users to choose internal models or technical pipeline settings.

## Recording and playback

Use explicit start/stop recording, with an optional hold-to-record gesture. Automatic segmentation operates within that session; do not make always-on listening the default. Show a persistent microphone indicator and elapsed time. Allow cancel, retry and relabeling without sending a new take unnecessarily.

In the first release, starting a recording stops score playback. This avoids transcribing the app's own sound and simplifies latency and echo handling. Make the transition clear. Offer an optional count-in/metronome before recording, and distinguish free-time performance from a take anchored to a known beat.

During playback, a moving playhead and restrained note highlighting follow the audio clock. Stop cancels queued notes and releases sounding voices. Editing during playback stops transport initially, then applies the edit; seamless live editing can follow later.

## Direct score editing

Pitch dragging snaps to staff positions with accidental/spelling controls. Moving a note in time uses beat slots, not arbitrary visual pixels. The duration inspector makes insert/replace behavior explicit; do not silently shift later music. Keyboard controls and an accessible event list provide equivalent operations to dragging.

Annotations attach to stable score IDs or ranges. A text annotation such as “breathy” is available to the agent as performer intent; it does not acquire a playback effect until the application defines one. Unsupported custom marks remain visibly present, labeled and preserved.

## Motion language

Use Rive for a small voice/listening indicator, processing transitions, and subtle completion feedback. Drive its state from the application's recording and task state. A model's uncertain classification must not become a definitive animation label.

Use the score renderer's own transient overlay for note movement, proposal fade-ins and playhead effects. Rive should not draw the staff or serve as the transport clock. A failed or missing Rive asset must leave the microphone and all controls operable.

Provide reduced-motion/static alternatives, textual status, keyboard navigation and visible focus. Do not encode uncertainty solely in color. The full technical references and current Rive API caveats are in [interaction research](../research/interaction-and-motion.md).
