import { applyCommand, createExample, type Score } from "@/modules/score";

/**
 * A blank song with a fresh identity: the same blank "New song" starts from. The caller
 * supplies the request id (a UUID in Home and the editor) so the result is easy to test.
 */
export function createWorkspaceScore(requestId: string): Score {
  const template = createExample();
  return applyCommand(template, {
    requestId,
    expectedRevision: template.revision,
    operation: { type: "newScore" },
  });
}
