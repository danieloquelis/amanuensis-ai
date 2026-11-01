import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { localWorkspaceRepository } from "@/modules/projects";

/**
 * Whether this workspace can open. Storage is read after mount, never during render, so the
 * server and the first client render agree ("checking"). An unknown id goes back to Home.
 */
export function useWorkspaceGate(id: string): "checking" | "open" {
  const router = useRouter();
  const [state, setState] = useState<{ id: string; open: boolean } | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      let open: boolean;
      try {
        open = localWorkspaceRepository.load(id) !== null;
      } catch {
        // Unreadable draft: the editor opens and shows its error state, leaving the data alone.
        open = true;
      }
      if (open) setState({ id, open });
      else router.replace("/");
    });
    return () => cancelAnimationFrame(frame);
  }, [id, router]);

  return state?.id === id && state.open ? "open" : "checking";
}
