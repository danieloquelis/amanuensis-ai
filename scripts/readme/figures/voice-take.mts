import { COLOR, legend, page } from "../page.mjs";
import type { voiceData } from "../voice-data.mjs";

type Data = Awaited<ReturnType<typeof voiceData>>;

const LEFT = 170;
const WIDTH = 940;
const PANELS = [
  { key: "spec", title: "Spectrogram", note: "dots: pitch", height: 190 },
  { key: "harm", title: "Harmonicity", note: "", height: 64 },
  { key: "p", title: "P(singing)", note: "", height: 80 },
  { key: "hmm", title: "Decision", note: "", height: 58 },
] as const;
const GAP = 22;
const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const noteName = (midi: number) => `${NAMES[Math.round(midi) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`;

export function voiceTake(data: Data) {
  const x = (t: number) => LEFT + (t / data.seconds) * WIDTH;
  let top = 0;
  const at: Record<string, { y: number; h: number }> = {};
  for (const panel of PANELS) {
    at[panel.key] = { y: top, h: panel.height };
    top += panel.height + GAP;
  }
  const height = top + 28;
  const parts: string[] = [];
  // Talk and singing as the decoder read them, shading every panel lightly.
  const runs: { from: number; to: number; sung: boolean }[] = [];
  for (const f of data.frames) {
    if (f.hz === null) continue;
    const last = runs.at(-1);
    if (last && last.sung === f.sung && f.t - last.to < 0.4) last.to = f.t + 0.01;
    else runs.push({ from: f.t, to: f.t + 0.01, sung: f.sung });
  }
  const line = (key: string, values: (number | null)[], lo: number, hi: number) => {
    const { y, h } = at[key];
    let d = "";
    let pen = false;
    data.frames.forEach((f, i) => {
      const v = values[i];
      if (v === null || f.hz === null) return void (pen = false);
      const py = y + h - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * h;
      d += `${pen ? "L" : "M"}${x(f.t).toFixed(1)} ${py.toFixed(1)}`;
      pen = true;
    });
    return `<path d="${d}" fill="none" stroke="${COLOR.ink}" stroke-width="1.5" stroke-linejoin="round"/>`;
  };
  for (const panel of PANELS) {
    const { y, h } = at[panel.key];
    parts.push(
      `<text x="0" y="${y + 16}" font-size="14" font-weight="650">${panel.title}</text>`,
      `<text x="0" y="${y + 34}" font-size="12" fill="${COLOR.muted}">${panel.note}</text>`,
    );
    if (panel.key !== "spec" && panel.key !== "hmm") {
      parts.push(`<rect x="${LEFT}" y="${y}" width="${WIDTH}" height="${h}" fill="none" stroke="${COLOR.line}"/>`);
      for (const r of runs)
        parts.push(
          `<rect x="${x(r.from)}" y="${y}" width="${x(r.to) - x(r.from)}" height="${h}" fill="${r.sung ? COLOR.sung : COLOR.talk}" opacity=".07"/>`,
        );
    }
  }
  parts.push(
    line(
      "harm",
      data.frames.map((f) => f.harmonicity),
      -0.5,
      1.3,
    ),
  );
  // Probability: one dot per voiced frame, the 0.5 line.
  const p = at.p;
  parts.push(
    `<line x1="${LEFT}" x2="${LEFT + WIDTH}" y1="${p.y + p.h / 2}" y2="${p.y + p.h / 2}" stroke="${COLOR.faint}" stroke-dasharray="4 4"/>`,
  );
  for (const f of data.frames)
    if (f.p !== null)
      parts.push(
        `<circle cx="${x(f.t).toFixed(1)}" cy="${(p.y + p.h - f.p * p.h).toFixed(1)}" r="1.6" fill="${f.sung ? COLOR.sung : COLOR.talk}"/>`,
      );
  // The reading: talk with the words Muse Voice Transcribe heard, singing with the notes written.
  const hmm = at.hmm;
  for (const r of runs)
    parts.push(
      `<rect x="${x(r.from)}" y="${hmm.y + 14}" width="${Math.max(2, x(r.to) - x(r.from))}" height="22" rx="4" fill="${r.sung ? COLOR.sung : COLOR.talk}"/>`,
    );
  for (const turn of data.speech)
    parts.push(
      `<text x="${Math.min(x((turn.start + turn.end) / 2), LEFT + WIDTH - 150)}" y="${hmm.y + 52}" font-size="12.5" fill="${COLOR.muted}" font-style="italic" text-anchor="middle">“${turn.text}”</text>`,
    );
  for (const n of data.notes)
    parts.push(
      `<text x="${x((n.start + n.end) / 2)}" y="${hmm.y + 52}" font-size="12.5" text-anchor="middle" font-weight="600">${noteName(n.midi)}</text>`,
    );
  // Time axis.
  for (let t = 0; t <= data.seconds; t += 2)
    parts.push(
      `<text x="${x(t)}" y="${height - 6}" font-size="12" fill="${COLOR.muted}" text-anchor="middle">${t} s</text>`,
    );
  const spec = at.spec;
  const svg = `<svg width="1120" height="${height}" style="display:block;margin-top:22px;overflow:visible" font-family="inherit">${parts.join("")}</svg>`;
  const canvas = `<canvas id="spec" style="position:absolute;left:${LEFT}px;top:${22 + spec.y}px;width:${WIDTH}px;height:${spec.h}px;border-radius:6px"></canvas>`;
  const draw = `<script>
    const S = ${JSON.stringify({ columns: data.spectrogram.columns, binHz: data.spectrogram.binHz, f0: data.frames.map((f) => [f.t, f.hz, f.sung]), seconds: data.seconds })};
    const c = document.getElementById('spec');
    const W = ${WIDTH} * 2, H = ${spec.h} * 2; c.width = W; c.height = H; const g = c.getContext('2d');
    const bins = S.columns[0].length; let peak = -Infinity; for (const col of S.columns) for (const v of col) if (v > peak) peak = v;
    const img = g.createImageData(W, H);
    for (let px = 0; px < W; px++) { const col = S.columns[Math.min(S.columns.length - 1, Math.floor(px / W * S.columns.length))];
      for (let py = 0; py < H; py++) { const v = col[Math.floor((1 - py / H) * (bins - 1))]; const k = Math.max(0, Math.min(1, (v - peak + 70) / 70));
        const i = (py * W + px) * 4; img.data[i] = 252 - k * 241; img.data[i + 1] = 252 - k * 206; img.data[i + 2] = 251 - k * 159; img.data[i + 3] = 255; } }
    g.putImageData(img, 0, 0);
    for (const [t, hz, sung] of S.f0) if (hz) { g.fillStyle = sung ? '${COLOR.sung}' : '${COLOR.talk}'; g.beginPath(); g.arc(t / S.seconds * W, H - hz / (S.binHz * bins) * H, 2.4, 0, 7); g.fill(); }
  </script>`;
  return page(
    `<div style="position:relative">${svg}${canvas}</div>${draw}${legend([
      [COLOR.talk, "Talk"],
      [COLOR.sung, "Singing"],
    ])}`,
  );
}
