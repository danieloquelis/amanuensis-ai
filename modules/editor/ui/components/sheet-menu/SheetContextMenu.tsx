import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatChord, SECTION_LABEL_MAX, type Operation, type Score } from "@/modules/score";
import { useDismissableLayer } from "@/shared/ui/hooks/use-dismissable-layer";
import { moveMenuFocus } from "@/shared/ui/menu-keyboard";
import { checkOperation } from "../../../application/operation-check";
import type { CommitEdit } from "../../hooks/use-score-editor";
import type { SheetMenuTarget } from "../surface/sheet-interactions";
import { MeterGrid } from "../toolbar/MeterGrid";
import { IndicationMenuSection } from "./IndicationMenuSection";
import { LabelMenuSection } from "./LabelMenuSection";
import surface from "@/shared/ui/surface.module.css";
import styles from "./sheet-menu.module.css";

const MENU_SIZE = { width: 272, height: 260 };
const MENU_LABELS = {
  meter: "Time signature",
  annotation: "Indication actions",
  chord: "Chord actions",
  section: "Section actions",
};
const VIEWPORT_MARGIN = 8;

/** Edits proposed from a menu; returns false and shows why when the edit cannot apply. */
export type CheckedCommit = (operation: Operation, receipt: string) => boolean;

type SheetContextMenuProps = {
  target: SheetMenuTarget;
  score: Score;
  onCommand: CommitEdit;
  onClose: () => void;
};

/** Right-click, double-click or keyboard menu for something on the sheet, rendered in a portal. */
export function SheetContextMenu({ target, score, onCommand, onClose }: SheetContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  useDismissableLayer(menuRef, onClose);

  const measure = score.measures.find((m) => m.id === target.id);
  const annotation = score.annotations.find((a) => a.id === target.id);
  const chord = score.chords.find((c) => c.id === target.id);
  if (!measure && !annotation && !chord) return null;

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

  const content = () => {
    if (target.kind === "meter" && measure) {
      return (
        <MeterGrid
          score={score}
          barIndex={score.measures.indexOf(measure)}
          onCommand={(operation, receipt) => commit(operation, receipt)}
          onError={setMessage}
        />
      );
    }
    if (target.kind === "section" && measure) {
      return (
        <LabelMenuSection
          ariaLabel="Section name"
          initial={measure.section ?? ""}
          maxLength={SECTION_LABEL_MAX}
          commit={commit}
          save={(label) => ({ type: "setSection", measureId: measure.id, label })}
          remove={{ type: "setSection", measureId: measure.id, label: null }}
        />
      );
    }
    if (target.kind === "chord" && chord) {
      return (
        <LabelMenuSection
          ariaLabel="Chord symbol"
          initial={formatChord(chord).replace(/♯/g, "#").replace(/♭/g, "b")}
          maxLength={24}
          commit={commit}
          save={(symbol) => ({ type: "putChord", id: chord.id, measureId: chord.measureId, beat: chord.beat, symbol })}
          remove={{ type: "removeNotation", id: chord.id }}
        />
      );
    }
    return annotation ? <IndicationMenuSection annotation={annotation} commit={commit} /> : null;
  };

  return createPortal(
    <div
      ref={menuRef}
      role="dialog"
      aria-label={MENU_LABELS[target.kind]}
      className={`${surface.panel} ${styles.menu}`}
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
      {content()}
      {message && (
        <p role="status" className={styles.message}>
          {message}
        </p>
      )}
    </div>,
    document.body,
  );
}
