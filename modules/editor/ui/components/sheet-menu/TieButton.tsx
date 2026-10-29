import { isRest, type Operation, type ScoreEvent } from "@/modules/score";

/** Ties a note into the next one, or removes its tie. Renders nothing for a rest. */
export function TieButton({
  event,
  onCommand,
}: {
  event: ScoreEvent;
  onCommand: (operation: Operation, receipt: string) => unknown;
}) {
  if (isRest(event)) return null;
  const tied = !!event.tie;
  return (
    <button
      aria-label="Tie to next note"
      aria-pressed={tied}
      onClick={() => onCommand({ type: "setTie", eventId: event.id, tied: !tied }, tied ? "Removed tie" : "Tied")}
    >
      <TieIcon />
    </button>
  );
}

/** The arc alone, drawn like the sheet's ties: thick in the middle, tapering to points. */
function TieIcon() {
  return (
    <svg viewBox="0 0 22 10" width="22" height="10" aria-hidden="true">
      <path d="M 1 2 Q 11 12 21 2 Q 11 8 1 2 Z" fill="currentColor" />
    </svg>
  );
}
