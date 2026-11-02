import { test } from "node:test";
import assert from "node:assert/strict";
import { runAssistant, type ChatMessage, type ModelPort, type ModelReply } from "@/modules/assistant";
import { barEvents, createExample, createSession, executeAll, midiPitch, type Score } from "@/modules/score";

/** A model that plays back scripted replies and records what it was shown. */
function scriptedModel(replies: ModelReply[]) {
  const seen: ChatMessage[][] = [];
  const model: ModelPort = {
    async complete(messages) {
      seen.push(structuredClone(messages));
      return replies.shift() ?? { content: "Done.", toolCalls: [] };
    },
  };
  return { model, seen };
}

const call = (name: string, args: unknown, id = name) => ({ id, name, arguments: JSON.stringify(args) });

/** A line's pitches, bar by bar (MIDI numbers). */
const pitches = (score: Score, voiceId: string) =>
  score.measures.map((measure) => barEvents(measure, voiceId).flatMap((e) => (e.pitch ? [midiPitch(e.pitch)] : [])));

test("the tune moves through the band as planned: copied where it goes, freed where it leaves, and kept", async () => {
  const { model, seen } = scriptedModel([
    // The bandleader's plan: the trumpet takes the tune, then piano and trumpet play it together.
    {
      content: null,
      toolCalls: [
        call("band_arrange", {
          feel: "a ballad",
          parts: [
            { part: "piano", brief: "comp the chords" },
            { part: "trumpet", brief: "sing it" },
          ],
          tune: [
            { from: 1, to: 2, parts: ["trumpet"] },
            { from: 3, to: 4, parts: ["piano", "trumpet"] },
          ],
        }),
      ],
    },
    // Pianist and trumpeter start together: the pianist tries to rewrite the tune in bar 3
    // (refused), the trumpeter phrases it; then the pianist comps.
    {
      content: null,
      toolCalls: [call("score_write", { requestId: "p1", expectedRevision: 0, text: "bar 3 piano: C5q C5q C5q C5q" })],
    },
    { content: "Phrased the tune.", toolCalls: [] },
    { content: "Comped under the tune.", toolCalls: [] },
    // The rehearsal, then the bandleader's reply.
    { content: "Kept my comping.", toolCalls: [] },
    { content: "Kept the tune.", toolCalls: [] },
    { content: "The trumpet sings it, then piano and trumpet together.", toolCalls: [] },
  ]);
  const score = createExample();
  const tune = pitches(score, score.parts[0].staves[0].voices[0].id);
  const request = { instruction: "arrange it", score, selectedIds: [], history: [], band: { on: true } };
  const result = await runAssistant(model, request, "tp");
  const after = executeAll(createSession(score), result.commands).score;
  const [piano, trumpet] = [after.parts[0], after.parts.find((p) => p.instrument === "trumpet")!];
  // The trumpet plays the whole tune, in its range; the piano keeps it only where the plan says.
  assert.deepEqual(pitches(after, trumpet.staves[0].voices[0].id), tune);
  assert.deepEqual(pitches(after, piano.staves[0].voices[0].id), [[], [], tune[2], tune[3]]);
  // The pianist's rewrite of the tune was refused; each musician was told where it carries it.
  const refused = result.trace.find((entry) => !entry.ok);
  assert.match(refused?.error ?? "", /Bars 3 carry the song's tune in your part/);
  assert.match(JSON.stringify(seen[1]), /You carry it in bars 3–4 \(with trumpet there too/);
  assert.match(JSON.stringify(seen[2]), /You carry it in bars 1–2, 3–4 \(with piano there too/);
});
