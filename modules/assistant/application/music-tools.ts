import {
  findTempoMarking,
  keyName,
  measureCapacity,
  parseChordSymbol,
  rankKeysForChords,
  TEMPO_MARKINGS,
  tempoMarkingFor,
  typicalTempo,
  type ChordSymbol,
  type KeyCandidate,
} from "@/modules/score";
import {
  rankKeysForMelody,
  rankTempi,
  segmentNotes,
  spanSignal,
  trackPitch,
  transcribeMelody,
  type VoiceTake,
} from "@/modules/voice";
import type { ToolSpec } from "./model-port";
import { inferKeySchema, inferTempoSchema, transcribeSchema } from "./music-tool-schemas";
import { toolError } from "./score-tool-gateway";
import { toolParameters } from "./tool-definitions";

export const MUSIC_TOOL_NAMES = ["music_infer_key", "music_infer_tempo", "voice_transcribe_melody"] as const;
export type MusicToolName = (typeof MUSIC_TOOL_NAMES)[number];
type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };

/** Keys this close in score are a toss-up the musician should settle. */
const CLEAR_MARGIN = 0.5;
/** Melody evidence counts for less than chords: a tune can sit on any degree of its key. */
const MELODY_WEIGHT = 0.5;
const SHOWN_CANDIDATES = 3;

const specs: Record<MusicToolName, ToolSpec> = {
  music_infer_key: {
    name: "music_infer_key",
    description:
      "Work out the key from chord symbols and/or a sung span, with ranked candidates and reasons. Use it when the musician didn't name a key. If `clear` is false, ask them.",
    parameters: toolParameters(inferKeySchema),
  },
  music_infer_tempo: {
    name: "music_infer_tempo",
    description:
      "Quarter-note BPM from a tempo word (Allegro…) and/or the timing of a sung span; with both, the singing picks a tempo within the word's range. A spoken number needs no tool: use it.",
    parameters: toolParameters(inferTempoSchema),
  },
  voice_transcribe_melody: {
    name: "voice_transcribe_melody",
    description:
      "Turn a sung span into bars of notes and rests, ready for replaceMeasure events. Settle bpm, key and chords first; say what the tune is (snapToChordTones for arpeggios). Returns doubtful notes with their other reading.",
    parameters: toolParameters(transcribeSchema),
  },
};

/** Tools for this turn: voice tools only when there is a take to listen to. */
export const musicToolSpecs = (hasTake: boolean): ToolSpec[] =>
  MUSIC_TOOL_NAMES.filter((name) => hasTake || !name.startsWith("voice_")).map((name) => specs[name]);

export const isMusicTool = (name: string): name is MusicToolName =>
  (MUSIC_TOOL_NAMES as readonly string[]).includes(name);

function parseChords(symbols: string[]): ChordSymbol[] {
  return symbols.map((symbol) => {
    const chord = parseChordSymbol(symbol);
    if (!chord) throw new Error(`"${symbol}" is not a chord symbol I know.`);
    return chord;
  });
}

/** Read-only music analysis for one turn. Every call is local and deterministic. */
export function createMusicTools(take: VoiceTake | null) {
  const sungNotes = (id: string) => {
    const signal = take && spanSignal(take, id);
    if (!signal) throw new Error(`There is no sung span ${id}${take ? "" : " (no voice take this turn)"}.`);
    return segmentNotes(trackPitch(signal));
  };

  const handlers: Record<MusicToolName, (raw: unknown) => ToolResult> = {
    music_infer_key(raw) {
      const args = inferKeySchema.parse(raw);
      if (!args.chords?.length && !args.spanId) throw new Error("Give chords, a sung span, or both.");
      const fromChords = args.chords?.length ? rankKeysForChords(parseChords(args.chords)) : [];
      const fromMelody = args.spanId ? rankKeysForMelody(sungNotes(args.spanId)) : [];
      const ranked = combine(fromChords, fromMelody);
      const [first, second] = ranked;
      const sameSignature = second && second.key.fifths === first.key.fifths;
      return {
        ok: true,
        candidates: ranked
          .slice(0, SHOWN_CANDIDATES)
          .map(({ key, name, score, evidence }) => ({ key, name, score, evidence })),
        clear: !second || first.score - second.score >= CLEAR_MARGIN || sameSignature,
        ...(sameSignature ? { note: `${first.name} and ${second.name} share a key signature.` } : {}),
      };
    },

    music_infer_tempo(raw) {
      const args = inferTempoSchema.parse(raw);
      const marking = args.marking ? findTempoMarking(args.marking) : null;
      if (args.marking && !marking) {
        throw new Error(`Unknown tempo word. Known: ${TEMPO_MARKINGS.map((m) => m.name).join(", ")}.`);
      }
      if (!args.spanId) {
        if (!marking) throw new Error("Give a tempo word, a sung span, or both.");
        return { ok: true, bpm: typicalTempo(marking), range: [marking.min, marking.max], source: "marking" };
      }
      const [best, ...others] = rankTempi(sungNotes(args.spanId), marking ?? undefined);
      return {
        ok: true,
        bpm: best.bpm,
        marking: (marking ?? tempoMarkingFor(best.bpm)).name,
        alternatives: others.slice(0, 2).map((c) => c.bpm),
        source: marking ? "singing, within the marking" : "singing",
      };
    },

    voice_transcribe_melody(raw) {
      const args = transcribeSchema.parse(raw);
      const signal = take && spanSignal(take, args.spanId);
      if (!signal) throw new Error(`There is no sung span ${args.spanId}.`);
      const capacity = measureCapacity(args.meter ?? { numerator: 4, denominator: 4 });
      const chords = args.chords?.map(({ bar, beat, symbol }) => ({
        beat: (bar - 1) * capacity + beat,
        ...parseChords([symbol])[0],
      }));
      const { bpm, meter, key, startBeat, snapToChordTones } = args;
      const result = transcribeMelody(signal, { bpm, meter, key, chords, startBeat, snapToChordTones });
      return {
        ok: true,
        bars: result.bars,
        key: keyName(result.key),
        keyWasGiven: result.keyWasGiven,
        ...(result.transposedBy ? { transposedBySemitones: result.transposedBy } : {}),
        startBeat: result.startBeat,
        startBeatSure: result.startBeatSure,
        uncertain: result.uncertain,
        ...(result.octaveShift ? { writtenOctavesHigher: result.octaveShift } : {}),
        warnings: result.warnings,
      };
    },
  };

  return (name: MusicToolName, raw: unknown): ToolResult => {
    try {
      return handlers[name](raw);
    } catch (error) {
      return { ok: false, error: toolError(error) };
    }
  };
}

/** Chord ranking, nudged by how well each key fits the melody (or the melody ranking alone). */
function combine(fromChords: KeyCandidate[], fromMelody: KeyCandidate[]): KeyCandidate[] {
  if (!fromChords.length) return fromMelody;
  if (!fromMelody.length) return fromChords;
  const melodyFit = new Map(fromMelody.map((c) => [c.name, c.score]));
  return fromChords
    .map((c) => {
      const fit = melodyFit.get(c.name) ?? 0;
      return {
        ...c,
        score: Math.round((c.score + MELODY_WEIGHT * fit) * 100) / 100,
        evidence: [...c.evidence, `melody fit ${fit}`],
      };
    })
    .sort((a, b) => b.score - a.score);
}
