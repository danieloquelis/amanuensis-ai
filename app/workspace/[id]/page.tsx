"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { localWorkspaceRepository } from "@/modules/projects";
import { WorkspaceScreen } from "@/modules/workspace/ui";

/** One workspace. The id is only known at runtime, so the gate sits inside Suspense. */
export default function WorkspacePage() {
  return (
    <Suspense fallback={null}>
      <WorkspaceGate />
    </Suspense>
  );
}

/** An unknown id goes back to Home instead of opening a blank draft. */
function WorkspaceGate() {
  const raw = useParams().id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  const router = useRouter();
  const exists = useMemo(() => {
    if (!id) return false;
    try {
      return localWorkspaceRepository.load(id) !== null;
    } catch {
      // Unreadable draft: let the editor show its error state.
      return true;
    }
  }, [id]);
  useEffect(() => {
    if (!exists) router.replace("/");
  }, [exists, router]);
  if (!exists || !id) return null;
  // Remount per workspace: a param change is a different song, not an edit to this one.
  return <WorkspaceScreen key={id} workspaceId={id} />;
}
