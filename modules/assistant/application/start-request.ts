/**
 * A first request made before its song exists (on Home): typed words with any attached sheet
 * music, or a recorded take. The song it creates runs it as its first turn.
 */
export type StartRequest = { kind: "text"; text: string; files: File[] } | { kind: "take"; wav: Uint8Array };
