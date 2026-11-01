import { test } from "node:test";
import assert from "node:assert/strict";
import { askedAfter, withHeardWords, type AskedTake } from "@/modules/assistant";

const take: AskedTake = {
  wav: new Uint8Array([1, 2, 3]),
  speech: [{ start: 0, end: 1, text: "we will do like this" }],
};
const question = { question: { text: "Which key?", choices: ["F major", "F minor"] } };

test("a take the agent asks about stays open for the answer, and after it acts, for follow-ups", () => {
  const open = askedAfter(null, take, question);
  assert.equal(open, take);
  // The musician answers with words; the agent asks again: the take stays with the next answer.
  assert.equal(askedAfter(open, open, question), take);
  // The agent writes the singing: the take stays, as written, for "try again" or "only bar 2".
  assert.deepEqual(askedAfter(open, open, { question: null }), { ...take, written: true });
  assert.deepEqual(askedAfter(null, take, { question: null }), { ...take, written: true });
});

test("another take or attached files leave the old take behind; a failed turn keeps it", () => {
  const other: AskedTake = { wav: new Uint8Array([9]) };
  assert.deepEqual(askedAfter(take, other, { question: null }), { ...other, written: true });
  assert.equal(askedAfter(take, null, { question: null }, true), null);
  assert.equal(askedAfter(take, take, null), take);
  // Words alone, with no take before: there is no take to keep.
  assert.equal(askedAfter(null, null, question), null);
});

test("an answer carries the words heard in its take, so they are not recognized again", () => {
  const payload = { instruction: "F major" };
  assert.deepEqual(withHeardWords(payload, take), { instruction: "F major", speech: take.speech });
  assert.deepEqual(withHeardWords(payload, { wav: take.wav }), payload);
  // A follow-up to a written take says so, so the agent hears it again only when asked.
  assert.deepEqual(withHeardWords(payload, { ...take, written: true }), {
    ...payload,
    speech: take.speech,
    takeWritten: true,
  });
});
