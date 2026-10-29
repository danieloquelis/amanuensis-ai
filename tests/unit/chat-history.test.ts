import { test } from "node:test";
import assert from "node:assert/strict";
import { restoreTurns, turnsToSave, type Turn } from "@/modules/assistant";

const done = (id: string): Turn => ({ id, instruction: `ask ${id}`, status: "done", reply: `reply ${id}` });

test("only finished turns are saved, newest kept when there are too many", () => {
  const working: Turn = { id: "w", instruction: "still going", status: "working" };
  const turns = [...Array.from({ length: 70 }, (_, index) => done(String(index))), working];
  const saved = turnsToSave(turns);
  assert.equal(saved.length, 60);
  assert.equal(saved.at(-1)?.id, "69");
  assert.ok(saved.every((turn) => turn.status !== "working"));
});

test("restored turns drop session-only state and skip anything unreadable", () => {
  const stored = JSON.parse(
    JSON.stringify([
      { ...done("a"), revision: 4, activity: { stage: "thinking" } },
      { id: "b", status: "done" },
      "junk",
      { ...done("c"), spoken: true, heard: [{ kind: "sang", seconds: 2 }] },
    ]),
  );
  const restored = restoreTurns(stored);
  assert.deepEqual(
    restored.map((turn) => turn.id),
    ["a", "c"],
  );
  assert.equal(restored[0].revision, undefined);
  assert.equal("activity" in restored[0], false);
  assert.deepEqual(restored[1].heard, [{ kind: "sang", seconds: 2 }]);
  assert.deepEqual(restoreTurns({ not: "a list" }), []);
});
