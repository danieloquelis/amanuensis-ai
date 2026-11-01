import { test } from "node:test";
import assert from "node:assert/strict";
import { readableThought } from "@/modules/assistant";

test("the thinking shown in the chat names things as a musician would, not by the agent's tool names", () => {
  assert.equal(
    readableThought(
      "Interpreting user request to redo transcription for bar 1 using sung-1 audio and selecting the correct span for voice_transcribe_melody.",
    ),
    "Interpreting user request to redo transcription for bar 1 using your singing and selecting the correct part for the transcription.",
  );
  assert.equal(
    readableThought("Drafting score_write text after voice_check."),
    "Drafting the new bars text after checking against your take.",
  );
  assert.equal(readableThought("Comparing sung-2 with voice-1."), "Comparing sung part 2 with the other voice.");
});
