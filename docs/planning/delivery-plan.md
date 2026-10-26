# Delivery plan and decision gates

Planning is the current task. No application implementation or dependency installation is included in this pass. Work below is ordered by dependency, not calendar estimates.

## Decisions proposed now

| Decision | Rationale | Revisit when |
| --- | --- | --- |
| Meta-first reasoning and speech adapters | Matches product direction while allowing specialist gaps | Account tests or held-out musical evaluation fail |
| Owned SVG engraving engine | Direct control over layout, interaction and visual identity | Measured document scale demands another surface |
| Shared semantic commands for AI and human | Reliable context, undo and conflict handling | Multi-user collaboration becomes a requirement |
| Short monophonic takes and bounded notation | Achievable quality baseline | Correction burden and engraving fixtures pass |
| Modular monolith plus optional audio worker | Keeps domain boundaries without early service sprawl | Measured workload or deployment constraints require separation |
| Rive as presentation adapter | Rich motion without coupling musical correctness to animation | No expected reason to change state ownership |
| Explicit recording sessions, playback stops on record/edit | Avoids self-capture and mixed score revisions | Echo handling/live rescheduling are separately evaluated |

## Gate 0 — feasibility and product alignment

Confirm the first audience, single-melody scope, supported notation and voice retention policy. Confirm whether licensed SMuFL fonts satisfy the requirement to build our own renderer; recommend yes. A neutral reference timbre is enough for the first slice; a piano sound requires a licensed synthesis/sample choice.

Verify actual Meta account access with a minimal text tool loop and a short file transcription. Test realtime ASR separately. Record model versions, entitlement/region limits, data settings, timings and failure behavior. No API credentials were requested or used during this research.

Create a small consented corpus spanning speech, humming, lyrics, mixed turns, vibrato, repeated notes and unsupported backing tracks. Compare activity classification, pitch extraction and note segmentation candidates. Run a cleanup ablation before selecting SAM Audio deployment. If the Meta path fails a required capability, document the failure and evaluate a specialist adapter; do not silently change the product's provider policy.

Exit: an evidence-backed model/component matrix, initial correction-burden baseline, legal access to required models/assets and a concrete first vertical-slice specification. If rhythm ambiguity is high, keep count-in or explicit tempo/meter in the initial workflow instead of claiming unrestricted transcription.

## Gate 1 — deterministic music foundation

Implement the score document, rational timing, validation, transaction journal and idempotency. Feed a hand-authored phrase into our SVG engraver. Support one staff, fixed 4/4, basic notes/rests, pitch editing, playback, undo and save/reopen before connecting AI.

Exit: consistent rendering/playback from the same revision; exact measure arithmetic; stable IDs after save and re-layout; undo does not erase unrelated work; clear print output; keyboard and pointer edits share commands. Musician review covers readability, beams, accidentals and spacing. This is the first architectural proof, not a static UI mockup.

## Gate 2 — typed agent operations

Connect Muse Spark to the bounded tool registry using typed instructions and synthetic evidence. Add concise action cards, selection resolution, previews, and cancellation. Delay a tool result deliberately while manually editing the score.

Exit: the stale commit is rejected; retries do not duplicate notes; unsupported notation yields a musical explanation; cross-project targets are rejected; a user correction survives later unrelated AI work. No command is executed solely because it appears inside an annotation or quoted lyric.

## Gate 3 — voice-to-score slice

Add explicit microphone sessions, original sample-clock tracking, speech/singing/uncertain spans, Meta ASR, specialist pitch/onset evidence and quantization candidates. Support relabeling without recording again. Integrate the end-to-end capture, preview, audition, correction and apply workflow.

Exit: benchmark clean melody and mixed speech/singing separately; report false command execution, note errors, correction burden, latency and cost. Repeated notes, octave errors, sung lyrics and unclear meter must have tested behavior. No provider- or model-specific response leaks into the score schema.

## Gate 4 — useful musical scope and presentation

Expand to the product brief's simple meters, keys, dots, ties, sixteenths, slurs, dynamics and anchored annotations. Add owned visual identity, Rive assets and reduced-motion fallbacks. Add bounded MusicXML export after native persistence and print. Ordinary triplets are a subsequent explicit scope increment; until supported, identify those candidates as unsupported rather than forcing them to straight notes.

Exit: notation fixture suite reviewed by musicians; printable output; failures in Rive leave recording/editing intact; save recovery and provider outage behavior work; manual edits reach agent context; supported exported semantics validate. Compound meter and broader tuplets mentioned in research remain later options.

## Gate 5 — pilot

Run the product brief's tasks with five to eight musicians, using the same known phrase for assisted and manual entry. Include different singing skill levels and a keyboard-only pass. Use results diagnostically; a small pilot is not a population-level accuracy claim.

Exit: publish measured results against proposed targets, review the main failure classes, and revise scope before broader access. Do not announce real-time, arbitrary-notation or professional engraving support without corresponding evidence.

## Highest risks

| Risk | Evidence or mitigation |
| --- | --- |
| Free singing does not uniquely determine notation | Preserve timing evidence and alternatives; ask about beat/meter, offer count-in |
| Acoustic speech is mistaken for command intent | Separate acoustic and intent labels; include sung-lyric negative tests |
| Custom engraving grows into a multi-year editor | Bound notation support and maintain capability matrix and fixtures |
| Model access or advertised audio ability differs in practice | Actual account smoke tests and version-specific evaluations |
| Manual changes disappear under late AI output | Atomic expected-revision checks, invalidated previews, idempotency |
| Cleanup damages pitch/onset evidence | Compare original and separated takes before adding SAM to the path |
| Visual polish hides invalid musical data | Semantic invariants and listening review before animation work |
| Voice retention exceeds user expectations | Explicit policy, limited retry window, deletion paths and provider checks |

## Still open

Founder choices: first audience; acceptable initial musical scope; default preview behavior; font ownership preference; launch languages; raw-take retention; hosting/data region and budget. Proposed defaults are documented so architecture can progress without treating them as settled user decisions.

Empirical choices: exact pitch/onset/classification components; achievable latency and cost; minimum supported browsers/devices; model version pins; whether SAM improves noisy voice; reference sound asset. These require prototypes and measurement, not an architectural vote.

No implementation should begin by building a polished generic chat shell. Begin with a real musical document rendered by our engine and edited through shared commands, then connect Meta tools and vocal evidence.
