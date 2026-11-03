import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { scoreTools, toolParameters } from "@/modules/assistant";
import { commandSchema } from "@/modules/score";

type Json = unknown;
const DEFS = "#/$defs/";

/** The schema with every `$ref` written out, the referring node's own keys winning. */
function resolve(node: Json, defs: Record<string, Json>): Json {
  if (Array.isArray(node)) return node.map((item) => resolve(item, defs));
  if (!node || typeof node !== "object") return node;
  const { $ref, ...own } = node as Record<string, Json>;
  const resolved = Object.fromEntries(
    Object.entries(own)
      .filter(([key]) => key !== "$defs")
      .map(([key, value]) => [key, resolve(value, defs)]),
  );
  if (typeof $ref !== "string") return resolved;
  return { ...(resolve(defs[$ref.slice(DEFS.length)], defs) as object), ...resolved };
}
const written = (schema: Json) => resolve(schema, ((schema as { $defs?: object }).$defs ?? {}) as Record<string, Json>);
const without = (node: Json, keys: Set<string>): Json =>
  Array.isArray(node)
    ? node.map((item) => without(item, keys))
    : node && typeof node === "object"
      ? Object.fromEntries(
          Object.entries(node)
            .filter(([key]) => !keys.has(key))
            .map(([key, value]) => [key, without(value, keys)]),
        )
      : node;

test("the score_edit schema says the same as Zod's, with names in place and only large parts shared", () => {
  const zod = z.toJSONSchema(commandSchema, { reused: "ref" });
  const sent = toolParameters(commandSchema);
  const validatorOnly = new Set(["$schema", "additionalProperties", "pattern"]);
  assert.deepEqual(written(sent), without(written(zod), validatorOnly));
  const text = JSON.stringify(scoreTools.find((tool) => tool.name === "score_edit")!.parameters);
  assert.match(text, /"type":\{"type":"string","const":"setPitch"\}/);
  const shared = Object.keys((sent as { $defs?: object }).$defs ?? {}).length;
  assert.ok(shared > 0 && shared < 20, `${shared} shared definitions`);
  assert.ok(text.length < JSON.stringify(zod).length * 0.8, "at least a fifth smaller");
});
