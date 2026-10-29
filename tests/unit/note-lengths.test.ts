import { test } from "node:test";
import assert from "node:assert/strict";
import { eventOnsets, fraction, soundingBeats, soundingDuration } from "@/modules/score";

const lasting = (numerator: number, denominator: number) => ({ duration: fraction(numerator, denominator) });

test("onsets are summed exactly, so thirds of a beat land on whole beats", () => {
  // Floats drift here: 0.5 + 1/3 + 1/3 + 1/3 is 1.4999999999999998.
  const events = [lasting(1, 2), lasting(1, 3), lasting(1, 3), lasting(1, 3), lasting(1, 2)];
  const onsets = eventOnsets(events);
  assert.equal(onsets[4], 1.5);
  assert.deepEqual(eventOnsets([lasting(1, 1), lasting(1, 2), lasting(1, 2)]), [0, 1, 1.5]);
  assert.deepEqual(eventOnsets([]), []);
});

test("a plain note sounds for its written value", () => {
  const dottedQuarter = lasting(3, 2);
  assert.deepEqual(soundingDuration(dottedQuarter), fraction(3, 2));
  assert.equal(soundingBeats(dottedQuarter), 1.5);
});
