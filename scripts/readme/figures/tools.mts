import { COLOR, page } from "../page.mjs";

/** Every tool the agents can call, by group: name and what it does, in a few words. */
const GROUPS: [group: string, tools: [name: string, does: string][]][] = [
  [
    "Score",
    [
      ["score_get_context", "read the score"],
      ["score_write", "write bars"],
      ["score_edit", "apply operations"],
      ["score_undo", "undo"],
    ],
  ],
  [
    "Voice",
    [
      ["voice_transcribe_melody", "singing → notes"],
      ["voice_hear_notes", "notes as sung"],
      ["voice_check", "bars vs. singing"],
    ],
  ],
  [
    "Theory",
    [
      ["music_infer_key", "find the key"],
      ["music_infer_tempo", "find the tempo"],
      ["music_suggest_chords", "chords for a melody"],
    ],
  ],
  [
    "Sheet music",
    [
      ["music_read_source", "read a page"],
      ["page_check", "bars vs. page"],
    ],
  ],
  [
    "Memory",
    [
      ["assistant_plan", "show a plan"],
      ["assistant_ask", "ask a question"],
      ["song_notes_write", "notes on the song"],
      ["musician_remember", "remember you"],
      ["musician_forget", "forget"],
    ],
  ],
  [
    "Bandleader",
    [
      ["band_arrange", "start the band"],
      ["band_listen", "hear the band"],
      ["band_rehearse", "one more round"],
    ],
  ],
  [
    "Musicians",
    [
      ["band_motif", "place the material"],
      ["band_note", "message a bandmate"],
    ],
  ],
];
const COLUMNS = 5;

export function toolsMap() {
  const rows = GROUPS.map(
    ([group, tools]) => `<div style="font-size:15px;font-weight:650;align-self:center">${group}</div>
      ${tools.map(([name, does]) => `<div class="box" style="padding:9px 12px"><code style="background:none;padding:0;font-size:12.5px;font-weight:600">${name}</code><small>${does}</small></div>`).join("")}
      ${"<div></div>".repeat(COLUMNS - tools.length)}`,
  );
  return page(
    `<div style="display:grid;grid-template-columns:120px repeat(${COLUMNS}, 1fr);gap:10px 10px;color:${COLOR.ink}">${rows.join("")}</div>`,
  );
}
