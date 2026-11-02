import { midiPitch } from "../domain/pitch";
import { beats, soundingBeats } from "../domain/rhythm";
import type { Pitch, ScoreEvent } from "../domain/schema";
import { eventPitches } from "../domain/stacks";
import { DIVISIONS, drumDisplay, noteType } from "./musicxml-symbols";

/** What writing one voice of one bar needs, kept across its bars (ties) and the score (slurs). */
export type VoiceContext = {
  /** The voice's number in its part, and its staff (1-based) when the part has several. */
  voice: number;
  staff: number | null;
  /** A sounding pitch as the player reads it (a B♭ trumpet a tone higher). */
  written: (pitch: Pitch) => Pitch;
  /** The notes still sounding from a tie into this voice's next note (MIDI, as they sound). */
  held: number[];
  /** Slur numbers by the note that starts or ends them. */
  slurStarts: Map<string, number>;
  slurEnds: Map<string, number>;
  /** Directions (dynamics, text) to place before a note, by its ID. */
  before: Map<string, string[]>;
};

const NOTEHEADS: Record<string, string> = { x: "x", "circle-x": "circle-x", diamond: "diamond" };
const ARTICULATION_TAGS: Record<string, string> = { staccato: "staccato", accent: "accent", tenuto: "tenuto" };

const pitchXml = ({ step, alter, octave }: Pitch) =>
  `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${octave}</octave></pitch>`;

/** The voice's events in one bar as MusicXML notes; returns the XML and the bar's length in divisions. */
export function voiceXml(events: ScoreEvent[], context: VoiceContext): { xml: string; length: number } {
  const parts: string[] = [];
  let length = 0;
  events.forEach((event, i) => {
    parts.push(...(context.before.get(event.id) ?? []));
    const duration = Math.round(soundingBeats(event) * DIVISIONS);
    length += duration;
    const voice = `<voice>${context.voice}</voice>`;
    const staff = context.staff ? `<staff>${context.staff}</staff>` : "";
    if (event.measureRest) {
      parts.push(`<note><rest measure="yes"/><duration>${duration}</duration>${voice}${staff}</note>`);
      context.held = [];
      return;
    }
    const { type, dotted } = noteType(beats(event.duration));
    const look = `<type>${type}</type>${dotted ? "<dot/>" : ""}${event.tuplet ? "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>" : ""}`;
    const tuplet = tupletMark(events, i);
    if (!event.pitch && !event.drums?.length) {
      const marks = tuplet ? `<notations>${tuplet}</notations>` : "";
      parts.push(`<note><rest/><duration>${duration}</duration>${voice}${look}${staff}${marks}</note>`);
      context.held = [];
      return;
    }
    const sounding = eventPitches(event).map(midiPitch);
    const tiedIn = sounding.length > 0 && sounding.every((midi) => context.held.includes(midi));
    context.held = event.tie ? sounding : [];
    const marks = [
      tiedIn ? '<tied type="stop"/>' : "",
      event.tie ? '<tied type="start"/>' : "",
      context.slurEnds.has(event.id) ? `<slur type="stop" number="${context.slurEnds.get(event.id)}"/>` : "",
      context.slurStarts.has(event.id) ? `<slur type="start" number="${context.slurStarts.get(event.id)}"/>` : "",
      tuplet,
      event.articulation && ARTICULATION_TAGS[event.articulation]
        ? `<articulations><${ARTICULATION_TAGS[event.articulation]}/></articulations>`
        : "",
      event.articulation === "fermata" ? "<fermata/>" : "",
    ].join("");
    const ties = `${tiedIn ? '<tie type="stop"/>' : ""}${event.tie ? '<tie type="start"/>' : ""}`;
    const heads = event.drums?.length
      ? event.drums.map((piece) => {
          const { step, octave, head } = drumDisplay(piece);
          const notehead = NOTEHEADS[head] ? `<notehead>${NOTEHEADS[head]}</notehead>` : "";
          return {
            sound: `<unpitched><display-step>${step}</display-step><display-octave>${octave}</display-octave></unpitched>`,
            notehead,
          };
        })
      : eventPitches(event).map((pitch) => ({ sound: pitchXml(context.written(pitch)), notehead: "" }));
    heads.forEach(({ sound, notehead }, k) => {
      const chord = k ? "<chord/>" : "";
      const notations = !k && marks ? `<notations>${marks}</notations>` : "";
      parts.push(
        `<note>${chord}${sound}<duration>${duration}</duration>${event.drums ? "" : ties}${voice}${look}${notehead}${staff}${notations}</note>`,
      );
    });
  });
  return { xml: parts.join(""), length };
}

/** The start or stop of a triplet's bracket on this note, when it begins or ends a group. */
function tupletMark(events: ScoreEvent[], i: number): string {
  const id = events[i].tuplet?.id;
  if (!id) return "";
  const first = events[i - 1]?.tuplet?.id !== id;
  const last = events[i + 1]?.tuplet?.id !== id;
  return `${first ? '<tuplet type="start"/>' : ""}${last ? '<tuplet type="stop"/>' : ""}`;
}
