import { z } from "zod";
import type { ToolSpec } from "./model-port";
import { toolError } from "./score-tool-gateway";
import { toolParameters } from "./tool-definitions";

/** What a song's notes may hold (characters): a page of what matters, not a transcript. */
export const SONG_NOTES_LIMIT = 2000;
/** What the assistant may know about a musician at once, and each fact's length. */
export const MEMORY_LIMIT = { facts: 40, characters: 200 } as const;
const PLAN_LIMIT = { steps: 12, characters: 120 } as const;

export type PlanStep = { text: string; done: boolean };

export const PLAN_TOOL = "assistant_plan";
const NOTES_TOOL = "song_notes_write";
const REMEMBER_TOOL = "musician_remember";
const FORGET_TOOL = "musician_forget";

const planSchema = z.strictObject({
  steps: z
    .array(
      z.strictObject({
        text: z.string().trim().min(1).max(PLAN_LIMIT.characters).describe("One step, as the musician would say it."),
        done: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(PLAN_LIMIT.steps),
});
const notesSchema = z.strictObject({
  text: z.string().max(SONG_NOTES_LIMIT).describe("The whole notes, replacing the old ones."),
});
const factSchema = z.strictObject({ fact: z.string().trim().min(3).max(MEMORY_LIMIT.characters) });

export const agentToolSpecs: ToolSpec[] = [
  {
    name: PLAN_TOOL,
    description:
      "Show the musician your plan for a request with several parts (parts for a band, a whole arrangement, reading and fixing a page): the steps, each done or not. Call it first, then again as steps get done; they see it as a checklist.",
    parameters: toolParameters(planSchema),
  },
  {
    name: NOTES_TOOL,
    description:
      "Rewrite this song's notes: what you would want to know next time (key and why, tempo, form and sections, which bars came from which take, choices made and their reasons, what is still open). Keep them short; update them when something about the song is settled.",
    parameters: toolParameters(notesSchema),
  },
  {
    name: REMEMBER_TOOL,
    description:
      "Remember something about this musician that will matter in other songs: how they sing or play, how they like things written, their instruments, their band, their language. Only what they showed or told you, as one short fact.",
    parameters: toolParameters(factSchema),
  },
  {
    name: FORGET_TOOL,
    description: "Forget a fact about the musician that turned out wrong or that they asked you to drop (quote it).",
    parameters: toolParameters(factSchema),
  },
];

const AGENT_TOOLS = new Set(agentToolSpecs.map((tool) => tool.name));
export const isAgentTool = (name: string) => AGENT_TOOLS.has(name);

type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };

/**
 * What the assistant keeps beyond the score during a turn: its plan, the song's notes and what it
 * knows about the musician. Starts from what the request carried; the result returns any change,
 * for the browser to keep.
 */
export function createAgentState(songNotes = "", memory: string[] = []) {
  let plan: PlanStep[] = [];
  let notes = songNotes;
  let facts = [...memory];
  let notesChanged = false;
  let memoryChanged = false;
  const run = (name: string, raw: unknown): ToolResult => {
    try {
      return apply(name, raw);
    } catch (error) {
      return { ok: false, error: toolError(error) };
    }
  };
  const apply = (name: string, raw: unknown): ToolResult => {
    if (name === PLAN_TOOL) {
      plan = planSchema.parse(raw).steps;
      const left = plan.filter((step) => !step.done).length;
      return { ok: true, shown: true, stepsLeft: left };
    }
    if (name === NOTES_TOOL) {
      notes = notesSchema.parse(raw).text.trim();
      notesChanged = true;
      return { ok: true, saved: true };
    }
    const { fact } = factSchema.parse(raw);
    if (name === REMEMBER_TOOL) {
      if (!facts.includes(fact)) facts = [...facts, fact].slice(-MEMORY_LIMIT.facts);
      memoryChanged = true;
      return { ok: true, remembered: fact };
    }
    const kept = facts.filter((known) => known.toLowerCase() !== fact.toLowerCase());
    if (kept.length === facts.length) return { ok: false, error: `Nothing remembered reads "${fact}".` };
    facts = kept;
    memoryChanged = true;
    return { ok: true, forgot: fact };
  };
  return {
    run,
    plan: () => plan,
    /** Marks every step of the plan done: the work it planned was done another way (the band played it). */
    completePlan: () => {
      plan = plan.map((step) => ({ ...step, done: true }));
      return plan;
    },
    /** What changed this turn, for the browser to keep. */
    changes: () => ({
      ...(notesChanged ? { songNotes: notes } : {}),
      ...(memoryChanged ? { memory: facts } : {}),
    }),
    /** The song's notes and the musician as the agent starts the turn with them. */
    context: () =>
      [
        notes ? `Song notes (yours, kept between turns):\n${notes}` : "Song notes: none yet.",
        facts.length
          ? `What you know about this musician:\n${facts.map((fact) => `- ${fact}`).join("\n")}`
          : "What you know about this musician: nothing yet.",
      ].join("\n\n"),
  };
}
