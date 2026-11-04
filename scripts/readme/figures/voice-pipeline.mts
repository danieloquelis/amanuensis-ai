import { COLOR, legend, page, type Link } from "../page.mjs";

const box = (id: string, kind: "meta" | "local" | "", title: string, line: string) =>
  `<div class="box ${kind}" id="${id}" style="padding:10px 12px"><b>${title}</b><small>${line}</small></div>`;

/** From a microphone take to notes in the score: who hears what, and where the agent comes in. */
export function voicePipeline() {
  const body = `<div style="display:grid;grid-template-columns:170px 230px 200px 200px;gap:58px;align-items:center">
    ${box("take", "", "Recording", "talk + singing")}
    <div style="display:flex;flex-direction:column;gap:12px">
      ${box("asr", "meta", "Muse Voice Transcribe", "words + times")}
      ${box("pitch", "local", "YIN", "pitch")}
      ${box("fft", "local", "FFT", "spectrum measures")}
    </div>
    ${box("model", "local", "Singing model", "logistic regression + HMM")}
    ${box("timeline", "", "Timeline", "words + sung spans")}
  </div>
  <div style="display:grid;grid-template-columns:170px 250px 200px;gap:58px;margin:40px 0 0 238px;align-items:center">
    ${box("score", "", "Score", "notes")}
    ${box("tools", "local", "voice_transcribe_melody", "notes, tempo, key")}
    ${box("spark", "meta", "Muse Spark", "the agent")}
  </div>
  ${legend([
    [COLOR.meta, "Meta model"],
    [COLOR.local, "Our code: plain maths, no pretrained model"],
  ])}`;
  const links: Link[] = [
    ["take", "asr"],
    ["take", "pitch"],
    ["take", "fft"],
    ["asr", "model"],
    ["pitch", "model"],
    ["fft", "model"],
    ["model", "timeline"],
    ["timeline", "spark", "bottom", "top"],
    ["spark", "tools", "left", "right", "tool call"],
    ["tools", "score", "left", "right"],
  ];
  return page(body, links);
}
