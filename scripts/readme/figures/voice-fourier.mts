import { COLOR, page } from "../page.mjs";
import type { voiceData } from "../voice-data.mjs";

type Data = Awaited<ReturnType<typeof voiceData>>;
type Frame = Data["talkFrame"];

const SPEC = { w: 540, h: 260, left: 46, right: 24, bottom: 26 };
const MAX_HZ = 3000;
const FLOOR_DB = -60;

/** One frame's spectrum, its harmonics (multiples of the pitch) marked. */
function spectrum(frame: Frame, color: string, name: string) {
  const peak = Math.max(...frame.spectrum.map((b) => b.db));
  const x = (hz: number) => SPEC.left + (hz / MAX_HZ) * (SPEC.w - SPEC.left - SPEC.right);
  const y = (db: number) => 8 + ((0 - Math.max(FLOOR_DB, db - peak)) / -FLOOR_DB) * (SPEC.h - SPEC.bottom - 8);
  const at = (hz: number) => frame.spectrum[Math.round(hz / frame.binHz)]?.db ?? FLOOR_DB;
  const path = frame.spectrum.map((b, i) => `${i ? "L" : "M"}${x(b.hz).toFixed(1)} ${y(b.db).toFixed(1)}`).join("");
  const f0 = frame.hz ?? 0;
  const dots: string[] = [];
  for (let h = f0; f0 && h < MAX_HZ; h += f0)
    dots.push(`<circle cx="${x(h)}" cy="${y(at(h))}" r="4" fill="${color}" stroke="white" stroke-width="1.5"/>`);
  const axis = [0, 1000, 2000, 3000].map(
    (hz) =>
      `<text x="${x(hz)}" y="${SPEC.h - 6}" font-size="12" fill="${COLOR.muted}" text-anchor="middle">${hz ? `${hz / 1000} kHz` : "0"}</text>`,
  );
  const dbAxis = [0, -30, -60].map(
    (db) =>
      `<text x="${SPEC.left - 6}" y="${y(peak + db) + 4}" font-size="12" fill="${COLOR.muted}" text-anchor="end">${db} dB</text>`,
  );
  return `<div><div style="font-size:16px;font-weight:650;color:${color};margin-bottom:6px">${name}</div>
    <svg width="${SPEC.w}" height="${SPEC.h}" font-family="inherit">
      <path d="${path}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/>${dots.join("")}${axis.join("")}${dbAxis.join("")}</svg></div>`;
}

export function voiceFourier(data: Data) {
  return page(
    `<div style="display:flex;gap:40px">${spectrum(data.talkFrame, COLOR.talk, "Talk")}${spectrum(data.sungFrame, COLOR.sung, "Singing")}</div>`,
  );
}
