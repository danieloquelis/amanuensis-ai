import type { SpeechTurn, SungSpan, VoiceTake } from "./take";

/** One moment of a take, in order: words said, or a stretch sung (seconds). */
export type TakePart = { kind: "said"; text: string } | { kind: "sang"; seconds: number };

const round = (seconds: number) => Math.round(seconds * 100) / 100;
const time = (span: { start: number; end: number }) => `${span.start.toFixed(1)}–${span.end.toFixed(1)} s`;

/** What the musician said and sang, in the order they did it; turns left without words are skipped. */
export function takeParts(speech: SpeechTurn[], sung: SungSpan[]): TakePart[] {
  const said = speech
    .filter((turn) => turn.text.trim())
    .map((turn) => ({ at: turn.start, part: { kind: "said", text: turn.text.trim() } as TakePart }));
  const sang = sung.map((span) => ({
    at: span.start,
    part: { kind: "sang", seconds: round(span.end - span.start) } as TakePart,
  }));
  return [...said, ...sang].sort((a, b) => a.at - b.at).map((entry) => entry.part);
}

/**
 * The take as the agent reads it: what was said and where singing happened, in time order.
 * `"…"` marks words; sung spans carry the ID the voice tools take. The rest of the voice follows
 * on one line, for when the words say they sang somewhere no sung span covers.
 */
export function describeTake(take: VoiceTake): string {
  const said = take.speech
    .filter((t) => t.text.trim())
    .map((t) => ({ at: t.start, line: `${time(t)} said: "${t.text}"` }));
  const sang = take.sung.map((s) => ({ at: s.start, line: `${time(s)} sang: ${s.id} (${round(s.end - s.start)} s)` }));
  const lines = [...said, ...sang].sort((a, b) => a.at - b.at).map((e) => e.line);
  const length = round(take.signal.samples.length / take.signal.sampleRate);
  const other = take.voice.map((v) => `${v.id} ${time(v)}`).join(" · ");
  return [
    `[Voice take, ${length} s]`,
    ...(lines.length ? lines : ["(nothing heard)"]),
    ...(other ? [`other voice, not heard as singing: ${other}`] : []),
  ].join("\n");
}
