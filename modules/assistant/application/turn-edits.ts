import { createSession, execute, executeAll, travel, type Command, type Score, type Session } from "@/modules/score";

/** What the musician sees when the turn's edits would not replay to what the agent saw. */
export const REPLAY_MISMATCH =
  "My edits didn't add up when I checked them, so I left the score as it was. Please try again.";

/**
 * A turn's edits, kept in one place: the server's working copy of the score, and the commands
 * the editor replays to reach the same score. Every write and every undo goes through here, so
 * the two cannot drift apart.
 */
export type TurnEdits = {
  /** The working copy, with every edit so far. */
  score(): Score;
  /** The commands the editor will replay, in order, from the request's revision. */
  readonly commands: readonly Command[];
  /** Runs a command on the working copy and records it for the replay. A retried request does nothing. */
  execute(command: Command): void;
  /** Takes back the last edit, from the working copy and from the replay. False when there was none. */
  undo(): boolean;
  /** Throws `REPLAY_MISMATCH` unless replaying the commands from the start gives the working copy. */
  verify(): void;
};

/**
 * The editor replays the commands as one undo step, each expecting exactly the ones before it to
 * have run, so a command is recorded with the revision the replay will be at. The working copy's
 * own revision can be further on: an undo here is a new revision, but removes a command.
 */
export function createTurnEdits(start: Score): TurnEdits {
  let session: Session = createSession(start);
  const commands: Command[] = [];
  return {
    score: () => session.score,
    commands,
    execute(command) {
      const next = execute(session, command);
      if (next === session) return;
      session = next;
      commands.push({ ...command, expectedRevision: start.revision + commands.length });
    },
    undo() {
      const next = travel(session, "undo");
      if (next === session) return false;
      session = next;
      commands.pop();
      return true;
    },
    verify() {
      if (!replays(start, commands, session.score)) throw new Error(REPLAY_MISMATCH);
    },
  };
}

/** Whether the commands, run from `start`, give `expected` (its revision aside). */
function replays(start: Score, commands: readonly Command[], expected: Score): boolean {
  try {
    const replayed = executeAll(createSession(start), [...commands]).score;
    return content(replayed) === content(expected);
  } catch {
    return false;
  }
}

const content = (score: Score) => JSON.stringify({ ...score, revision: 0 });
