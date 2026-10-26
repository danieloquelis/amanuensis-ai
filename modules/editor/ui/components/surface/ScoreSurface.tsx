import { useCallback, useRef, useState } from "react";
import { layoutScore } from "@/modules/engraving";
import { keyName, meterName, scoreKey, type Score, type Step } from "@/modules/score";
import { applyGesturePreview } from "../../../application/gesture-preview";
import type { SheetItem } from "../../../application/notation-edits";
import type { CommitEdit } from "../../hooks/use-score-editor";
import { useSheetGestures } from "../../hooks/use-sheet-gestures";
import { SheetContextMenu } from "../sheet-menu/SheetContextMenu";
import styles from "./score-surface.module.css";
import type { SheetInteractions, SheetMenuTarget } from "./sheet-interactions";
import { SheetSystem } from "./SheetSystem";

type ScoreSurfaceProps = {
  score: Score;
  selectedId: string | null;
  playBeat: number | null;
  interactive: boolean;
  onSelect: (id: string | null) => void;
  selectedBarId: string | null;
  onSelectBar: (measureId: string | null) => void;
  onDeleteBar: (measureId: string) => void;
  selectedItem: SheetItem | null;
  onSelectItem: (item: SheetItem | null) => void;
  onDeleteItem: (item: SheetItem) => void;
  onCommand: CommitEdit;
  onStep: (id: string, steps: number) => void;
  onDelete: (id: string) => void;
  onEnterLetter: (id: string, step: Step) => void;
  onToggleRest: (id: string) => void;
};

/** The editable sheet: engraved score plus selection, drag gestures and context menus. */
export function ScoreSurface({
  score,
  selectedId,
  playBeat,
  interactive,
  onSelect,
  selectedBarId,
  onSelectBar,
  onDeleteBar,
  selectedItem,
  onSelectItem,
  onDeleteItem,
  onCommand,
  onStep,
  onDelete,
  onEnterLetter,
  onToggleRest,
}: ScoreSurfaceProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [menu, setMenu] = useState<SheetMenuTarget | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const gestures = useSheetGestures({
    svgRef,
    score,
    interactive,
    onCommand,
    onSelect,
    closeContextMenu: closeMenu,
  });

  const interactions: SheetInteractions = {
    interactive,
    select: onSelect,
    selectedBarId,
    selectBar: onSelectBar,
    deleteBar: onDeleteBar,
    selectedItem,
    selectItem: onSelectItem,
    deleteItem: onDeleteItem,
    commit: onCommand,
    stepPitch: onStep,
    removeEvent: onDelete,
    enterLetter: onEnterLetter,
    toggleRest: onToggleRest,
    gestures,
    openMenu: (kind, id, x, y) => {
      if (!interactive) return;
      gestures.cancelGesture();
      setMenu({ kind, id, x, y });
    },
  };

  const scene = layoutScore(applyGesturePreview(score, gestures.preview));
  // Keep DOM nodes in score order while a drag previews new positions, so pointer capture holds.
  const eventOrder = new Map(score.measures.flatMap((m) => m.events).map((event, index) => [event.id, index]));
  const meters = score.measures.map((m) => meterName(m.meter)).join(", ");

  return (
    <div className={styles.sheet}>
      <svg
        ref={svgRef}
        className={styles.surface}
        viewBox={`0 0 ${scene.width} ${scene.height}`}
        aria-label={`${score.title}, treble clef, ${keyName(scoreKey(score))}, ${meters} meter. Select a note to edit.`}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          onSelect(null);
          onSelectBar(null);
          onSelectItem(null);
          closeMenu();
        }}
      >
        <title>{`${score.title} — editable score`}</title>
        {scene.systems.map((system) => (
          <SheetSystem
            key={system.firstMeasure}
            system={system}
            eventOrder={eventOrder}
            selectedId={selectedId}
            playBeat={playBeat}
            showQuickActions={!gestures.preview && !menu && interactive}
            interactions={interactions}
          />
        ))}
      </svg>
      {menu && (
        <SheetContextMenu
          key={`${menu.kind}-${menu.id}`}
          target={menu}
          score={score}
          onCommand={onCommand}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
