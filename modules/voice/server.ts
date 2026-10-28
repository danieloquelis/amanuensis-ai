// Server-only entrypoint of the voice module: adapters that hold API keys or touch the disk.
// Import from route handlers and scripts only, never from client components.
export { cachedRecognizer } from "./infrastructure/cached-recognizer";
export { createMuseTranscriber, META_API_URL } from "./infrastructure/muse-transcriber";
export { archiveTake } from "./infrastructure/take-archive";
export { createSwiftF0Tracker } from "./infrastructure/swift-f0";
