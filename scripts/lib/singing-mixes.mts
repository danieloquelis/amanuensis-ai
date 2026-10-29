// Mixed takes built from real recordings, with every moment's truth known: pieces of talk-only
// takes and of all-sung takes laid end to end ("talk, sing 2 s, talk, sing 5 s, talk"), with
// pauses from none to most of a second between them. Each piece keeps the words the recognizer
// wrote for it, moved to where the piece now sits.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeWav, trackPitch, type Signal, type SpeechTurn } from "@/modules/voice";
import { ALL_SPOKEN, ALL_SUNG } from "./singing-labels.mjs";
import { readRawSpeech } from "./takes.mjs";

const ROOT = ".takes";
const RATE = 16_000;
/** Pauses between pieces (seconds); none at all is the hardest case. */
const GAPS = [0, 0, 0.15, 0.4, 0.8];
const SUNG_LENGTHS = [2, 5];

export type Piece = { source: string; kind: "talk" | "sung"; samples: Float32Array; speech: SpeechTurn[] };
export type Mix = {
  signal: Signal;
  speech: SpeechTurn[];
  /** What each stretch is, in order (seconds). Gaps between them are silence. */
  truth: { kind: "talk" | "sung"; start: number; end: number; source: string }[];
};

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The voiced part of a take (first to last voice), with its words. */
function piece(prefix: string, kind: Piece["kind"]): Piece {
  const folder = join(
    ROOT,
    readdirSync(ROOT).find((name) => name.startsWith(prefix))!,
  );
  const signal = decodeWav(new Uint8Array(readFileSync(join(folder, "take.wav"))));
  if (signal.sampleRate !== RATE) throw new Error(`${prefix} is not ${RATE} Hz.`);
  const voiced = trackPitch(signal).filter((f) => f.frequency !== null);
  const from = Math.max(0, voiced[0].time - 0.1);
  const to = voiced.at(-1)!.time + 0.1;
  const speech = readRawSpeech(folder)
    .filter((t) => t.end > from && t.start < to)
    .map((t) => ({ ...t, start: Math.max(0, t.start - from), end: Math.min(to, t.end) - from }));
  const samples = signal.samples.slice(Math.floor(from * RATE), Math.ceil(to * RATE));
  return { source: prefix, kind, samples, speech };
}

/** A stretch of a sung piece about `seconds` long, from a random place in it. */
function crop(sung: Piece, seconds: number, rand: () => number): Piece {
  const length = Math.min(sung.samples.length, Math.round(seconds * RATE));
  const from = Math.floor(rand() * (sung.samples.length - length));
  const [start, end] = [from / RATE, (from + length) / RATE];
  const speech = sung.speech
    .filter((t) => t.end > start && t.start < end)
    .map((t) => ({ ...t, start: Math.max(0, t.start - start), end: Math.min(end, t.end) - start }));
  return { ...sung, samples: sung.samples.slice(from, from + length), speech };
}

export function loadPieces(): { talk: Piece[]; sung: Piece[] } {
  return { talk: ALL_SPOKEN.map((p) => piece(p, "talk")), sung: ALL_SUNG.map((p) => piece(p, "sung")) };
}

/** `count` mixes of talk, sung, talk, sung, talk from the given pieces. */
export function buildMixes(pieces: { talk: Piece[]; sung: Piece[] }, count: number, seed: number): Mix[] {
  const rand = random(seed);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  return Array.from({ length: count }, () => {
    const order = [
      pick(pieces.talk),
      crop(pick(pieces.sung), SUNG_LENGTHS[0], rand),
      pick(pieces.talk),
      crop(pick(pieces.sung), SUNG_LENGTHS[1], rand),
      pick(pieces.talk),
    ];
    const parts: Float32Array[] = [];
    const truth: Mix["truth"] = [];
    const speech: SpeechTurn[] = [];
    let at = 0.3;
    parts.push(new Float32Array(Math.round(at * RATE)));
    order.forEach((p, i) => {
      truth.push({ kind: p.kind, start: at, end: at + p.samples.length / RATE, source: p.source });
      for (const t of p.speech) speech.push({ ...t, start: t.start + at, end: t.end + at });
      parts.push(p.samples);
      at += p.samples.length / RATE;
      const gap = i < order.length - 1 ? pick(GAPS) : 0.3;
      parts.push(new Float32Array(Math.round(gap * RATE)));
      at += Math.round(gap * RATE) / RATE;
    });
    const samples = new Float32Array(parts.reduce((sum, p) => sum + p.length, 0));
    let offset = 0;
    for (const p of parts) {
      samples.set(p, offset);
      offset += p.length;
    }
    return { signal: { samples, sampleRate: RATE }, speech, truth };
  });
}
