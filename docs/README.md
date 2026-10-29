# Amanuensis AI — product and architecture

Planning baseline: 26 October 2026. These documents describe the proposed product and architecture, not a claim that every capability is implemented. See the [repository README](../README.md) for the current implementation and checks.

Start with the [product brief](product/product-brief.md), then the [architecture](architecture/system-design.md) and [delivery gates](planning/delivery-plan.md).

| Document | Purpose |
| --- | --- |
| [Product brief](product/product-brief.md) | Problem, audience, promise, first release, success criteria |
| [Experience brief](product/experience-brief.md) | Voice-first workspace, musical intent cards, editing, motion |
| [System design](architecture/system-design.md) | Engines, deployment boundaries, domain folders, data ownership |
| [Implemented score engine](architecture/implemented-score-engine.md) | Current commands, meters, indications, repeats, AI tools and limits |
| [Code conventions](architecture/code-conventions.md) | Module layers, imports, components vs hooks, enforced checks |
| [Score and tool contracts](architecture/score-and-tools.md) | Musical state, agent tools, edits, conflicts and undo |
| [Delivery plan](planning/delivery-plan.md) | Research spikes, implementation order, acceptance gates, unresolved choices |
| [Triplets plan](planning/triplets-plan.md) | Triplets (3:2): representation, phases, files, tests, what is left out |
| [Instruments and voices plan](planning/instruments-voices-plan.md) | Sampled instruments, voices on a staff, several instruments, drums |
| [Models and voice research](research/models-and-voice.md) | Meta capabilities, specialist gaps and source evidence |
| [Notation research](research/notation-engine.md) | Owned engraving engine and musical correctness |
| [Melody transcription](research/melody-transcription.md) | Sung audio → notes and rhythm: model findings, pipeline, measured accuracy |
| [Instrument sounds](research/instrument-sounds.md) | Sample sources, licenses and sizes for piano, winds, guitar and drums |
| [Interaction research](research/interaction-and-motion.md) | Rive, interaction states and accessibility |

## Working decisions

- Meta first: use Meta models wherever they meet the task. Other tools are permitted for demonstrated gaps. Keep model names and capabilities in adapters, not in the musical domain.
- Build our own engraving, layout and interaction engine. Do not wrap an existing notation renderer. Reusing a standard or a licensed musical font is a separate decision from reusing a renderer.
- A versioned semantic score is authoritative. Human edits and AI edits use one command system.
- Voice is the musical input: speech, humming and singing. Text is available for instructions. Instrument recordings and finished-track transcription are outside the product.
- Proposed initial scope: one melody, short takes, one staff, clear notation and playback. Audience and scope remain founder-reviewable assumptions.
- App routes compose domain-owned screens; business rules and components live in modules.
- Rive communicates interaction state; it does not own notes, musical timing or application state.

## Repository evidence

At research time, the scaffold declared Next.js 16.4.3, React 19.3.0, TypeScript, Tailwind 4 and Yarn 4.14.1, with only starter app files. Dependencies initially used Yarn Plug'n'Play. The first implementation switches Yarn to `node_modules` because the bundled Turbopack guide explicitly excludes PnP support.

The installed Next.js guides were read through Yarn's resolver: `dist/docs/01-app/01-getting-started/02-project-structure.md`, `05-server-and-client-components.md`, and `15-route-handlers.md`. Implementation must continue consulting the installed guides as required by `AGENTS.md`.
