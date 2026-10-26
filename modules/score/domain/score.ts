import { z } from "zod";

export const STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export const DYNAMICS = ["pp", "p", "mp", "mf", "f", "ff"] as const;
export const ARTICULATIONS = ["staccato", "accent", "tenuto", "fermata"] as const;
export const METERS = ["2/4", "3/4", "4/4", "5/4", "3/8", "6/8", "9/8", "12/8"] as const;
export const DURATIONS = [
  { label: "Dotted whole", value: 6 }, { label: "Whole", value: 4 },
  { label: "Dotted half", value: 3 }, { label: "Half", value: 2 },
  { label: "Dotted quarter", value: 1.5 }, { label: "Quarter", value: 1 },
  { label: "Dotted eighth", value: 0.75 }, { label: "Eighth", value: 0.5 },
  { label: "Dotted sixteenth", value: 0.375 }, { label: "Sixteenth", value: 0.25 },
] as const;
export const idSchema = z.string().regex(/^[\w-]{1,100}$/);
export const pitchSchema = z.strictObject({ step: z.enum(STEPS), alter: z.union([z.literal(-1), z.literal(0), z.literal(1)]), octave: z.number().int().min(3).max(6) });
export const meterSchema = z.strictObject({ numerator: z.number().int().min(2).max(12), denominator: z.union([z.literal(4), z.literal(8)]) });
const fractionSchema = z.strictObject({ numerator: z.number().int().min(1).max(48), denominator: z.number().int().min(1).max(8) });
const eventSchema = z.strictObject({ id: idSchema, duration: fractionSchema, pitch: pitchSchema.nullable(), gap: z.literal(true).optional(), measureRest: z.literal(true).optional(), articulation: z.enum(ARTICULATIONS).optional() });
const measureSchema = z.strictObject({ width: z.number().min(260).max(468).optional(), id: idSchema, meter: meterSchema, events: z.array(eventSchema).min(1).max(32), tempo: z.number().int().min(40).max(200).optional() });
export const annotationSchema = z.strictObject({ id: idSchema, targetId: idSchema, kind: z.enum(["text", "dynamic"]), text: z.string().trim().min(1).max(120) });
export const repeatSchema = z.strictObject({ id: idSchema, startMeasureId: idSchema, endMeasureId: idSchema, count: z.number().int().min(2).max(4) });
const scoreSchema = z.strictObject({ schemaVersion: z.literal(2), id: idSchema, revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), title: z.string().trim().min(1).max(100), tempo: z.number().int().min(40).max(200), measures: z.array(measureSchema).min(1).max(32), annotations: z.array(annotationSchema).max(128), repeats: z.array(repeatSchema).max(16) });
export type Fraction = { numerator: number; denominator: number };
export type Step = typeof STEPS[number];
export type Pitch = z.infer<typeof pitchSchema>;
export type Meter = z.infer<typeof meterSchema>;
export type ScoreEvent = z.infer<typeof eventSchema>;
export type Measure = z.infer<typeof measureSchema>;
export type Score = z.infer<typeof scoreSchema>;
export const meterName = (meter: Meter) => `${meter.numerator}/${meter.denominator}`;
export const measureCapacity = (meter: Meter) => meter.numerator * 4 / meter.denominator;
export const durationNotation = (duration: Fraction) => {
  const value = beats(duration);
  const dotted = [6, 3, 1.5, 0.75, 0.375].includes(value);
  return { base: dotted ? value / 1.5 : value, dotted };
};
export function measureStarts(score: Score) {
  let beat = 0;
  return score.measures.map((measure) => { const start = beat; beat += measureCapacity(measure.meter); return start; });
}
export function fraction(numerator: number, denominator = 1): Fraction {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error("Invalid musical duration.");
  }
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const divisor = gcd(Math.abs(numerator), denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

export function add(a: Fraction, b: Fraction): Fraction {
  return fraction(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);
}

export const beats = (value: Fraction) => value.numerator / value.denominator;
export const durationFromBeats = (value: number) => fraction(value * 8, 8);
export const pitchName = (pitch: Pitch | null) => pitch ? `${pitch.step}${pitch.alter === 1 ? "♯" : pitch.alter === -1 ? "♭" : ""}${pitch.octave}` : "Rest";
export const staffPosition = (pitch: Pitch) => pitch.octave * 7 + STEPS.indexOf(pitch.step);
export const midiPitch = (pitch: Pitch) => (pitch.octave + 1) * 12 + [0, 2, 4, 5, 7, 9, 11][STEPS.indexOf(pitch.step)] + pitch.alter;

export function movePitch(pitch: Pitch, steps: number): Pitch {
  const position = staffPosition(pitch) + steps;
  return { step: STEPS[((position % 7) + 7) % 7], alter: pitch.alter, octave: Math.floor(position / 7) };
}

export function locateEvent(score: Score, id: string) {
  for (let measureIndex = 0; measureIndex < score.measures.length; measureIndex++) {
    const measure = score.measures[measureIndex];
    const eventIndex = measure.events.findIndex((event) => event.id === id);
    if (eventIndex !== -1) return { measure, measureIndex, eventIndex, event: measure.events[eventIndex] };
  }
  throw new Error("That note is no longer in the score.");
}

// Migrate the original local document without changing IDs, notes or revision.
export function parseScore(value: unknown): Score {
  if (value && typeof value === "object" && "schemaVersion" in value && value.schemaVersion === 1) {
    const legacyEvent = eventSchema.omit({ articulation: true, measureRest: true, gap: true });
    const legacy = z.strictObject({ schemaVersion: z.literal(1), id: idSchema, revision: z.number().int().nonnegative(), title: z.string(), tempo: z.number(), measures: z.array(z.strictObject({ id: idSchema, events: z.array(legacyEvent) })) }).parse(value);
    value = { ...legacy, schemaVersion: 2, measures: legacy.measures.map((m) => ({ ...m, meter: { numerator: 4, denominator: 4 } })), annotations: [], repeats: [] };
  }
  const result = scoreSchema.safeParse(value);
  if (!result.success) throw new Error(`Invalid or unsupported score data: ${result.error.issues[0].path.join(".")} — ${result.error.issues[0].message}`);
  const score = result.data;
  const ids = new Set<string>();
  const addId = (id: string) => { if (ids.has(id)) throw new Error("Score IDs must be unique."); ids.add(id); };
  addId(score.id);
  const targets = new Set<string>();
  for (const measure of score.measures) {
    addId(measure.id); targets.add(measure.id);
    if (!(METERS as readonly string[]).includes(meterName(measure.meter))) throw new Error("Unsupported meter. Choose a listed time signature.");
    let total = fraction(0);
    for (const event of measure.events) {
      addId(event.id); targets.add(event.id);
      event.duration = fraction(event.duration.numerator, event.duration.denominator);
      if (event.measureRest && (event.pitch || measure.events.length !== 1)) throw new Error("A full-measure rest must occupy the measure alone.");
      if (event.gap && (event.pitch || event.measureRest || event.articulation)) throw new Error("An unfinished space cannot contain a note, rest, or articulation.");
      if (!event.measureRest && !DURATIONS.some((d) => d.value === beats(event.duration))) throw new Error("Unsupported duration; tuplets are not available yet.");
      if (!event.pitch && event.articulation && event.articulation !== "fermata") throw new Error("Only a fermata can be placed on a rest.");
      total = add(total, event.duration);
    }
    if (beats(total) !== measureCapacity(measure.meter)) throw new Error(`Each ${meterName(measure.meter)} measure must contain exactly ${measureCapacity(measure.meter)} quarter-note beats (four beats in 4/4).`);
  }
  const dynamicTargets = new Set<string>();
  for (const annotation of score.annotations) {
    addId(annotation.id);
    if (!targets.has(annotation.targetId)) throw new Error("An indication needs an existing note or measure anchor.");
    if (annotation.kind === "dynamic") {
      if (!(DYNAMICS as readonly string[]).includes(annotation.text)) throw new Error("Choose a dynamic from pp through ff.");
      if (dynamicTargets.has(annotation.targetId)) throw new Error("Only one dynamic may start at each anchor.");
      dynamicTargets.add(annotation.targetId);
    }
  }
  const occupied = new Set<number>();
  for (const repeat of score.repeats) {
    addId(repeat.id);
    const start = score.measures.findIndex((m) => m.id === repeat.startMeasureId), end = score.measures.findIndex((m) => m.id === repeat.endMeasureId);
    if (start < 0 || end < start) throw new Error("Repeat boundaries must reference an ordered measure range.");
    for (let i = start; i <= end; i++) {
      if (occupied.has(i)) throw new Error("Overlapping or nested repeats are not supported yet.");
      occupied.add(i);
    }
  }
  return score;
}

export function createExample(): Score {
  const phrases: [Step, number, number][][] = [
    [["C", 4, 1], ["E", 4, 1], ["G", 4, 1], ["E", 4, 1]],
    [["D", 4, 1], ["F", 4, 0.5], ["G", 4, 0.5], ["A", 4, 2]],
    [["G", 4, 1], ["E", 4, 1], ["D", 4, 1], ["E", 4, 1]],
    [["C", 4, 4]],
  ];
  return {
    schemaVersion: 2, id: "first-light", revision: 0, title: "First light", tempo: 88,
    annotations: [], repeats: [],
    measures: phrases.map((phrase, index) => ({
      id: `bar-${index + 1}`, meter: { numerator: 4, denominator: 4 },
      events: phrase.map(([step, octave, duration], note) => ({ id: `note-${index}-${note}`, pitch: { step, octave, alter: 0 }, duration: durationFromBeats(duration) })),
    })),
  };
}
