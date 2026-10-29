import { eventOnsets } from "../domain/rhythm";
import type { Score } from "../domain/schema";
import { isNotationHandle, notationAt } from "./notation-positions";
import { barEvents, numberedVoice } from "../domain/voice-access";

/**
 * Musical addresses for operations, so an agent reading score text can target what it sees:
 * a note or rest is "bar:beat" ("2:3" is bar 2, beat 3; beats count from 1 and may be fractional,
 * "2:2.5") or "bar#n" ("2#5" is the fifth note or rest of bar 2), with "vK" after the bar for
 * another voice ("2v2#1"), a bar is its number ("2"), and
 * a chord, slur, mark, repeat or indication is named as in `notation-positions` ("chord 2:3"). `resolvePositions` swaps them for IDs before validation.
 */

/** Operation fields that name a note or rest, and those that name a bar (`targetId` may be either). */
const EVENT_KEYS = new Set(["eventId", "startEventId", "endEventId", "beforeEventId", "targetId", "eventIds"]);
const BAR_KEYS = new Set(["measureId", "afterMeasureId", "startMeasureId", "endMeasureId", "measureIds", "targetId"]);
/** "2:3" or "2v2:3" (bar 2, voice 2, beat 3); "2#5" or "2v2#5" (its fifth note or rest). */
const EVENT_POSITION = /^(\d+)(?:v(\d))?:(\d+(?:\.\d+)?)$/;
const EVENT_ORDER = /^(\d+)(?:v(\d))?#(\d+)$/;
const BAR_POSITION = /^\d+$/;
const EPSILON = 1e-9;

const isEventPosition = (value: unknown): value is string =>
  typeof value === "string" && (EVENT_POSITION.test(value) || EVENT_ORDER.test(value));
const isBarPosition = (value: unknown): value is string | number =>
  (typeof value === "number" && Number.isInteger(value)) || (typeof value === "string" && BAR_POSITION.test(value));

function measureAt(score: Score, value: string | number): string {
  const measure = score.measures[Number(value) - 1];
  if (!measure) throw new Error(`There is no bar ${value}.`);
  return measure.id;
}

/** The events of voice `number` (the main line when absent) in a bar. */
function voiceEventsAt(score: Score, bar: string, number: string | undefined) {
  const measure = score.measures[Number(bar) - 1];
  if (!measure) throw new Error(`There is no bar ${bar}.`);
  const voiceId = number ? numberedVoice(score, Number(number)) : undefined;
  if (number && !voiceId) throw new Error(`There is no voice ${number}.`);
  return barEvents(measure, voiceId ?? undefined);
}

function eventAt(score: Score, position: string): string {
  const order = EVENT_ORDER.exec(position);
  if (order) {
    const event = voiceEventsAt(score, order[1], order[2])[Number(order[3]) - 1];
    const where = order[2] ? `Bar ${order[1]} voice ${order[2]}` : `Bar ${order[1]}`;
    if (!event) throw new Error(`${where} has no note or rest number ${order[3]}.`);
    return event.id;
  }
  const [, bar, voice, beat] = EVENT_POSITION.exec(position)!;
  const events = voiceEventsAt(score, bar, voice);
  const onsets = eventOnsets(events);
  const at = onsets.findIndex((onset) => Math.abs(onset + 1 - Number(beat)) < EPSILON);
  if (at !== -1) return events[at].id;
  throw new Error(`No note or rest starts at bar ${bar}, beat ${beat}.`);
}

/** One address: a position becomes the ID it points at; anything else (an ID) passes through. */
function resolveAddress(score: Score, key: string, value: unknown): unknown {
  if (key === "id" && isNotationHandle(value)) return notationAt(score, value);
  if (EVENT_KEYS.has(key) && isEventPosition(value)) return eventAt(score, value);
  if (BAR_KEYS.has(key) && isBarPosition(value)) return measureAt(score, value);
  return value;
}

function resolveField(score: Score, key: string, value: unknown): unknown {
  if (!EVENT_KEYS.has(key) && !BAR_KEYS.has(key) && key !== "id") return resolve(score, value);
  return Array.isArray(value)
    ? value.map((item) => resolveAddress(score, key, item))
    : resolveAddress(score, key, value);
}

/**
 * Replaces positions in a raw operation or command (any nesting, batches included) with the IDs
 * they point at in `score`. Every position refers to the score as read, so a batch can address
 * notes that earlier operations in it will move. Throws when a position points at nothing.
 */
export function resolvePositions<T>(score: Score, raw: T): T {
  return resolve(score, raw) as T;
}

function resolve(score: Score, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => resolve(score, item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveField(score, key, item)]));
}
