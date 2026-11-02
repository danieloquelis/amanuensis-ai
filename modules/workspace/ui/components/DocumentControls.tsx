import { ArrowUUpLeft, ArrowUUpRight, Export } from "@phosphor-icons/react";
import type { ScoreEditor } from "@/modules/editor/ui";
import { IconButton } from "@/shared/ui/IconButton";
import surface from "@/shared/ui/surface.module.css";
import { downloadSong } from "../export-song";
import { ActionMenu } from "./ActionMenu";
import { ExportItems } from "./ExportItems";

/**
 * Top right: undo, redo, and saving the song for elsewhere (PDF, MusicXML, MIDI). The sheet zooms
 * with a trackpad pinch (see usePinchZoom).
 */
export function DocumentControls({ editor }: { editor: ScoreEditor }) {
  const { ready, undoRedo } = editor;
  return (
    <div className={`${surface.glass} ${surface.pill}`} role="group" aria-label="Document">
      <IconButton label="Undo" disabled={!ready || !editor.canUndo} onClick={() => undoRedo("undo")}>
        <ArrowUUpLeft size={19} />
      </IconButton>
      <IconButton label="Redo" disabled={!ready || !editor.canRedo} onClick={() => undoRedo("redo")}>
        <ArrowUUpRight size={19} />
      </IconButton>
      <ActionMenu label="Save or export" icon={<Export size={19} aria-hidden="true" />}>
        {(close) => (
          <ExportItems
            close={close}
            onPrint={() => window.print()}
            onDownload={(file) => downloadSong(editor.score, file)}
          />
        )}
      </ActionMenu>
    </div>
  );
}
