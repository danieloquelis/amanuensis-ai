// Renders the README's figures to docs/readme/*.png (2×), each an HTML page laid out by the
// browser: diagrams drawn from the code's structure, charts from real data (see voice-data.mts
// vision-data.mts and the evaluation results). Needs META_AI_API_KEY for the voice take's words,
// and the app running at README_BASE for the sheet page (both cached after).
//
//   yarn readme:figures [name ...]
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { voiceData } from "./readme/voice-data.mjs";
import { visionData } from "./readme/vision-data.mjs";
import { agentLoop } from "./readme/figures/agent-loop.mjs";
import { architecture } from "./readme/figures/architecture.mjs";
import { bandMode } from "./readme/figures/band-mode.mjs";
import { bandTalk } from "./readme/figures/band-talk.mjs";
import { toolsMap } from "./readme/figures/tools.mjs";
import { voiceFourier } from "./readme/figures/voice-fourier.mjs";
import { voicePipeline } from "./readme/figures/voice-pipeline.mjs";
import { voiceTake } from "./readme/figures/voice-take.mjs";
import { vision } from "./readme/figures/vision.mjs";
import { visionEval } from "./readme/figures/vision-eval.mjs";
import { scoreTextFigure } from "./readme/figures/score-text.mjs";

const OUT = "docs/readme";
const wanted = process.argv.slice(2);
let voice: Awaited<ReturnType<typeof voiceData>> | null = null;
const heard = async () => (voice ??= await voiceData());
let page: Awaited<ReturnType<typeof visionData>> | null = null;
const seen = async () => (page ??= await visionData());
const figures: Record<string, () => Promise<string> | string> = {
  "voice-take": async () => voiceTake(await heard()),
  "voice-fourier": async () => voiceFourier(await heard()),
  "voice-pipeline": voicePipeline,
  "score-text": async () => scoreTextFigure(await seen()),
  vision: async () => vision(await seen()),
  "vision-eval": visionEval,
  "agent-loop": agentLoop,
  "band-mode": bandMode,
  "band-talk": bandTalk,
  tools: toolsMap,
  architecture,
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
for (const [name, build] of Object.entries(figures)) {
  if (wanted.length && !wanted.includes(name)) continue;
  await tab.setContent(await build());
  await tab.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready);
  await tab.locator("#figure").screenshot({ path: `${OUT}/${name}.png`, omitBackground: true });
  console.log(`${OUT}/${name}.png`);
}
await browser.close();
