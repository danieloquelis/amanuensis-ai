// A composition professor grades a piece from its score text, on a rubric with anchored levels,
// so runs can be compared. The judge is the same Meta model at high thinking, asked to be strict.
import type { ModelPort } from "@/modules/assistant";

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
export type Grade = Record<(typeof RUBRIC)[number] | "overall", number> & {
  level: string;
  strengths: string[];
  weaknesses: string[];
};

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

Be strict and specific: name bars and parts. Answer with JSON only:
{"material":n,"development":n,"voiceLeading":n,"harmony":n,"form":n,"orchestration":n,"rhythm":n,"idiom":n,"overall":n,"level":"beginner|student|competent|professional","strengths":["…"],"weaknesses":["…"]}`;

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
  );
  const text = reply.content ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    const grade = JSON.parse(json) as Grade;
    return typeof grade.overall === "number" ? grade : null;
  } catch {
    return null;
  }
}
