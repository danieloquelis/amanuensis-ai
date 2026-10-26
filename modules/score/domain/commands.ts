import { z } from "zod";
import { beats, durationFromBeats, locateEvent, parseScore, measureCapacity, meterName, meterSchema, pitchSchema, idSchema, ARTICULATIONS, DURATIONS, type Meter, type Score, type ScoreEvent } from "./score";

const durationSchema = z.union([z.literal(0.25), z.literal(0.375), z.literal(0.5), z.literal(0.75), z.literal(1), z.literal(1.5), z.literal(2), z.literal(3), z.literal(4), z.literal(6)]);
export const operationSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("setMeasureWidth"), measureId: idSchema, width: z.number().min(260).max(468).nullable() }),
  z.strictObject({ type: z.literal("setPitch"), eventId: idSchema, pitch: pitchSchema.nullable() }),
  z.strictObject({ type: z.literal("setDuration"), eventId: idSchema, duration: durationSchema }),
  z.strictObject({ type: z.literal("setTempo"), tempo: z.number().int().min(40).max(200), measureId: idSchema.optional() }),
  z.strictObject({ type: z.literal("removeTempo"), measureId: idSchema }),
  z.strictObject({ type: z.literal("rename"), title: z.string().trim().min(1).max(100) }),
  z.strictObject({ type: z.literal("appendMeasure"), afterMeasureId: idSchema.optional() }),
  z.strictObject({ type: z.literal("deleteMeasure"), measureId: idSchema }),
  z.strictObject({ type: z.literal("duplicateMeasure"), measureId: idSchema }),
  z.strictObject({ type: z.literal("clearMeasure"), measureId: idSchema }),
  z.strictObject({ type: z.literal("setMeter"), measureIds: z.array(idSchema).min(1).max(32), meter: meterSchema, policy: z.enum(["preserve", "scale"]) }),
  z.strictObject({ type: z.literal("setArticulation"), eventId: idSchema, articulation: z.enum(ARTICULATIONS).nullable() }),
  z.strictObject({ type: z.literal("putAnnotation"), id: idSchema.optional(), targetId: idSchema, kind: z.enum(["text", "dynamic"]), text: z.string().trim().min(1).max(120) }),
  z.strictObject({ type: z.literal("removeNotation"), id: idSchema }),
  z.strictObject({ type: z.literal("putRepeat"), id: idSchema.optional(), startMeasureId: idSchema, endMeasureId: idSchema, count: z.number().int().min(2).max(4) }),
  z.strictObject({ type: z.literal("removeEvent"), eventId: idSchema }),
  z.strictObject({ type: z.literal("moveEvent"), eventId: idSchema, beforeEventId: idSchema.nullable() }),
  z.strictObject({ type: z.literal("replaceMeasure"), measureId: idSchema, events: z.array(z.strictObject({ pitch: pitchSchema.nullable(), duration: durationSchema })).min(1).max(32) }),
]);
export type BasicOperation = z.infer<typeof operationSchema>;
export type Operation = BasicOperation | { type: "batch"; operations: BasicOperation[] };
export const commandSchema = z.strictObject({ requestId: z.string().regex(/^[\w-]{1,60}$/), expectedRevision: z.number().int().nonnegative(), operation: z.union([operationSchema, z.strictObject({ type: z.literal("batch"), operations: z.array(operationSchema).min(1).max(64) })]) });
export type Command = z.infer<typeof commandSchema>;

export function makeRests(duration: number, prefix: string): ScoreEvent[] {
  const rests: ScoreEvent[] = [];
  for (const value of [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25]) {
    while (duration >= value) {
      rests.push({ id: `${prefix}-r${rests.length}`, pitch: null, duration: durationFromBeats(value) });
      duration -= value;
    }
  }
  if (duration !== 0) throw new Error("That duration cannot be notated yet.");
  return rests;
}

function makeGaps(duration: number, prefix: string): ScoreEvent[] {
  return makeRests(duration, prefix).map((event) => ({ ...event, gap: true }));
}

function fullRest(meter: Meter, prefix: string): ScoreEvent[] {
  return [{ id: `${prefix}-r0`, pitch: null, duration: durationFromBeats(measureCapacity(meter)), measureRest: true }];
}

export function applyCommand(score: Score, input: Command): Score {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid operation: ${parsed.error.issues[0].message}`);
  const command = parsed.data;
  if (command.expectedRevision !== score.revision) throw new Error("The score changed. Read the latest revision before applying this edit.");
  const next = structuredClone(score);
  const findMeasure = (id: string) => {
    const measure = next.measures.find((m) => m.id === id);
    if (!measure) throw new Error("That measure is no longer in the score.");
    return measure;
  };
  const detach = (ids: string[]) => {
    next.annotations = next.annotations.filter((a) => !ids.includes(a.targetId));
    next.repeats = next.repeats.filter((r) => !ids.includes(r.startMeasureId) && !ids.includes(r.endMeasureId));
  };
  const operations = command.operation.type === "batch" ? command.operation.operations : [command.operation];
  operations.forEach((op, opIndex) => {
    const prefix = `${command.requestId}-${opIndex}`;
    switch (op.type) {
      case "setMeasureWidth": {
        const measure = findMeasure(op.measureId);
        if (op.width === null) delete measure.width; else measure.width = op.width;
        break;
      }
      case "setPitch": case "removeEvent": {
        const event = locateEvent(next, op.eventId).event;
        event.pitch = op.type === "removeEvent" ? null : op.pitch;
        if (event.pitch) { delete event.measureRest; delete event.gap; }
        else if (op.type === "removeEvent") { delete event.measureRest; event.gap = true; }
        else delete event.gap;
        if (!event.pitch) delete event.articulation;
        break;
      }
      case "setTempo": if (op.measureId) findMeasure(op.measureId).tempo = op.tempo; else next.tempo = op.tempo; break;
      case "removeTempo": delete findMeasure(op.measureId).tempo; break;
      case "rename": next.title = op.title; break;
      case "appendMeasure": {
        const index = op.afterMeasureId ? next.measures.indexOf(findMeasure(op.afterMeasureId)) : next.measures.length - 1;
        const meter = { ...next.measures[index].meter };
        next.measures.splice(index + 1, 0, { id: `${prefix}-bar`, meter, events: fullRest(meter, prefix) });
        break;
      }
      case "deleteMeasure": {
        const measure = findMeasure(op.measureId);
        detach([measure.id, ...measure.events.map((e) => e.id)]);
        next.measures = next.measures.filter((m) => m.id !== measure.id);
        break;
      }
      case "duplicateMeasure": {
        const measure = findMeasure(op.measureId), copy = structuredClone(measure);
        const mapping = new Map([[measure.id, `${prefix}-bar`]]);
        copy.id = `${prefix}-bar`;
        copy.events.forEach((e, i) => { mapping.set(e.id, `${prefix}-n${i}`); e.id = `${prefix}-n${i}`; });
        const annotations = next.annotations.filter((a) => mapping.has(a.targetId)).map((a, i) => ({ ...a, id: `${prefix}-a${i}`, targetId: mapping.get(a.targetId)! }));
        next.annotations.push(...annotations);
        next.measures.splice(next.measures.indexOf(measure) + 1, 0, copy);
        break;
      }
      case "clearMeasure": case "replaceMeasure": {
        const measure = findMeasure(op.measureId);
        detach(measure.events.map((e) => e.id));
        measure.events = op.type === "clearMeasure" ? fullRest(measure.meter, prefix) : op.events.map((e, i) => ({ id: `${prefix}-n${i}`, pitch: e.pitch, duration: durationFromBeats(e.duration) }));
        break;
      }
      case "setMeter": {
        if (new Set(op.measureIds).size !== op.measureIds.length) throw new Error("Choose each measure once.");
        for (const [i, id] of op.measureIds.entries()) {
          const measure = findMeasure(id), capacity = measureCapacity(op.meter), oldCapacity = measureCapacity(measure.meter);
          if (measure.events.length === 1 && measure.events[0].measureRest) {
            measure.events[0].duration = durationFromBeats(capacity);
          } else if (op.policy === "scale") {
            for (const event of measure.events) {
              const value = beats(event.duration) * capacity / oldCapacity;
              if (!DURATIONS.some((d) => d.value === value)) throw new Error("Fitting this rhythm would require unsupported tuplets. Keep durations or edit the rhythm first.");
              event.duration = durationFromBeats(value);
            }
          } else if (capacity > oldCapacity) measure.events.push(...makeGaps(capacity - oldCapacity, `${prefix}-${i}`));
          else if (capacity < oldCapacity) {
            let excess = oldCapacity - capacity;
            while (excess > 0) {
              const last = measure.events.at(-1)!;
              if (last.pitch) throw new Error(`Changing to ${meterName(op.meter)} would cut notes. Choose Fit rhythm or make room with rests first.`);
              measure.events.pop(); detach([last.id]);
              const remainder = beats(last.duration) - excess;
              if (remainder > 0) measure.events.push(...(last.gap ? makeGaps(remainder, `${prefix}-${i}`) : makeRests(remainder, `${prefix}-${i}`)));
              excess = Math.max(0, -remainder);
            }
          }
          measure.meter = { ...op.meter };
        }
        break;
      }
      case "setArticulation": {
        const event = locateEvent(next, op.eventId).event;
        if (op.articulation) event.articulation = op.articulation; else delete event.articulation;
        break;
      }
      case "putAnnotation": {
        if (op.id && !next.annotations.some((a) => a.id === op.id)) throw new Error("Indication not found.");
        const existing = op.id ?? (op.kind === "dynamic" ? next.annotations.find((a) => a.targetId === op.targetId && a.kind === "dynamic")?.id : undefined);
        const annotation = { id: existing ?? `${prefix}-annotation`, targetId: op.targetId, kind: op.kind, text: op.text };
        next.annotations = [...next.annotations.filter((a) => a.id !== annotation.id), annotation];
        break;
      }
      case "putRepeat": {
        if (op.id && !next.repeats.some((r) => r.id === op.id)) throw new Error("Repeat not found.");
        const repeat = { id: op.id ?? `${prefix}-repeat`, startMeasureId: op.startMeasureId, endMeasureId: op.endMeasureId, count: op.count };
        next.repeats = [...next.repeats.filter((r) => r.id !== repeat.id), repeat];
        break;
      }
      case "removeNotation": {
        if (!next.annotations.some((a) => a.id === op.id) && !next.repeats.some((r) => r.id === op.id)) throw new Error("Indication not found.");
        next.annotations = next.annotations.filter((a) => a.id !== op.id);
        next.repeats = next.repeats.filter((r) => r.id !== op.id);
        break;
      }
      case "moveEvent": {
        const from = locateEvent(next, op.eventId), to = op.beforeEventId ? locateEvent(next, op.beforeEventId) : null;
        if (to && from.measure.id !== to.measure.id) throw new Error("Reordering currently stays within one measure.");
        if (from.event.id !== to?.event.id) {
          from.measure.events.splice(from.eventIndex, 1);
          const index = to ? from.measure.events.findIndex((e) => e.id === to.event.id) : from.measure.events.length;
          from.measure.events.splice(index, 0, from.event);
        }
        break;
      }
      case "setDuration": {
        const { measure, eventIndex, event } = locateEvent(next, op.eventId);
        let available = beats(event.duration), removeCount = 1;
        while (available < op.duration && measure.events[eventIndex + removeCount]?.pitch === null) { available += beats(measure.events[eventIndex + removeCount].duration); removeCount++; }
        if (available < op.duration) throw new Error("Make space first: a longer note can only use rests immediately after it.");
        const remainderSource = op.duration < beats(event.duration) ? event : measure.events[eventIndex + removeCount - 1];
        // Editing a full-bar rest to make room for a note leaves the rest of the bar open.
        const remainderIsRest = !event.measureRest && !remainderSource.pitch && !remainderSource.gap;
        detach(measure.events.slice(eventIndex + 1, eventIndex + removeCount).map((e) => e.id));
        delete event.measureRest;
        event.duration = durationFromBeats(op.duration);
        measure.events.splice(eventIndex, removeCount, event, ...(remainderIsRest ? makeRests(available - op.duration, prefix) : makeGaps(available - op.duration, prefix)));
        break;
      }
    }
  });
  next.revision++;
  return parseScore(next);
}

export type Session = { score: Score; past: Score[]; future: Score[]; requests: Record<string, string> };
export const createSession = (score: Score): Session => ({ score, past: [], future: [], requests: {} });

export function execute(session: Session, command: Command): Session {
  const payload = JSON.stringify(command);
  if (Object.hasOwn(session.requests, command.requestId)) {
    if (session.requests[command.requestId] !== payload) throw new Error("A request ID cannot be reused for a different edit.");
    return session;
  }
  const score = applyCommand(session.score, command);
  return {
    score, past: [...session.past.slice(-99), session.score], future: [],
    requests: { ...session.requests, [command.requestId]: payload },
  };
}

// Single local writer: snapshots are safe here. Server/multi-writer undo will need field-level compensation.
export function travel(session: Session, direction: "undo" | "redo"): Session {
  const source = direction === "undo" ? session.past : session.future;
  if (!source.length) return session;
  const score = { ...source[source.length - 1], revision: session.score.revision + 1 };
  return direction === "undo"
    ? { ...session, score, past: source.slice(0, -1), future: [...session.future, session.score] }
    : { ...session, score, future: source.slice(0, -1), past: [...session.past, session.score] };
}
