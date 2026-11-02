import { applyCommand, findPart, voiceBars, type Operation, type Score } from "@/modules/score";

/**
 * The score with one part's music taken out: its voices' bars, the slurs (which may join its
 * notes), and the dynamics and directions on its notes or its staves. What is left must not change
 * when that part's musician edits: other parts, chords, marks, the key, meter and tempo are the bandleader's.
 */
function withoutPart(score: Score, partId: string): unknown {
  const part = score.parts.find((p) => p.id === partId);
  const own = new Set(part?.staves.flatMap((staff) => staff.voices.map((voice) => voice.id)) ?? []);
  const staves = new Set(part?.staves.map((staff) => staff.id) ?? []);
  const notes = new Set(
    score.measures.flatMap((measure) =>
      voiceBars(measure)
        .filter((bar) => own.has(bar.voiceId))
        .flatMap((bar) => bar.events.map((event) => event.id)),
    ),
  );
  const theirs = (a: Score["annotations"][number]) => notes.has(a.targetId) || (a.staffId && staves.has(a.staffId));
  return {
    ...score,
    revision: 0,
    slurs: [],
    annotations: score.annotations.filter((a) => !theirs(a)),
    parts: score.parts.filter((p) => p.id !== partId),
    measures: score.measures.map((measure) => ({
      ...measure,
      bars: voiceBars(measure).filter((bar) => !own.has(bar.voiceId)),
      voices: undefined,
    })),
  };
}

/**
 * Why an edit by the musician playing `part` (a handle or ID) is refused, or null: it may change
 * its own part's music and nothing else. Checked on the result, so any operation is judged the
 * same way. An edit the score refuses anyway passes through, for the tool to report.
 */
export function refuseOutsidePart(score: Score, operation: Operation, part: string): string | null {
  const own = findPart(score, part);
  if (!own) return `There is no part ${part}.`;
  let after: Score;
  try {
    after = applyCommand(score, { requestId: "part-scope", expectedRevision: score.revision, operation });
  } catch {
    return null;
  }
  const same = JSON.stringify(withoutPart(score, own.id)) === JSON.stringify(withoutPart(after, own.id));
  return same
    ? null
    : `You play ${own.name} (${part}): write only its staves (name them, e.g. "bar 3 ${part}: …" or voiceId/staffId "${part}"). Other parts, chords, marks, key, meter and tempo are the bandleader's.`;
}
