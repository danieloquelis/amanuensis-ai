# Amanuensis AI — product and architecture

Planning baseline: 26 October 2026. These are proposed decisions, not implemented capabilities or measured results. This pass changes documentation only.

Start with the [product brief](product/product-brief.md), then the [architecture](architecture/system-design.md) and [delivery gates](planning/delivery-plan.md).

| Document | Purpose |
| --- | --- |
| [Product brief](product/product-brief.md) | Problem, audience, promise, first release, success criteria |
| [Experience brief](product/experience-brief.md) | Voice-first workspace, musical intent cards, editing, motion |
| [System design](architecture/system-design.md) | Engines, deployment boundaries, domain folders, data ownership |
| [Score and tool contracts](architecture/score-and-tools.md) | Musical state, agent tools, edits, conflicts and undo |
| [Delivery plan](planning/delivery-plan.md) | Research spikes, implementation order, acceptance gates, unresolved choices |
| [Models and voice research](research/models-and-voice.md) | Meta capabilities, specialist gaps and source evidence |
| [Notation research](research/notation-engine.md) | Owned engraving engine and musical correctness |
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

The scaffold declares Next.js 16.4.3, React 19.3.0, TypeScript, Tailwind 4 and Yarn 4.14.1. There are only starter app files, no application engines or persistence. Yarn Plug'n'Play resolves dependencies from a zip archive, so the absence of a physical `node_modules` directory does not mean dependencies are missing.

The installed Next.js guides were read through Yarn's resolver: `dist/docs/01-app/01-getting-started/02-project-structure.md`, `05-server-and-client-components.md`, and `15-route-handlers.md`. Implementation must continue consulting the installed guides as required by `AGENTS.md`.
