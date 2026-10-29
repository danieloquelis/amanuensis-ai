import { test } from "node:test";
import assert from "node:assert/strict";
import { askedAfter, withHeardWords, type AskedTake } from "@/modules/assistant";

const take: AskedTake = {
  wav: new Uint8Array([1, 2, 3]),
  speech: [{ start: 0, end: 1, text: "we will do like this" }],
};
const question = { question: { text: "Which key?", choices: ["F major", "F minor"] } };

test("a take the agent asks about stays open for the answer, and closes once the agent acts", () => {
  const open = askedAfter(null, take, question);
  assert.equal(open, take);
  // The musician answers with words; the agent asks again: the take stays with the next answer.
  assert.equal(askedAfter(open, open, question), take);
  // The agent writes the singing: the next words go alone.
  assert.equal(askedAfter(open, open, { question: null }), null);
});

test("a take with no question closes; a failed turn keeps what was open", () => {
  assert.equal(askedAfter(null, take, { question: null }), null);
  assert.equal(askedAfter(take, take, null), take);
  // Words alone, asked about: there is no take to keep.
  assert.equal(askedAfter(null, null, question), null);
});

test("an answer carries the words heard in its take, so they are not recognized again", () => {
  const payload = { instruction: "F major" };
  assert.deepEqual(withHeardWords(payload, take), { instruction: "F major", speech: take.speech });
  assert.deepEqual(withHeardWords(payload, { wav: take.wav }), payload);
});
