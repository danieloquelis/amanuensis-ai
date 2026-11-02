import { test } from "node:test";
import assert from "node:assert/strict";
import { BAND_SECONDS, createBandClock } from "@/modules/assistant";

test("the band rehearses only while a round still fits in its time", () => {
  let now = 0;
  const clock = createBandClock(undefined, () => now);
  const signal = clock.start();
  assert.equal(clock.roomForRehearsal(), true);
  now = (BAND_SECONDS - 30) * 1000;
  assert.equal(clock.roomForRehearsal(), false);
  assert.equal(signal.aborted, false);
  clock.stop();
});
