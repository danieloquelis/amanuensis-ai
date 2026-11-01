import { Suspense } from "react";
import { WorkspaceRoute } from "@/modules/workspace/ui";

/** One workspace. Its id is only known at request time, so the route sits inside Suspense. */
export default function WorkspacePage() {
  return (
    <Suspense fallback={null}>
      <WorkspaceRoute />
    </Suspense>
  );
}
