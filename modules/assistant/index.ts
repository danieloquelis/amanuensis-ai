// Public API of the assistant module (framework-free). Provider adapters live in "./server".
export { ASK_TOOL, assistantTools } from "./application/assistant-tools";
export { handleAssistantRequest, MAX_REQUEST_BYTES, type AssistantResponse } from "./application/handle-request";
export type { ChatMessage, ModelPort, ModelReply, ToolCall, ToolSpec } from "./application/model-port";
export {
  MAX_TOOL_STEPS,
  runAssistant,
  type AssistantRequest,
  type AssistantResult,
  type AssistantTurn,
} from "./application/run-assistant";
export { createMusicTools, MUSIC_TOOL_NAMES, musicToolSpecs, type MusicToolName } from "./application/music-tools";
export { createScoreToolGateway } from "./application/score-tool-gateway";
export { SCORE_TOOL_NAMES, scoreTools, type ScoreToolName } from "./application/tool-definitions";
