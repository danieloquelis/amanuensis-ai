import {
  findTempoMarking,
  measureCapacity,
  parseChordSymbol,
  rankKeysForChords,
  TEMPO_MARKINGS,
  tempoMarkingFor,
  typicalTempo,
  type ChordSymbol,
  type KeyCandidate,
} from "@/modules/score";
import { rankKeysForMelody, reportTempo, segmentNotes, spanFrames, type VoiceTake } from "@/modules/voice";
import type { ToolSpec } from "./model-port";
import { hearNotesSchema, inferKeySchema, inferTempoSchema, transcribeSchema } from "./music-tool-schemas";
import { hearNotes } from "./voice-listen-tool";
import { transcribeIntoScore, type ScoreAccess } from "./voice-transcription-tool";
import { toolError } from "./score-tool-gateway";
import { toolParameters } from "./tool-definitions";

export const MUSIC_TOOL_NAMES = [
  "music_infer_key",
  "music_infer_tempo",
  "voice_hear_notes",
  "voice_transcribe_melody",
] as const;
export type MusicToolName = (typeof MUSIC_TOOL_NAMES)[number];
type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };

/** Keys this close in score are a toss-up the musician should settle. */
const CLEAR_MARGIN = 0.5;
/** Melody evidence counts for less than chords: a tune can sit on any degree of its key. */
const MELODY_WEIGHT = 0.5;
const SHOWN_CANDIDATES = 3;
/** Bars are read as 4/4 when there is no score to take the meter from. */
const DEFAULT_BAR_BEATS = 4;

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
      "Quarter-note BPM from a tempo word (Allegro…) and/or the timing of the sung spans, read with a beat that follows the singer's drift; with both, the singing picks a tempo within the word's range. Also says how the same singing fits double and half time: only their words or the style settle that. A spoken number needs no tool: use it.",
    parameters: toolParameters(inferTempoSchema),
  },
  voice_hear_notes: {
    name: "voice_hear_notes",
    description:
      "The notes heard in one sung span, as sung (time, pitch, length, how clearly). Read-only. Use it to check the raw singing when a transcription looks wrong, e.g. to count notes per bar or spot a repeated figure.",
    parameters: toolParameters(hearNotesSchema),
  },
  voice_transcribe_melody: {
    name: "voice_transcribe_melody",
    description:
      "Hear the sung spans and write them into the score, each from its bar, in one call. Settle bpm, key and chords first; say what the tune is (snapToChordTones for arpeggios). Returns the bars written, doubtful notes, and per-bar evidence (confidence, corrections, bars with a similar rhythm) for your review.",
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

/**
 * Music analysis for one turn, local and deterministic. With score access, transcription also
 * writes what it heard into the score.
 */
export function createMusicTools(take: VoiceTake | null, access: ScoreAccess | null = null) {
  const sungNotes = (id: string) => {
    const frames = take && spanFrames(take, id);
    if (!frames) throw new Error(`There is no sung span ${id}${take ? "" : " (no voice take this turn)"}.`);
    return segmentNotes(frames);
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
      if (!args.spanIds?.length) {
        if (!marking) throw new Error("Give a tempo word, sung spans, or both.");
        return { ok: true, bpm: typicalTempo(marking), range: [marking.min, marking.max], source: "marking" };
      }
      // Each span is timed on its own (speech sits between them), with a beat that may drift.
      const meter = access?.getScore().measures[0]?.meter;
      const report = reportTempo(
        args.spanIds.map((id) => sungNotes(id).map((note) => note.start)),
        {
          barBeats: meter ? measureCapacity(meter) : DEFAULT_BAR_BEATS,
          bpm: marking ? typicalTempo(marking) : undefined,
          range: marking ? { min: marking.min, max: marking.max } : undefined,
          bars: args.bars,
        },
      );
      return {
        ok: true,
        bpm: report.bpm,
        marking: (marking ?? tempoMarkingFor(report.bpm)).name,
        drift: `${report.drift[0]}–${report.drift[1]} BPM`,
        alternatives: report.alternatives.map((a) => `${a.bpm} BPM: ${a.fit} from the timing alone`),
        source: marking ? "singing, within the marking" : "singing",
      };
    },

    voice_hear_notes(raw) {
      return { ok: true, ...hearNotes(take, hearNotesSchema.parse(raw).spanId) };
    },

    voice_transcribe_melody(raw) {
      return transcribeIntoScore(take, raw, access);
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
