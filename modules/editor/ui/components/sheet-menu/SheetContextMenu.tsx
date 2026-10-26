import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { findEvent, meterName, pitchName, type Operation, type Score } from "@/modules/score";
import { useDismissableLayer } from "@/shared/ui/hooks/use-dismissable-layer";
import { moveMenuFocus } from "@/shared/ui/menu-keyboard";
import { checkOperation } from "../../../application/operation-check";
import type { CommitEdit } from "../../hooks/use-score-editor";
import type { SheetMenuTarget } from "../surface/sheet-interactions";
import { BarMenuSection } from "./BarMenuSection";
import { IndicationMenuSection } from "./IndicationMenuSection";
import { NoteMenuSection } from "./NoteMenuSection";
import styles from "./sheet-menu.module.css";

const MENU_SIZE = { width: 272, height: 390 };
const VIEWPORT_MARGIN = 8;

/** Edits proposed from a menu; returns false and shows why when the edit cannot apply. */
export type CheckedCommit = (operation: Operation, receipt: string) => boolean;

type SheetContextMenuProps = {
  target: SheetMenuTarget;
  score: Score;
  onCommand: CommitEdit;
  onClose: () => void;
};

/** Right-click / keyboard menu for a note, bar or indication, rendered in a portal. */
export function SheetContextMenu({ target, score, onCommand, onClose }: SheetContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  useDismissableLayer(menuRef, onClose);

  const annotation = score.annotations.find((a) => a.id === target.id);
  const location = findEvent(score, target.id);
  const measure = location?.measure ?? score.measures.find((m) => m.id === target.id);
  if (!measure && !annotation) return null;
  const barIndex = measure ? score.measures.indexOf(measure) : -1;

  const commit: CheckedCommit = (operation, receipt) => {
    const problem = checkOperation(score, operation);
    if (problem) {
      setMessage(problem);
      return false;
    }
    onCommand(operation, receipt, score.revision);
    onClose();
    return true;
  };

  const event = location?.event;
  const title = event
    ? `${event.gap ? "Empty space" : pitchName(event.pitch)} · Bar ${barIndex + 1}`
    : measure
      ? `Bar ${barIndex + 1} · ${meterName(measure.meter)}`
      : "Indication";
  const label = { note: "Note actions", bar: "Bar actions", annotation: "Indication actions" }[target.kind];

  return createPortal(
    <div
      ref={menuRef}
      role="dialog"
      aria-label={label}
      className={styles.menu}
      style={{
        left: Math.max(VIEWPORT_MARGIN, Math.min(target.x, window.innerWidth - MENU_SIZE.width)),
        top: Math.max(VIEWPORT_MARGIN, Math.min(target.y, window.innerHeight - MENU_SIZE.height)),
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
        moveMenuFocus(e);
      }}
    >
      <header>
        <strong>{title}</strong>
        <button aria-label="Close actions" onClick={onClose}>
          ×
        </button>
      </header>
      {event && <NoteMenuSection event={event} commit={commit} />}
      {target.kind === "bar" && measure && (
        <BarMenuSection score={score} measure={measure} commit={commit} onProblem={setMessage} />
      )}
      {annotation && <IndicationMenuSection annotation={annotation} commit={commit} />}
      {message && (
        <p role="status" className={styles.message}>
          {message}
        </p>
      )}
    </div>,
    document.body,
  );
}
