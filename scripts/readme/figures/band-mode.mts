import { COLOR, legend, page, type Link } from "../page.mjs";
import { icon } from "./icons.mjs";
import type { InstrumentId } from "@/modules/score";

/** The band of the example run: one Muse Spark agent per instrument. */
const BAND: [id: string, instrument: InstrumentId, name: string][] = [
  ["m1", "violin", "Violin"],
  ["m2", "viola", "Viola"],
  ["m3", "cello", "Cello"],
  ["m4", "doublebass", "Double bass"],
  ["m5", "piano", "Piano"],
];
/** Mean seconds per phase over the 10 runs of `yarn eval:compose` (medium thinking). */
const TIMES: [label: string, seconds: number][] = [
  ["Plan", 63],
  ["Round 1", 75],
  ["Rehearsal", 49],
  ["Reply", 13],
];

const small = (id: string, kind: string, title: string) =>
  `<div class="box ${kind}" id="${id}" style="padding:10px 12px;text-align:center"><b style="margin:0">${title}</b></div>`;

/** A musician agent: its icon large, its name, and a line down to the band board. */
const musician = ([id, instrument, name]: (typeof BAND)[number]) =>
  `<div style="display:flex;flex-direction:column;align-items:center">
    <div class="box meta" id="${id}" style="width:100%;text-align:center;padding:16px 8px 12px">
      <div style="color:${COLOR.meta};display:flex;justify-content:center;margin-bottom:6px">${icon(instrument, 46)}</div>
      <b style="margin:0;font-size:15px">${name}</b></div>
    <div style="width:2px;height:22px;background:${COLOR.meta}"></div></div>`;

export function bandMode() {
  const top = `<div style="display:flex;justify-content:center;gap:70px;margin-bottom:46px">
    ${small("you", "", "You")}${small("leader", "meta", "Bandleader")}${small("arrange", "local", "band_arrange")}</div>`;
  const centre = `<div style="display:grid;grid-template-columns:1fr 170px;gap:80px;align-items:center">
    <div id="band" style="position:relative;border:2px dashed ${COLOR.meta};border-radius:18px;padding:18px 18px 16px">
      <div class="label" style="margin-bottom:10px;font-weight:650">One Muse Spark agent per instrument</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px">${BAND.map(musician).join("")}</div>
      <div class="box local" style="text-align:center;padding:10px"><b style="display:inline;margin:0">Band board</b><span class="label" style="margin-left:8px">notes between musicians</span></div>
      <div id="out" style="position:absolute;right:-2px;top:28%;width:2px;height:2px"></div>
      <div id="in" style="position:absolute;right:-2px;top:72%;width:2px;height:2px"></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:70px">${small("engine", "local", "Score engine")}${small("listener", "local", "Craft listener")}</div>
  </div>`;
  const times = `<div style="display:flex;gap:10px;margin-top:56px;font-size:13px">
    ${TIMES.map(([label, s]) => `<div style="flex:${s};background:${COLOR.metaSoft};border-radius:6px;padding:6px 8px"><b>${s} s</b> <span class="label">${label}</span></div>`).join("")}</div>`;
  const links: Link[] = [
    ["you", "leader"],
    ["leader", "arrange"],
    ["arrange", "band", "bottom", "top", "briefs"],
    ["out", "engine", "right", "left", "own part"],
    ["engine", "listener", "bottom", "top", "score"],
    ["listener", "in", "left", "right", "problems", true],
  ];
  return page(
    `${top}${centre}${times}
    ${legend([
      [COLOR.meta, "Muse Spark agent"],
      [COLOR.local, "Our code"],
    ])}`,
    links,
  );
}
