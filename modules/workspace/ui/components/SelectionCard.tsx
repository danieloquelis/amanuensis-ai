import { BarActions, NoteActions, type ScoreEditor } from "@/modules/editor/ui";
import { placeAround } from "@/shared/ui/floating-placement";
import type { AnchorArea, AnchorRect } from "@/shared/ui/hooks/use-anchor-rect";
import surface from "@/shared/ui/surface.module.css";
import styles from "./workspace.module.css";

/** Room the card needs, for placing it below the selection or, failing that, above. */
const CARD = { width: 520, height: 90 };

type SelectionCardProps = {
  editor: ScoreEditor;
  /** Where the selection is in the workspace, or null when it is off screen. */
  anchor: AnchorRect | null;
  area: AnchorArea;
};

/**
 * The selection's edit tools, right next to it: a note's duration, accidental and articulation;
 * a bar's insert, duplicate, clear and delete. (The compose bar picks up the selection too, so
 * the AI can be told what to do with it straight away.) Nothing to show for other selections.
 */
export function SelectionCard({ editor, anchor, area }: SelectionCardProps) {
  const { picked, pickedName, score } = editor;
  if (!anchor || !area.width || !picked.length || !pickedName) return null;
  const single = picked.length === 1 ? picked[0] : null;
  const event = single?.kind === "event" ? editor.selection?.event : undefined;
  const measure = single?.kind === "bar" ? score.measures.find((m) => m.id === single.id) : undefined;
  if (!event && !measure) return null;

  return (
    <section
      className={`${surface.glass} ${styles.selectionCard}`}
      style={placeAround(anchor, area, CARD)}
      aria-label="Selection"
    >
      <header className={styles.selectionName}>{pickedName}</header>
      {event && <NoteActions editor={editor} event={event} />}
      {measure && <BarActions editor={editor} measure={measure} />}
    </section>
  );
}
