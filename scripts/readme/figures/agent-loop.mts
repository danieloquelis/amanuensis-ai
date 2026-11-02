import { COLOR, legend, page, type Link } from "../page.mjs";

/** A real turn from the dev server's log (a sung take): seconds of thinking before each call. */
const TRACE: [seconds: number, call: string, refused?: boolean][] = [
  [2.9, "voice_transcribe_melody"],
  [4.7, "voice_check"],
  [8.8, "voice_hear_notes"],
  [27.3, "score_get_context"],
  [2.4, "score_write", true],
  [7.6, "score_write"],
  [6.9, "reply"],
];

const at = (id: string, left: number, top: number, kind: string, title: string) =>
  `<div class="box ${kind}" id="${id}" style="position:absolute;left:${left}px;top:${top}px;width:150px;padding:12px;text-align:center"><b style="margin:0">${title}</b></div>`;

function loop() {
  return `<div style="position:relative;width:560px;height:390px">
    ${at("request", 0, 20, "", "Request")}
    ${at("spark", 205, 20, "meta", "Muse Spark")}
    ${at("reply", 410, 20, "", "Reply")}
    ${at("gateway", 380, 170, "local", "Tool gateway")}
    ${at("engine", 205, 320, "local", "Score engine")}
    ${at("result", 30, 170, "", "Tool result")}
  </div>`;
}

function trace() {
  const max = Math.max(...TRACE.map(([s]) => s));
  const rows = TRACE.map(([seconds, call, refused]) => {
    const kind = call === "reply" ? "" : refused ? "bad" : "local";
    return `<div style="display:grid;grid-template-columns:200px 1fr;align-items:center;gap:12px;margin:8px 0">
      <div><span class="chip ${kind}">${call}${refused ? " ✗" : ""}</span></div>
      <div style="display:flex;align-items:center;gap:6px"><div style="height:14px;width:${(seconds / max) * 170}px;background:${COLOR.meta};border-radius:3px"></div><span class="label" style="white-space:nowrap">${seconds} s</span></div></div>`;
  });
  return `<div style="font-size:15px;font-weight:650;margin-bottom:6px">A real turn <span class="label">· thinking before each call</span></div>${rows.join("")}`;
}

export function agentLoop() {
  const links: Link[] = [
    ["request", "spark"],
    ["spark", "reply"],
    ["spark", "gateway", "right", "top", "tool call"],
    ["gateway", "engine", "bottom", "right", "valid"],
    ["gateway", "result", "left", "right", "refused", true],
    ["engine", "result", "left", "bottom"],
    ["result", "spark", "top", "left"],
  ];
  return page(
    `<div style="display:grid;grid-template-columns:560px 1fr;gap:70px;align-items:start">${loop()}<div>${trace()}</div></div>
    ${legend([
      [COLOR.meta, "Meta model"],
      [COLOR.local, "Our code"],
    ])}`,
    links,
  );
}
