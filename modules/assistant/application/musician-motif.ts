import type { Score } from "@/modules/score";
import { motifOperation, motifSchema, type Material } from "./band-material";
import type { ToolCall, ToolSpec } from "./model-port";
import { parseArguments } from "./score-tool-call";
import { toolError } from "./score-tool-gateway";
import { toolParameters } from "./tool-definitions";

export const BAND_MOTIF = "band_motif";

export const bandMotifSpec: ToolSpec = {
  name: BAND_MOTIF,
  description:
    "Play the band's material in your part, exactly, from a bar and beat: as written, or developed as a composer develops a motif: moved in the key (a fugal answer a fifth up), a sequence (its head placed again a step lower each time: call it once per step), upside down (an episode), twice as slow (the subject in the bass at the climax), twice as fast, backwards, or only a piece of it (the head as a fragment to pass between voices). State it plainly once; after that, develop it. It overwrites what your part had there. Then write around it with score_write, keeping those bars as placed.",
  parameters: toolParameters(motifSchema),
};

let placed = 0;

/**
 * A musician's band_motif call as the score edit it makes (a developed copyNotes into its own
 * part), so it goes through the same checks as its other edits; or why it cannot be made.
 */
export function playMotif(
  call: ToolCall,
  score: Score,
  materials: Material[],
  part: string,
): ToolCall | { ok: false; error: string } {
  try {
    const operation = motifOperation(score, materials, part, motifSchema.parse(parseArguments(call)));
    const args = { requestId: `${call.id}-motif-${placed++}`, expectedRevision: score.revision, operation };
    return { id: call.id, name: "score_edit", arguments: JSON.stringify(args) };
  } catch (error) {
    return { ok: false, error: toolError(error) };
  }
}
