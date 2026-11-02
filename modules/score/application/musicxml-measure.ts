import { isDrumKit } from "../domain/instruments";
import { DYNAMICS } from "../domain/notation";
import { isStartMark, MARK_LABELS } from "../domain/navigation";
import type { Annotation, KeySignature, Measure, Part, Score, ScoreEvent } from "../domain/schema";
import type { Transposition } from "../domain/instruments";
import type { VoiceContext } from "./musicxml-notes";
import { DIVISIONS, clefXml, escapeXml } from "./musicxml-symbols";

const OCTAVE_STEPS = 7;
const OCTAVE = 12;

const direction = (inner: string, placement: "above" | "below", where = "", sound = "") =>
  `<direction placement="${placement}"><direction-type>${inner}</direction-type>${where}${sound}</direction>`;

/** A part's attributes at its first bar (or where the meter changes): divisions, key, time, staves, clefs, transposition. */
export function attributesXml(
  part: Part,
  measure: Measure,
  first: boolean,
  key: KeySignature,
  t: Transposition | null,
): string {
  const time = `<time><beats>${measure.meter.numerator}</beats><beat-type>${measure.meter.denominator}</beat-type></time>`;
  if (!first) return `<attributes>${time}</attributes>`;
  const staves = part.staves.length > 1 ? `<staves>${part.staves.length}</staves>` : "";
  const clefs = part.staves.map((staff, s) => clefXml(staff.clef, part.staves.length > 1 ? s + 1 : undefined)).join("");
  const keyXml = isDrumKit(part.instrument) ? "" : `<key><fifths>${key.fifths}</fifths><mode>${key.mode}</mode></key>`;
  return `<attributes><divisions>${DIVISIONS}</divisions>${keyXml}${time}${staves}${clefs}${transposeXml(t)}</attributes>`;
}

/** How the part is written against its sound, as MusicXML counts it (down from the written note). */
function transposeXml(t: Transposition | null): string {
  if (!t) return "";
  const octaves = Math.trunc(t.steps / OCTAVE_STEPS);
  const diatonic = t.steps - octaves * OCTAVE_STEPS;
  const chromatic = t.semitones - octaves * OCTAVE;
  const change = octaves ? `<octave-change>${-octaves}</octave-change>` : "";
  return `<transpose><diatonic>${-diatonic}</diatonic><chromatic>${-chromatic}</chromatic>${change}</transpose>`;
}

/** At a bar's start (on the first part): tempo, rehearsal mark, segno or coda. */
export function startDirections(score: Score, measure: Measure, index: number): string[] {
  const out: string[] = [];
  const tempo = index === 0 ? score.tempo : measure.tempo;
  if (tempo) {
    const metronome = `<metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome>`;
    out.push(direction(metronome, "above", "", `<sound tempo="${tempo}"/>`));
  }
  if (measure.section) out.push(direction(`<rehearsal>${escapeXml(measure.section)}</rehearsal>`, "above"));
  for (const mark of score.marks.filter((m) => m.measureId === measure.id && isStartMark(m.kind))) {
    out.push(direction(mark.kind === "segno" ? "<segno/>" : "<coda/>", "above"));
  }
  return out;
}

/** At a bar's end (on the first part): Fine, To Coda, D.C. and D.S. as words. */
export function endDirections(score: Score, measure: Measure): string[] {
  return score.marks
    .filter((m) => m.measureId === measure.id && !isStartMark(m.kind))
    .map((m) => direction(`<words>${escapeXml(MARK_LABELS[m.kind])}</words>`, "above"));
}

/** A repeat that starts at this bar: its forward barline. */
export function repeatStart(score: Score, measure: Measure): string[] {
  return score.repeats
    .filter((r) => r.startMeasureId === measure.id)
    .map(() => '<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>');
}

/** The bar's right barline: a repeat's end (with its passes), or the final barline. */
export function barlineEnd(score: Score, measure: Measure, last: boolean): string[] {
  const end = score.repeats.find((r) => r.endMeasureId === measure.id);
  if (end) {
    const times = end.count > 2 ? ` times="${end.count}"` : "";
    return [
      `<barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"${times}/></barline>`,
    ];
  }
  return last ? ['<barline location="right"><bar-style>light-heavy</bar-style></barline>'] : [];
}

/** A dynamic or a text indication as a MusicXML direction, in its staff. */
function annotationXml(annotation: Annotation, where: string): string {
  if (annotation.kind === "dynamic" && (DYNAMICS as readonly string[]).includes(annotation.text)) {
    return direction(`<dynamics><${annotation.text}/></dynamics>`, "below", where);
  }
  return direction(`<words>${escapeXml(annotation.text)}</words>`, "above", where);
}

/**
 * The directions to place before each note of one voice's bar: those on its notes, and (on a
 * staff's first voice) those on the bar for this staff, or for the whole bar on the first staff.
 */
export function directionsBefore(
  score: Score,
  measure: Measure,
  events: ScoreEvent[],
  staffId: string,
  firstStaff: boolean,
  firstVoice: boolean,
  context: VoiceContext,
): Map<string, string[]> {
  const where = context.staff ? `<staff>${context.staff}</staff>` : "";
  const before = new Map<string, string[]>();
  for (const annotation of score.annotations) {
    const onBar =
      annotation.targetId === measure.id &&
      firstVoice &&
      (annotation.staffId ? annotation.staffId === staffId : firstStaff);
    const target = onBar ? events[0].id : annotation.targetId;
    if (!onBar && !events.some((event) => event.id === target)) continue;
    before.set(target, [...(before.get(target) ?? []), annotationXml(annotation, where)]);
  }
  return before;
}
