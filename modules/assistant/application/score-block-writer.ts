import { scoreBlocks, type ScoreBlock } from "./score-blocks";

/** The bars of the block being written, for the sheet to draw before it closes; empty `text` clears it. */
export type DraftEvent = { stage: "draft"; requestId: string; text: string; pitches: ScoreBlock["pitches"] };

/** Writes one block's bars as `score_write` does; returns its result (which the agent reads). */
type WriteBars = (requestId: string, text: string, pitches: ScoreBlock["pitches"]) => { ok: boolean };

/**
 * The <score> blocks of a turn: while a reply streams, the open block's finished lines go to the
 * sheet as a draft; when the reply is complete, its blocks are written in order, each under the
 * request ID its draft used, so the bars keep their IDs (and don't pop in twice).
 */
export function createScoreBlockWriter(turnId: string, onDraft: (event: DraftEvent) => void, write: WriteBars) {
  let written = 0;
  let streamed = "";
  let sent = "";
  const requestId = (k: number) => `score-${written + k + 1}`;
  const clear = () => {
    if (!sent) return;
    sent = "";
    onDraft({ stage: "draft", requestId: "", text: "", pitches: "concert" });
  };
  return {
    /** A model step begins. */
    start() {
      streamed = "";
    },
    /** A piece of the reply's text, as it is written. */
    hear(text: string) {
      streamed += text;
      const blocks = scoreBlocks(streamed);
      const k = blocks.length - 1;
      const draft = blocks[k]?.lines.join("\n") ?? "";
      if (!draft || draft === sent) return;
      sent = draft;
      onDraft({ stage: "draft", requestId: `${turnId}-${requestId(k)}`, text: draft, pitches: blocks[k].pitches });
    },
    /**
     * The reply is complete: its blocks are written, in order. Returns what to tell the agent
     * (null when it wrote none), and whether every block was written.
     */
    commit(content: string | null): { report: string; ok: boolean } | null {
      const blocks = scoreBlocks(content ?? "").filter((block) => block.closed && block.lines.length);
      if (!blocks.length) {
        clear();
        return null;
      }
      const results = blocks.map((block, k) => write(requestId(k), block.lines.join("\n"), block.pitches));
      written += blocks.length;
      clear();
      const report = results.map((result, k) => `<score> block ${k + 1}: ${JSON.stringify(result)}`).join("\n");
      return { report: `[The bars in your <score> blocks, written]\n${report}`, ok: results.every((r) => r.ok) };
    },
  };
}
