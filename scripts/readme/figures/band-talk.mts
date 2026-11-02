import { COLOR, page } from "../page.mjs";
import { icon } from "./icons.mjs";
import type { InstrumentId } from "@/modules/score";

/** A real rehearsal: the notes the musicians passed in one evaluation run (cinematic, strings and piano). */
const NOTES: [from: string, fromInstrument: InstrumentId, to: string, note: string][] = [
  [
    "Violin",
    "violin",
    "Piano",
    "[Piano], please keep your right-hand stabs at or below C6 in bars 13–16 and 23 so my soaring line on top can sing clear.",
  ],
  [
    "Piano",
    "piano",
    "Violin",
    "[Violin], I dropped my build and climax an octave so you soar above me, keeping our bar 23 high A unison as the peak.",
  ],
  [
    "Viola",
    "viola",
    "Piano",
    "[Piano], please thin your right-hand chords in bars 17–22 or move them up an octave so my viola inner line at A3–C4 can speak under the violin.",
  ],
  [
    "Cello",
    "cello",
    "Violin",
    "[Violin], I’m under you in octaves for the tune in bars 17–22 so we hit the climax as one voice.",
  ],
  [
    "Double bass",
    "doublebass",
    "Piano",
    "[Piano], please keep piano.2 at A2 or above in bars 23–24 so my deep A1 can anchor the final unison without muddying the low octave.",
  ],
];

export function bandTalk() {
  const rows = NOTES.map(
    (
      [from, instrument, to, note],
      i,
    ) => `<div style="display:flex;gap:14px;align-items:flex-start;${i % 2 ? "margin-left:70px" : ""}">
      <div style="flex:none;width:44px;height:44px;border-radius:50%;background:${COLOR.metaSoft};color:${COLOR.meta};display:flex;align-items:center;justify-content:center">${icon(instrument, 24)}</div>
      <div style="background:white;border:1.5px solid ${COLOR.line};border-radius:4px 16px 16px 16px;padding:10px 14px;max-width:900px">
        <div style="font-size:12.5px;color:${COLOR.muted};margin-bottom:3px"><b style="color:${COLOR.ink}">${from}</b> → ${to}</div>
        <div style="font-size:15px;line-height:1.45">${note}</div></div></div>`,
  );
  return page(`<div style="display:flex;flex-direction:column;gap:14px">${rows.join("")}</div>`);
}
