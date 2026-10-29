import { z } from "zod";
import { eventSchema, idSchema } from "./schema";

/**
 * Older native files, migrated step by step (v1 → v2 → v3) before validation. Every migration
 * keeps IDs, revision, title, pitches and timing. This works on raw stored JSON, before it is a
 * Score, so it reads bars directly rather than through voice-access.
 */
export function migrateScore(value: unknown): unknown {
  return migrateVersion2(convertLegacyGaps(migrateVersion1(value)));
}

const legacyScoreSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: idSchema,
  revision: z.number().int().nonnegative(),
  title: z.string(),
  tempo: z.number(),
  measures: z.array(
    z.strictObject({
      id: idSchema,
      events: z.array(eventSchema.omit({ articulation: true, measureRest: true, tie: true })),
    }),
  ),
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const hasVersion = (value: unknown, version: number) => isRecord(value) && value.schemaVersion === version;

function migrateVersion1(value: unknown): unknown {
  if (!hasVersion(value, 1)) return value;
  const legacy = legacyScoreSchema.parse(value);
  return {
    ...legacy,
    schemaVersion: 2,
    measures: legacy.measures.map((m) => ({ ...m, meter: { numerator: 4, denominator: 4 } })),
    annotations: [],
    repeats: [],
  };
}

/**
 * Early v2 drafts marked space left by a shortened note with `gap: true` and drew it as a
 * placeholder. That space is now an ordinary rest, so the marker is dropped on load.
 */
function convertLegacyGaps(value: unknown): unknown {
  if (!hasVersion(value, 2) || !isRecord(value) || !Array.isArray(value.measures)) return value;
  const withoutGap = (event: unknown) => {
    if (!isRecord(event) || !("gap" in event)) return event;
    const rest = { ...event };
    delete rest.gap;
    return rest;
  };
  const measures = value.measures.map((raw) =>
    isRecord(raw) && Array.isArray(raw.events) ? { ...raw, events: raw.events.map(withoutGap) } : raw,
  );
  return { ...value, measures };
}

/** Every `id` anywhere in the stored JSON. */
function idsIn(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => idsIn(item, found));
  else if (isRecord(value)) {
    if (typeof value.id === "string") found.add(value.id);
    Object.values(value).forEach((item) => idsIn(item, found));
  }
  return found;
}

/** `base`, or `base-2`, `base-3`… when a file already uses it. */
export function freeId(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/**
 * v2 scores held one line of notes per bar. In v3 that line is the only voice of a single piano
 * part with one treble staff; a bar's slash or repeat style moves onto its voice bar, and a dynamic
 * on a bar names that staff.
 */
function migrateVersion2(value: unknown): unknown {
  if (!hasVersion(value, 2) || !isRecord(value) || !Array.isArray(value.measures)) return value;
  const taken = idsIn(value);
  const partId = freeId("part-1", taken);
  const staffId = freeId("staff-1", taken);
  const voiceId = freeId("voice-1", taken);
  const measureIds = new Set(value.measures.flatMap((raw) => (isRecord(raw) ? [raw.id] : [])));
  const measures = value.measures.map((raw) => {
    if (!isRecord(raw)) return raw;
    const { events, style, ...rest } = raw;
    return { ...rest, voices: [{ voiceId, events, ...(style === undefined ? {} : { style }) }] };
  });
  const annotations = Array.isArray(value.annotations)
    ? value.annotations.map((a) =>
        isRecord(a) && a.kind === "dynamic" && measureIds.has(a.targetId) ? { ...a, staffId } : a,
      )
    : value.annotations;
  const staves = [{ id: staffId, clef: "treble", voices: [{ id: voiceId }] }];
  return {
    ...value,
    schemaVersion: 3,
    parts: [{ id: partId, instrument: "piano", name: "Piano", staves }],
    measures,
    annotations,
  };
}
