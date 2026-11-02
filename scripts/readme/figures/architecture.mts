import { COLOR, legend, page } from "../page.mjs";

const mod = (id: string, name: string, does: string, kind = "") =>
  `<div class="box ${kind}" id="${id}" style="padding:10px 12px"><code style="background:none;padding:0;font-size:14px;font-weight:650">${name}</code><small>${does}</small></div>`;

/** The project: routes over modules in layers, with the Meta models beside them. */
export function architecture() {
  const body = `<div style="display:grid;grid-template-columns:1fr 220px;gap:60px;align-items:center">
    <div style="display:flex;flex-direction:column;gap:12px">
      ${mod("app", "app/", "Next.js routes")}
      ${mod("workspace", "workspace", "screens")}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        ${mod("assistant", "assistant", "agents, tools", "meta")}
        ${mod("voice", "voice", "audio → notes", "meta")}
        ${mod("page", "page", "sheet detector")}
        ${mod("editor", "editor", "editing")}
        ${mod("engraving", "engraving", "notation layout")}
        ${mod("playback", "playback", "sound, MIDI")}
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px">
        ${mod("score", "score", "document, operations")}
        ${mod("projects", "projects", "storage")}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="box meta"><b>Muse Spark</b><small>used by assistant</small></div>
      <div class="box meta"><b>Muse Voice Transcribe</b><small>used by voice</small></div>
      <div class="box"><b>SwiftF0</b><small>local model, used by voice</small></div>
    </div>
  </div>
  ${legend([[COLOR.meta, "Meta API, or a module that calls it"]])}`;
  return page(body);
}
