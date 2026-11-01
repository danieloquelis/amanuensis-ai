// Public API of the projects module.
export { workspaceProject, type ProjectRepository, type WorkspaceRepository } from "./application/project-repository";
export type { WorkspaceIndex, WorkspaceMeta, WorkspaceTimes } from "./application/workspace-index";
export { emptyWorkspaceIndex, removeWorkspace, touchWorkspace, workspaceMeta } from "./application/workspace-index";
export { createWorkspaceScore } from "./application/new-workspace";
export { localWorkspaceRepository } from "./infrastructure/local-workspaces";
