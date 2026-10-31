import { FilePlus } from "@phosphor-icons/react";
import { IconButton } from "@/shared/ui/IconButton";
import surface from "@/shared/ui/surface.module.css";

/** Top left, beside the app mark. Starts a new song in its own workspace; nothing is cleared. */
export function NewSongButton({ onCreate }: { onCreate: () => void }) {
  return (
    <div className={`${surface.glass} ${surface.pill}`} role="group" aria-label="Song">
      <IconButton label="New song" tooltip="New song" onClick={onCreate}>
        <FilePlus size={19} />
      </IconButton>
    </div>
  );
}
