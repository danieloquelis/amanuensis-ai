import { GENERAL_MIDI_PROGRAM, INSTRUMENTS, isDrumKit } from "../domain/instruments";
import { scoreKey } from "../domain/key";
import { measureCapacity, meterName } from "../domain/rhythm";
import type { KeySignature, Part, Score } from "../domain/schema";
import { toWritten, transpositionOf, writtenKey } from "../domain/transposition";
import { barEvents } from "../domain/voice-access";
import {
  attributesXml,
  barlineEnd,
  directionsBefore,
  endDirections,
  repeatStart,
  startDirections,
} from "./musicxml-measure";
import { voiceXml, type VoiceContext } from "./musicxml-notes";
import { DIVISIONS, escapeXml, harmonyXml } from "./musicxml-symbols";

const PERCUSSION_CHANNEL = 10;
/** MusicXML numbers slurs that overlap; six is plenty for one part. */
const SLUR_NUMBERS = 6;
const HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">`;

/**
 * The score as MusicXML 4.0 (partwise), for other notation programs: every part with its staves
 * and voices, written as its player reads it (a transposing part with its transposition), with
 * key, meter, clefs, tempo, rehearsal and navigation marks, chord symbols, dynamics and text,
 * ties, triplets, slurs, articulations and repeats.
 */
export function scoreToMusicXml(score: Score): string {
  const list = score.parts.map((part, i) => partListXml(part, i)).join("");
  const parts = score.parts.map((part, i) => partXml(score, part, i)).join("\n");
  const title = escapeXml(score.title);
  return `${HEADER}
<score-partwise version="4.0"><work><work-title>${title}</work-title></work><identification><encoding><software>Amanuensis</software></encoding></identification><part-list>${list}</part-list>
${parts}
</score-partwise>
`;
}

function partListXml(part: Part, i: number): string {
  const id = `P${i + 1}`;
  const drums = isDrumKit(part.instrument);
  const channel = drums ? PERCUSSION_CHANNEL : (i % 15) + (i % 15 >= PERCUSSION_CHANNEL - 1 ? 2 : 1);
  const program = drums ? "" : `<midi-program>${GENERAL_MIDI_PROGRAM[part.instrument] + 1}</midi-program>`;
  const abbreviation = part.abbreviation
    ? `<part-abbreviation>${escapeXml(part.abbreviation)}</part-abbreviation>`
    : "";
  return `<score-part id="${id}"><part-name>${escapeXml(part.name)}</part-name>${abbreviation}<score-instrument id="${id}-I1"><instrument-name>${escapeXml(INSTRUMENTS[part.instrument].name)}</instrument-name></score-instrument><midi-instrument id="${id}-I1"><midi-channel>${channel}</midi-channel>${program}</midi-instrument></score-part>`;
}

function partXml(score: Score, part: Part, index: number): string {
  const concertKey = scoreKey(score);
  const t = transpositionOf(part.instrument);
  const drums = isDrumKit(part.instrument);
  const key: KeySignature = drums ? { fifths: 0, mode: "major" } : t ? writtenKey(concertKey, t) : concertKey;
  const slurStarts = new Map(score.slurs.map((s, n) => [s.startEventId, (n % SLUR_NUMBERS) + 1]));
  const slurEnds = new Map(score.slurs.map((s, n) => [s.endEventId, (n % SLUR_NUMBERS) + 1]));
  const contexts = new Map<string, VoiceContext>();
  part.staves.forEach((staff, s) =>
    staff.voices.forEach((voice, v) =>
      contexts.set(voice.id, {
        voice: s * 4 + v + 1,
        staff: part.staves.length > 1 ? s + 1 : null,
        written: (pitch) => (t ? toWritten(pitch, t, concertKey) : pitch),
        held: [],
        slurStarts,
        slurEnds,
        before: new Map(),
      }),
    ),
  );
  const measures = score.measures.map((measure, i) => {
    const out: string[] = [];
    const lead = index === 0;
    // A bar opens with its repeat barline, then its attributes, then what is marked over it.
    out.push(...repeatStart(score, measure));
    const previous = score.measures[i - 1]?.meter;
    const meterChanged = !previous || meterName(previous) !== meterName(measure.meter);
    if (meterChanged) out.push(attributesXml(part, measure, i === 0, key, t));
    if (lead) out.push(...startDirections(score, measure, i));
    if (lead) {
      for (const chord of score.chords.filter((c) => c.measureId === measure.id).sort((a, b) => a.beat - b.beat)) {
        out.push(harmonyXml(chord, Math.round(chord.beat * DIVISIONS)));
      }
    }
    // Voice after voice, each from the bar's start: a backup returns there before the next one.
    let first = true;
    part.staves.forEach((staff, s) =>
      staff.voices.forEach((voice, v) => {
        const events = barEvents(measure, voice.id);
        if (!events.length) return;
        const context = contexts.get(voice.id)!;
        context.before = directionsBefore(score, measure, events, staff.id, s === 0 && v === 0, v === 0, context);
        if (!first) out.push(`<backup><duration>${measureCapacity(measure.meter) * DIVISIONS}</duration></backup>`);
        out.push(voiceXml(events, context).xml);
        first = false;
      }),
    );
    if (lead) out.push(...endDirections(score, measure));
    out.push(...barlineEnd(score, measure, i === score.measures.length - 1));
    return `<measure number="${i + 1}">${out.join("")}</measure>`;
  });
  return `<part id="P${index + 1}">${measures.join("\n")}</part>`;
}
