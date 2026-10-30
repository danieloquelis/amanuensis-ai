// Bars the agent writes in its reply, between <score> and </score>, as score text: drawn line by
// line while the reply streams, and written to the score when the block closes.

/** A <score> block of a reply: its finished bar lines, whether it is closed, and how its pitches are given. */
export type ScoreBlock = { lines: string[]; closed: boolean; pitches: "concert" | "written" };

const OPEN = /<score(?:\s+pitches="(written|concert)")?\s*>/g;
const CLOSE = "</score>";

/**
 * Every <score> block in `text` so far, in order. An open block (still being written) keeps only
 * the lines that have ended; a line is a bar line when it starts with "bar".
 */
export function scoreBlocks(text: string): ScoreBlock[] {
  const blocks: ScoreBlock[] = [];
  OPEN.lastIndex = 0;
  for (let open = OPEN.exec(text); open; open = OPEN.exec(text)) {
    const start = open.index + open[0].length;
    const end = text.indexOf(CLOSE, start);
    const closed = end !== -1;
    const body = text.slice(start, closed ? end : undefined);
    const lines = body.split("\n");
    // In an open block the last piece may be half a line.
    if (!closed) lines.pop();
    blocks.push({
      lines: lines.map((line) => line.trim()).filter((line) => /^bar\s+\d+/i.test(line)),
      closed,
      pitches: open[1] === "written" ? "written" : "concert",
    });
    if (!closed) break;
    OPEN.lastIndex = end + CLOSE.length;
  }
  return blocks;
}

/** The reply as the musician reads it: the <score> blocks taken out (the sheet shows them). */
export function withoutScoreBlocks(text: string): string {
  return text
    .replace(/<score(?:\s+pitches="(?:written|concert)")?\s*>[\s\S]*?(<\/score>|$)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
