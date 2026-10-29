// Scores a reading of a mixed take against its truth: voice labeled right, and how far each
// true switch between talk and singing is from the nearest one found.
import type { PitchFrame } from "@/modules/voice";
import type { Mix } from "./singing-mixes.mjs";

/** A switch found further than this (seconds) from the true one is missed. */
const MISSED_SECONDS = 1;

export type BoundaryScore = {
  frames: number;
  right: number;
  errors: number[];
  missed: number;
  extra: number;
  wanted: number;
};

export const emptyScore = (): BoundaryScore => ({ frames: 0, right: 0, errors: [], missed: 0, extra: 0, wanted: 0 });

type Switch = { kind: "on" | "off"; time: number };

function switches(frames: PitchFrame[], sung: (boolean | null)[]): Switch[] {
  const found: Switch[] = [];
  let previous: { time: number; sung: boolean } | null = null;
  frames.forEach((frame, i) => {
    const now = sung[i];
    if (now === null) return;
    if (now && !previous?.sung) found.push({ kind: "on", time: frame.time });
    if (!now && previous?.sung) found.push({ kind: "off", time: previous.time + 0.01 });
    previous = { time: frame.time, sung: now };
  });
  const last = previous as { time: number; sung: boolean } | null;
  if (last?.sung) found.push({ kind: "off", time: last.time + 0.01 });
  return found;
}

/** Adds one mix's reading (sung or not per voiced frame, null without voice) to `into`. */
export function scoreMix(mix: Mix, frames: PitchFrame[], sung: (boolean | null)[], into: BoundaryScore) {
  frames.forEach((frame, i) => {
    const truth = mix.truth.find((t) => frame.time >= t.start && frame.time < t.end);
    if (!truth || sung[i] === null) return;
    into.frames++;
    into.right += Number(sung[i] === (truth.kind === "sung"));
  });
  const wanted: Switch[] = [];
  for (const part of mix.truth.filter((t) => t.kind === "sung")) {
    const voiced = frames.filter((f) => f.frequency !== null && f.time >= part.start && f.time < part.end);
    if (!voiced.length) continue;
    wanted.push({ kind: "on", time: voiced[0].time }, { kind: "off", time: voiced.at(-1)!.time + 0.01 });
  }
  const found = switches(frames, sung);
  into.wanted += wanted.length;
  for (const truth of wanted) {
    const nearest = found
      .filter((s) => s.kind === truth.kind)
      .sort((a, b) => Math.abs(a.time - truth.time) - Math.abs(b.time - truth.time))[0];
    if (!nearest || Math.abs(nearest.time - truth.time) > MISSED_SECONDS) {
      into.missed++;
      continue;
    }
    into.errors.push(Math.abs(nearest.time - truth.time));
    found.splice(found.indexOf(nearest), 1);
  }
  into.extra += found.length;
}

export const within = (score: BoundaryScore, seconds: number) =>
  score.errors.filter((e) => e <= seconds).length / Math.max(1, score.wanted);

export function describeScore(score: BoundaryScore): string {
  const percent = (x: number) => `${Math.round(100 * x)}%`;
  return [
    `voice labeled right ${((100 * score.right) / score.frames).toFixed(1)}%`,
    `switches within 0.1 s ${percent(within(score, 0.1))}, within 0.25 s ${percent(within(score, 0.25))}`,
    `missed ${score.missed}/${score.wanted}, extra ${score.extra}`,
  ].join(" · ");
}
