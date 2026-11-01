// Public API of the assistant module (framework-free). Provider adapters live in "./server".
export { ASK_TOOL, assistantTools } from "./application/assistant-tools";
export {
  ATTACHMENT_LIMITS,
  attachmentKind,
  readUploads,
  type Attachment,
  type AttachmentKind,
  type Upload,
} from "./application/attachments";
export {
  restoreTurns,
  turnsToSave,
  type ChatRepository,
  type Turn,
  type WorkspaceChats,
} from "./application/chat-history";
export { handleAssistantRequest, MAX_REQUEST_BYTES, type AssistantResponse } from "./application/handle-request";
export {
  handleVoiceRequest,
  MAX_AUDIO_BYTES,
  type HeardTake,
  type VoiceResponse,
  type VoiceResult,
} from "./application/handle-voice-request";
export type {
  ChatMessage,
  ContentPart,
  ModelPort,
  ModelReply,
  TokenUsage,
  ToolCall,
  ToolSpec,
} from "./application/model-port";
export { SYSTEM_PROMPT } from "./application/system-prompt";
export {
  MAX_TOOL_STEPS,
  runAssistant,
  type AssistantRequest,
  type AssistantResult,
  type AssistantTurn,
  type ProgressEvent,
  type ProgressListener,
  type TraceEntry,
  type TurnServices,
} from "./application/run-assistant";
export { createMusicTools, MUSIC_TOOL_NAMES, musicToolSpecs, type MusicToolName } from "./application/music-tools";
export { scoreBlocks, withoutScoreBlocks, type ScoreBlock } from "./application/score-blocks";
export { createScoreToolGateway } from "./application/score-tool-gateway";
export { SCORE_TOOL_NAMES, scoreTools, toolParameters, type ScoreToolName } from "./application/tool-definitions";
export { localWorkspaceChats } from "./infrastructure/local-chat";
export type { StartRequest } from "./application/start-request";
export { askedAfter, withHeardWords, type AskedTake } from "./application/asked-take";
