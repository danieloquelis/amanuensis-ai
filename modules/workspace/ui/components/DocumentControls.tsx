import { ArrowUUpLeft, ArrowUUpRight, Minus, Plus } from "@phosphor-icons/react";
import type { ScoreEditor } from "@/modules/editor/ui";
import { IconButton } from "@/shared/ui/IconButton";
import surface from "@/shared/ui/surface.module.css";
import styles from "./workspace.module.css";

const ZOOM_LEVELS = [80, 100, 125, 150];
const DEFAULT_ZOOM = 100;

type DocumentControlsProps = {
  editor: ScoreEditor;
  zoom: number;
  onZoom: (zoom: number) => void;
};

/** Top right: undo and redo, and the sheet's zoom. */
export function DocumentControls({ editor, zoom, onZoom }: DocumentControlsProps) {
  const { ready, undoRedo } = editor;
  const level = ZOOM_LEVELS.indexOf(zoom);
  return (
    <div className={`${surface.glass} ${surface.pill}`} role="group" aria-label="Document">
      <IconButton label="Undo" disabled={!ready || !editor.canUndo} onClick={() => undoRedo("undo")}>
        <ArrowUUpLeft size={19} />
      </IconButton>
      <IconButton label="Redo" disabled={!ready || !editor.canRedo} onClick={() => undoRedo("redo")}>
        <ArrowUUpRight size={19} />
      </IconButton>
      <span className={`${surface.divider} ${styles.zoomPart}`} />
      <IconButton
        label="Zoom out"
        className={styles.zoomPart}
        disabled={level <= 0}
        onClick={() => onZoom(ZOOM_LEVELS[level - 1])}
      >
        <Minus size={16} weight="bold" />
      </IconButton>
      <IconButton
        label={`Zoom ${zoom}%`}
        className={`${styles.zoomValue} ${styles.zoomPart}`}
        onClick={() => onZoom(DEFAULT_ZOOM)}
      >
        {zoom}%
      </IconButton>
      <IconButton
        label="Zoom in"
        className={styles.zoomPart}
        disabled={level >= ZOOM_LEVELS.length - 1}
        onClick={() => onZoom(ZOOM_LEVELS[level + 1])}
      >
        <Plus size={16} weight="bold" />
      </IconButton>
    </div>
  );
}
