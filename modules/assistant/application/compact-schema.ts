// A tool's JSON Schema is re-sent on every model step, so its size is cost. These passes shrink
// it without changing what it accepts or says: every description stays.
//
// Zod's `reused: "ref"` moves every schema it meets twice into `$defs`. The operation union is
// reached twice (one operation, or a batch of them), so all of its parts are, down to each
// `{ "const": "setPitch" }`: the model then reads `"type": { "$ref": "#/$defs/__schema1" }` and
// the tool list grows with hundreds of tiny definitions. `inlineCheapRefs` keeps a definition
// only where sharing it is shorter than writing it out at each use.

type Json = unknown;
type Defs = Record<string, Json>;

const DEFS_PREFIX = "#/$defs/";
/** Characters a reference costs beyond its name: `{"$ref":"#/$defs/"}`. */
const REF_OVERHEAD = `{"$ref":"${DEFS_PREFIX}"}`.length;
/** Characters a kept definition costs beyond its body: its quoted name, colon and comma. */
const DEF_OVERHEAD = 4;

/**
 * Keys that only matter to strict validators; our gateway validates every call anyway. `pattern`
 * would hide that IDs may be given as positions ("2#5"), which are resolved before validation.
 */
const VALIDATOR_ONLY_KEYS = new Set(["$schema", "additionalProperties", "pattern"]);

const isObject = (node: Json): node is Record<string, Json> =>
  Boolean(node) && typeof node === "object" && !Array.isArray(node);

const refName = (node: Json): string | null =>
  isObject(node) && typeof node.$ref === "string" && node.$ref.startsWith(DEFS_PREFIX)
    ? node.$ref.slice(DEFS_PREFIX.length)
    : null;

/** The node with the references to `inlined` definitions written out; the referring node's own keys win. */
function expand(node: Json, defs: Defs, inlined: Set<string>, seen: Set<string> = new Set()): Json {
  if (Array.isArray(node)) return node.map((item) => expand(item, defs, inlined, seen));
  if (!isObject(node)) return node;
  const name = refName(node);
  const entries = Object.entries(node).map(([key, value]) => [key, expand(value, defs, inlined, seen)] as const);
  if (!name || !inlined.has(name) || seen.has(name)) return Object.fromEntries(entries);
  const body = expand(defs[name], defs, inlined, new Set([...seen, name]));
  const own = entries.filter(([key]) => key !== "$ref");
  return { ...(isObject(body) ? body : {}), ...Object.fromEntries(own) };
}

/** How often each kept definition is referenced in what will be sent: the root and kept bodies. */
function referenceCounts(root: Json, defs: Defs, inlined: Set<string>): Map<string, number> {
  const counts = new Map<string, number>();
  const count = (node: Json) => {
    if (Array.isArray(node)) return node.forEach(count);
    if (!isObject(node)) return;
    const name = refName(node);
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    Object.values(node).forEach(count);
  };
  count(expand(root, defs, inlined));
  for (const name of Object.keys(defs)) if (!inlined.has(name)) count(expand(defs[name], defs, inlined));
  return counts;
}

/** Whether writing a definition out at each use is no longer than sharing it. */
function cheaperInline(name: string, size: number, uses: number): boolean {
  const shared = uses * (REF_OVERHEAD + name.length) + size + name.length + DEF_OVERHEAD;
  return uses * size <= shared;
}

/**
 * The schema with each `$defs` entry written out where that is no longer than referencing it:
 * those used once, and small ones such as a literal or a bare `{ "type": "string" }`. Large parts
 * used more than once (the operation union, a field's long description) stay shared.
 */
export function inlineCheapRefs(schema: Json): Json {
  if (!isObject(schema) || !isObject(schema.$defs)) return schema;
  const { $defs, ...root } = schema;
  const defs = $defs as Defs;
  const inlined = new Set<string>();
  // Writing one out changes how often its parts are used, so decide again until nothing changes.
  for (;;) {
    const counts = referenceCounts(root, defs, inlined);
    const cheap = Object.keys(defs)
      .filter((name) => !inlined.has(name))
      .filter((name) => {
        const size = JSON.stringify(expand(defs[name], defs, inlined)).length;
        return cheaperInline(name, size, counts.get(name) ?? 0);
      });
    if (!cheap.length) break;
    cheap.forEach((name) => inlined.add(name));
  }
  const kept = Object.keys(defs).filter((name) => !inlined.has(name));
  const body = expand(root, defs, inlined) as Record<string, Json>;
  if (!kept.length) return body;
  return { ...body, $defs: Object.fromEntries(kept.map((name) => [name, expand(defs[name], defs, inlined)])) };
}

/** The schema without the keys only a strict validator needs. */
export function compactSchema(node: Json): Json {
  if (Array.isArray(node)) return node.map(compactSchema);
  if (!isObject(node)) return node;
  const kept = Object.entries(node)
    .filter(([key]) => !VALIDATOR_ONLY_KEYS.has(key))
    .map(([key, value]) => [key, compactSchema(value)]);
  return Object.fromEntries(kept);
}
