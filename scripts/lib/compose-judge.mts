// A composition professor grades a piece from its score text, on a rubric with anchored levels,
// so runs can be compared. The judge is the same Meta model at high thinking, asked to be strict.
import { parseStructured, structuredFormat, type ModelPort } from "@/modules/assistant";
import { z } from "zod";

export const RUBRIC = [
  "material",
  "development",
  "voiceLeading",
  "harmony",
  "form",
  "orchestration",
  "rhythm",
  "idiom",
] as const;
const LEVELS = ["beginner", "student", "competent", "professional"] as const;
const mark = z.number().describe("1 to 10, on the anchored scale");
const marks = Object.fromEntries(RUBRIC.map((criterion) => [criterion, mark])) as Record<
  (typeof RUBRIC)[number],
  typeof mark
>;
/** The grade as structured output: the schema the model must follow is the one that reads it. */
const gradeSchema = z.object({
  ...marks,
  overall: mark,
  level: z.enum(LEVELS),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
});
export type Grade = z.infer<typeof gradeSchema>;
const GRADE_FORMAT = structuredFormat("composition_grade", gradeSchema);

const JUDGE = `You are a demanding professor of composition and a working orchestrator. You grade a piece from its score, written in a text notation (bars, parts, notes as pitch+octave and duration: w h q e s, dotted with ".", "r" rests, "~" ties, 3[...] triplets; chords and dynamics after ";").

Grade each criterion from 1 to 10, anchored like this:
- 3: a beginner (aimless notes, no idea of the style)
- 5: a first-year student (correct but plain: scales and block chords, little comes back, flat dynamics)
- 7: a competent working arranger (clear material that is developed, good voice leading, a shape)
- 9: a professional at their best (memorable ideas, every part alive and idiomatic, a strong arc)

Criteria:
- material: are the themes, motifs or riffs memorable and characteristic?
- development: is the material reused and transformed (sequence, inversion, fragmentation, imitation, variation), or does each bar invent something new?
- voiceLeading: are the parts good lines on their own and against each other (contrary motion, no careless parallels, dissonances resolved, ranges used well)?
- harmony: is the harmony purposeful (cadences, tension and release, modulation where fitting)?
- form: is there a clear form with phrases, sections, a climax and an ending?
- orchestration: does each instrument play what suits it, with texture changing over the piece?
- rhythm: is the rhythm varied and alive, with independence between parts where the style needs it?
- idiom: does it sound like the requested style, as a professional in that style would write it?

Be strict and specific: name bars and parts. Give a mark for each criterion and an overall mark, the level (beginner, student, competent or professional), and the piece's strengths and weaknesses.`;

/** The judge's grade for one piece, asked twice if its first answer cannot be read; null if neither can. */
export async function judge(model: ModelPort, request: string, scoreText: string): Promise<Grade | null> {
  return (await judgeOnce(model, request, scoreText)) ?? (await judgeOnce(model, request, scoreText));
}

async function judgeOnce(model: ModelPort, request: string, scoreText: string): Promise<Grade | null> {
  const reply = await model.complete(
    [
      { role: "system", content: JUDGE },
      { role: "user", content: `The request was: "${request}"\n\nThe score:\n${scoreText}` },
    ],
    [],
    { responseFormat: GRADE_FORMAT },
  );
  return parseStructured(gradeSchema, reply.content);
}
