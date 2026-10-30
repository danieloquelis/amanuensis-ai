import { SlidersHorizontal } from "@phosphor-icons/react";
import type { ScoreEditor } from "../../hooks/use-score-editor";
import { MixerPanel } from "./MixerPanel";
import { ToolPopover } from "./ToolPopover";

/** The mixer, beside playback: shown once the score has more than one part. */
export function MixerTool({ editor }: { editor: ScoreEditor }) {
  if (editor.score.parts.length < 2) return null;
  return (
    <ToolPopover
      icon={<SlidersHorizontal size={22} weight="regular" />}
      label="Mixer"
      accessibleLabel="Mixer"
      disabled={!editor.ready}
    >
      <MixerPanel score={editor.score} onCommand={editor.commit} />
    </ToolPopover>
  );
}
