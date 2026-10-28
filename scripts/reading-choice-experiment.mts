// Experiment: can the agent pick the right reading of a sung take from a few complete readings?
// Compares Muse Spark alone, Jev alone, and Spark deciding with Jev's probabilities, on takes
// that have a truth.json. Paid (tiny): reads META_AI_API_KEY, META_AI_MODEL, TYPESAFE_API_KEY.
// Usage: yarn experiment:readings --confirm [--runs 5]
import { createMetaModel } from "@/modules/assistant/server";
import { pitchName } from "@/modules/score";
import {
  createTake,
  decodeWav,
  rankTempi,
  segmentNotes,
  spanSignal,
  trackPitch,
  transcribeMelody,
} from "@/modules/voice";
import { cachedRecognizer, createMuseTranscriber } from "@/modules/voice/server";
import { chordsByBar, compareBars, keyFromName, loadTakeWav, readHeardSpeech, readTruth } from "./lib/takes.mjs";

const TAKES = [".takes/2026-10-27-el-muelle-memo", ".takes/2026-10-28T00-08-36-726Z"];
const runs = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 5;
if (!process.argv.includes("--confirm")) {
  console.log(
    `Paid: per take, ${runs} Spark calls alone, ${runs} Jev calls, ${runs} Spark calls with Jev (≈3k tokens each).`,
  );
  console.log("About $0.01 in total on muse-spark-1.3-contributor. Re-run with --confirm.");
  process.exit(0);
}
const metaKey = process.env.META_AI_API_KEY!;
const jevKey = process.env.TYPESAFE_API_KEY!;
const spark = createMetaModel(metaKey, process.env.META_AI_MODEL);
const recognizer = cachedRecognizer(createMuseTranscriber(metaKey), ".cache/transcripts");
const tokens = { sparkIn: 0, sparkOut: 0, jevIn: 0 };

type Reading = { id: string; label: string; bars: string[]; evidence: string[]; truthScore: number };

function readingsFor(folder: string, speech: { text: string }[]) {
  const truth = readTruth(folder)!;
  const take = createTake(decodeWav(loadTakeWav(folder)), speech as never);
  const span = [...take.sung].sort((a, b) => b.end - b.start - (a.end - a.start))[0];
  const signal = spanSignal(take, span.id)!;
  const said = speech.map((t) => t.text).join(" ");
  const spoken = /(\d{2,3})\s*(bpm|beats)/i.exec(said)?.[1];
  const [best, second] = rankTempi(segmentNotes(trackPitch(signal)));
  const tempo = spoken ? Number(spoken) : best.bpm;
  const otherTempo = second?.bpm ?? Math.round(tempo * 2);
  const base = { key: keyFromName(truth.key!), chords: chordsByBar(truth.chords) };
  const options = [
    { label: `${tempo} BPM, starts on beat 1, arpeggio`, bpm: tempo, startBeat: 0, snapToChordTones: true },
    {
      label: `${tempo} BPM, starts after an eighth rest, arpeggio`,
      bpm: tempo,
      startBeat: 0.5,
      snapToChordTones: true,
    },
    { label: `${otherTempo} BPM, starts on beat 1, arpeggio`, bpm: otherTempo, startBeat: 0, snapToChordTones: true },
    { label: `${tempo} BPM, starts after an eighth rest, melody`, bpm: tempo, startBeat: 0.5, snapToChordTones: false },
  ];
  const readings: Reading[] = options.map(({ label, ...option }, i) => {
    const result = transcribeMelody(signal, { ...base, ...option });
    const bars = result.bars.map((bar) =>
      bar.map((e) => `${e.pitch ? pitchName(e.pitch) : "r"}/${e.duration}`).join(" "),
    );
    const evidence = result.evidence.map(
      (e) => `bar ${e.bar}: ${e.confidence}, ${e.offCents} cents off, ${e.corrected} corrected`,
    );
    return { id: "ABCD"[i], label, bars, evidence, truthScore: compareBars(truth.bars, bars.join(" | ")).right };
  });
  return { said, chords: truth.chords!, key: truth.key!, readings };
}

const describe = (r: Reading) =>
  `${r.label}\n  ${r.bars.map((b, i) => `bar ${i + 1}: ${b}`).join("\n  ")}\n  ${r.evidence.join("; ")}`;

async function askSpark(said: string, chords: string, readings: Reading[], jevHint?: string): Promise<string> {
  const reply = await spark.complete(
    [
      {
        role: "system",
        content:
          "You are a music transcriber. A musician sang a line; the ear produced several complete readings of it. Choose the reading that best matches what they sang and meant, judging rhythm consistency, chord tones and their words. Call choose_reading.",
      },
      {
        role: "user",
        content: `They said: "${said || "(nothing)"}"\nChords by bar: ${chords}\n\n${readings.map((r) => `Reading ${r.id}: ${describe(r)}`).join("\n\n")}${jevHint ? `\n\nA fast judging model's probabilities: ${jevHint}` : ""}`,
      },
    ],
    [
      {
        name: "choose_reading",
        description: "Pick one reading.",
        parameters: {
          type: "object",
          properties: { reading: { type: "string", enum: readings.map((r) => r.id) }, reason: { type: "string" } },
          required: ["reading"],
        },
      },
    ],
  );
  tokens.sparkIn += reply.usage?.inputTokens ?? 0;
  tokens.sparkOut += reply.usage?.outputTokens ?? 0;
  const call = reply.toolCalls[0];
  return call ? (JSON.parse(call.arguments).reading as string) : "?";
}

async function askJev(said: string, chords: string, readings: Reading[]) {
  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${jevKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "jev-latest",
      state: {
        musicianSaid: said,
        chordsByBar: chords,
        readings: Object.fromEntries(readings.map((r) => [r.id, describe(r)])),
      },
      questions: {
        reading: {
          type: "choice",
          instructions:
            "A musician sang a line over these chords. Which reading of the take is the transcription of what they sang and meant (consistent rhythm, chord tones, their words)?",
          criteria: Object.fromEntries(readings.map((r) => [r.id, r.label])),
        },
      },
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Jev ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
  tokens.jevIn += body.usage?.input_tokens ?? 0;
  return body.answers.reading as { choice: string; confidence: number; probabilities: Record<string, number> };
}

for (const folder of TAKES) {
  const speech = readHeardSpeech(folder).length
    ? readHeardSpeech(folder)
    : await recognizer.transcribe(loadTakeWav(folder));
  const { said, chords, readings } = readingsFor(folder, speech);
  const top = Math.max(...readings.map((r) => r.truthScore));
  const right = new Set(readings.filter((r) => r.truthScore === top).map((r) => r.id));
  console.log(`\n=== ${folder}\nSaid: "${said.slice(0, 160)}"`);
  for (const r of readings) console.log(`  ${r.id} ${r.truthScore}/32  ${r.label}`);
  const tally = { spark: 0, jev: 0, both: 0 };
  for (let i = 0; i < runs; i++) {
    // A failed or timed-out call counts as a miss, not a crash.
    const alone = await askSpark(said, chords, readings).catch(() => "timeout");
    const jev = await askJev(said, chords, readings);
    const hint = Object.entries(jev.probabilities)
      .map(([id, p]) => `${id} ${Math.round(p * 100)}%`)
      .join(", ");
    const together = await askSpark(said, chords, readings, hint).catch(() => "timeout");
    tally.spark += Number(right.has(alone));
    tally.jev += Number(right.has(jev.choice));
    tally.both += Number(right.has(together));
    console.log(
      `  run ${i + 1}: Spark ${alone} · Jev ${jev.choice} (${hint}; confidence ${jev.confidence.toFixed(2)}) · Spark+Jev ${together}`,
    );
  }
  console.log(
    `  right (best = ${[...right].join("/")}): Spark ${tally.spark}/${runs}, Jev ${tally.jev}/${runs}, Spark+Jev ${tally.both}/${runs}`,
  );
}
const dollars = (tokens.sparkIn * 0.1 + tokens.sparkOut * 0.2 + tokens.jevIn * 0.042) / 1_000_000;
console.log(
  `\nTokens: Spark ${tokens.sparkIn} in / ${tokens.sparkOut} out, Jev ${tokens.jevIn} in ≈ $${dollars.toFixed(4)} (contributor prices)`,
);
