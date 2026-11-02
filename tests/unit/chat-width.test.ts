import { test } from "node:test";
import assert from "node:assert/strict";
import { clampChatWidth, defaultChatWidth, maxChatWidth, minChatWidth } from "@/modules/assistant";

const LAPTOP = 1440;
const WIDE = 2560;

test("the chat opens narrower on a laptop than on a wide screen, and never below what the bar needs", () => {
  assert.ok(defaultChatWidth(LAPTOP) < defaultChatWidth(WIDE));
  assert.ok(defaultChatWidth(LAPTOP) <= 440);
  assert.equal(minChatWidth(1000), 360);
});

test("a dragged width stays within what the window allows", () => {
  assert.equal(clampChatWidth(200, LAPTOP), minChatWidth(LAPTOP));
  assert.equal(clampChatWidth(5000, LAPTOP), maxChatWidth(LAPTOP));
  assert.equal(clampChatWidth(5000, 1000), 600);
  assert.equal(clampChatWidth(500, LAPTOP), 500);
});
