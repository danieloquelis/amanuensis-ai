import { test } from "node:test";
import assert from "node:assert/strict";
import { readUploads, runAssistant, type ModelPort, type ModelReply } from "@/modules/assistant";
import { allStaves, applyCommand, createExample, meterName, scoreKey, type Score } from "@/modules/score";

// Reading a page into an empty score sets the score up at once, from the reading.

const call = (name: string, args: unknown) => ({ id: name, name, arguments: JSON.stringify(args) });

async function readInto(score: Score, reading: unknown) {
  const replies: ModelReply[] = [{ content: null, toolCalls: [call("music_read_source", reading)] }];
  let seen = "";
  const model: ModelPort = {
    async complete(messages) {
      const last = messages.at(-1);
      if (last?.role === "tool") seen = last.content;
      return replies.shift() ?? { content: "Done.", toolCalls: [] };
    },
  };
  const read = readUploads([{ name: "page.png", mediaType: "image/png", bytes: new Uint8Array([1]) }]);
  assert.ok("attachments" in read);
  const request = { instruction: "", score, selectedIds: [], history: [], attachments: read.attachments };
  const result = await runAssistant(model, request, "t");
  let after = score;
  for (const command of result.commands) after = applyCommand(after, command);
  return { after, setUp: JSON.parse(seen).setUp as string };
}

const empty = () => {
  const base = createExample();
  return applyCommand(base, { requestId: "new", expectedRevision: base.revision, operation: { type: "newScore" } });
};

test("an empty score is set up from the reading: parts, a grand staff, key, meter, tempo and bars", async () => {
  const reading = {
    kind: "engraved",
    title: "Nocturne",
    parts: [{ name: "Piano", instrument: "piano", staves: 2 }],
    key: "E♭ major",
    keySignature: -3,
    meter: "12/8",
    quarterBpm: 66,
    bars: 6,
  };
  const { after, setUp } = await readInto(empty(), reading);
  assert.equal(after.title, "Nocturne");
  assert.equal(allStaves(after).length, 2);
  assert.equal(scoreKey(after).fifths, -3);
  assert.equal(meterName(after.measures[0].meter), "12/8");
  assert.equal(after.tempo, 66);
  assert.equal(after.measures.length, 6);
  assert.match(setUp, /write into piano, piano\.2/);
});

test("a B♭ trumpet part's written key becomes the score's concert key", async () => {
  const reading = {
    kind: "engraved",
    parts: [{ name: "TP-1", instrument: "trumpet", transposing: true }],
    keySignature: -2,
    meter: "cut time",
    bars: 40,
  };
  const { after, setUp } = await readInto(empty(), reading);
  assert.equal(scoreKey(after).fifths, -4);
  assert.equal(meterName(after.measures[0].meter), "2/2");
  assert.equal(after.measures.length, 32);
  assert.match(setUp, /write into trumpet/);
});

test("a score that already has music is left as it is: where the new music goes is asked", async () => {
  const reading = { kind: "engraved", parts: [{ name: "Piano", instrument: "piano" }], bars: 4 };
  const { after, setUp } = await readInto(createExample(), reading);
  assert.deepEqual(after, createExample());
  assert.match(setUp, /already has music/);
});
