import type { Command } from "@/modules/score";

/** The turn's committed commands changed: keep the first `keep` sent so far, then append `add`. */
export type EditsEvent = { stage: "edits"; keep: number; add: Command[] };

/**
 * Follows a turn's committed commands as they change, so each change can be sent to the editor
 * at once: a commit appends, `score_undo` takes the last one back. What it sends always adds up
 * to the turn's `commands`, so the final result holds no surprises.
 */
export function createEditFeed() {
  let sent: Command[] = [];
  return {
    /** The event that brings what was sent up to `commands`, or null when nothing changed. */
    update(commands: readonly Command[]): EditsEvent | null {
      let keep = 0;
      while (keep < sent.length && keep < commands.length && sent[keep] === commands[keep]) keep++;
      if (keep === sent.length && keep === commands.length) return null;
      const add = commands.slice(keep);
      sent = [...commands];
      return { stage: "edits", keep, add };
    },
    /** Sends what changed since the last send, if anything did. */
    send(commands: readonly Command[], onEvent: (event: EditsEvent) => void) {
      const change = this.update(commands);
      if (change) onEvent(change);
    },
  };
}
