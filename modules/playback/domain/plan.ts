import { beats, measureStarts, midiPitch, type Score } from "../../score/domain/score";

const dynamicGain: Record<string, number> = { pp: 0.045, p: 0.07, mp: 0.1, mf: 0.14, f: 0.19, ff: 0.24 };

export function createPlaybackPlan(score: Score) {
  const starts = measureStarts(score);
  // Resolve written context before unfolding repeats; jumps restore context at the repeat start.
  let tempo = score.tempo, gain = dynamicGain.mf;
  const written = score.measures.map((measure, measureIndex) => {
    tempo = measure.tempo ?? tempo;
    const measureDynamic = score.annotations.find((a) => a.targetId === measure.id && a.kind === "dynamic");
    if (measureDynamic) gain = dynamicGain[measureDynamic.text];
    let localBeat = 0;
    return measure.events.map((event) => {
      const dynamic = score.annotations.find((a) => a.targetId === event.id && a.kind === "dynamic");
      if (dynamic) gain = dynamicGain[dynamic.text];
      const duration = beats(event.duration) * 60 / tempo * (event.articulation === "fermata" ? 1.5 : 1);
      const entry = { id: event.id, beat: starts[measureIndex] + localBeat, beats: beats(event.duration), duration, frequency: event.pitch ? 440 * 2 ** ((midiPitch(event.pitch) - 69) / 12) : null, gain: gain * (event.articulation === "accent" ? 1.3 : 1), gate: event.articulation === "staccato" ? 0.45 : event.articulation === "tenuto" ? 1 : 0.93 };
      localBeat += beats(event.duration);
      return entry;
    });
  });
  const order: number[] = [];
  for (let i = 0; i < score.measures.length; i++) {
    const repeat = score.repeats.find((r) => r.startMeasureId === score.measures[i].id);
    if (repeat) {
      const end = score.measures.findIndex((m) => m.id === repeat.endMeasureId);
      for (let pass = 0; pass < repeat.count; pass++) for (let bar = i; bar <= end; bar++) order.push(bar);
      i = end;
    } else order.push(i);
  }
  let time = 0;
  const events = order.flatMap((index) => written[index].map((event) => {
    const entry = { ...event, start: time };
    time += event.duration;
    return entry;
  }));
  return { events, duration: time, secondsPerBeat: 60 / score.tempo };
}
