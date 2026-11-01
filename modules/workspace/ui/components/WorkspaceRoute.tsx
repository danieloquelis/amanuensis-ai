"use client";

import { useParams } from "next/navigation";
import { useWorkspaceGate } from "../hooks/use-workspace-gate";
import { WorkspaceScreen } from "./WorkspaceScreen";

/** The workspace named in the URL. An unknown id goes back to Home instead of opening a blank draft. */
export function WorkspaceRoute() {
  const raw = useParams().id;
  const id = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const gate = useWorkspaceGate(id);
  if (gate !== "open") return null;
  // Remount per workspace: a param change is a different song, not an edit to this one.
  return <WorkspaceScreen key={id} workspaceId={id} />;
}
