import { FilePlus } from "@phosphor-icons/react";
import { IconButton } from "@/shared/ui/IconButton";
import surface from "@/shared/ui/surface.module.css";

type NewSongButtonProps = {
  /** While the assistant works on this song: leaving would drop its turn. */
  disabled: boolean;
  onCreate: () => void;
};

/** Top left, beside the app mark. Starts a new song in its own workspace; nothing is cleared. */
export function NewSongButton({ disabled, onCreate }: NewSongButtonProps) {
  return (
    <div className={`${surface.glass} ${surface.pill}`} role="group" aria-label="Song">
      <IconButton label="New song" tooltip="New song" disabled={disabled} onClick={onCreate}>
        <FilePlus size={19} />
      </IconButton>
    </div>
  );
}
