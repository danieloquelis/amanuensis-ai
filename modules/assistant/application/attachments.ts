import type { ContentPart } from "./model-port";

// Files a musician attaches to a request: pictures and PDFs of sheet music, and text (a chord
// chart, ABC, tab). They go to the model beside the words, in the request's user message.

export type AttachmentKind = "image" | "pdf" | "text";

/** What one request may carry beside the musician's words. */
export const ATTACHMENT_LIMITS = {
  files: 10,
  totalBytes: 20_000_000,
  /** A picture's long side, in pixels: the model scales larger ones down anyway. */
  imageSide: 2000,
  textChars: 50_000,
  /** Pasted text longer than this becomes a text attachment, so instructions stay short. */
  pasteChars: 1500,
} as const;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const TEXT_NAMES = /\.(txt|text|abc|tab|md|cho|chordpro)$/i;

/** A file as it reaches the server. */
export type Upload = { name: string; mediaType: string; bytes: Uint8Array };

/** A file ready for the model: pictures and PDFs as data URLs (and their bytes), text as text. */
export type Attachment =
  | { kind: "image" | "pdf"; name: string; mediaType: string; dataUrl: string; bytes: Uint8Array }
  | { kind: "text"; name: string; text: string };

/** What a file is, from its media type (or, for text, its name); null for anything else. */
export function attachmentKind(mediaType: string, name: string): AttachmentKind | null {
  if (IMAGE_TYPES.includes(mediaType)) return "image";
  if (mediaType === "application/pdf") return "pdf";
  if (mediaType.startsWith("text/") || TEXT_NAMES.test(name)) return "text";
  return null;
}

/** How a turn's files are shown in the chat: their names and kinds. */
export function attachedOf(files: readonly { name: string; type: string }[]): { name: string; kind: AttachmentKind }[] {
  return files.map((file) => ({ name: file.name, kind: attachmentKind(file.type, file.name) ?? "text" }));
}

/** Whether a browser must re-encode a picture: too large, or a format the model does not take (HEIC). */
export function needsResize(mediaType: string, width: number, height: number): boolean {
  return !IMAGE_TYPES.includes(mediaType) || Math.max(width, height) > ATTACHMENT_LIMITS.imageSide;
}

/** A picture's size once its long side fits the limit. */
export function fittedSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, ATTACHMENT_LIMITS.imageSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Uploads checked against the limits; an error is a sentence for the musician. */
export function readUploads(uploads: Upload[]): { attachments: Attachment[] } | { error: string } {
  const { files, totalBytes, textChars } = ATTACHMENT_LIMITS;
  if (uploads.length > files) return { error: `Attach up to ${files} files at a time.` };
  const total = uploads.reduce((sum, upload) => sum + upload.bytes.length, 0);
  if (total > totalBytes) return { error: `Attachments can be up to ${totalBytes / 1_000_000} MB in all.` };
  const attachments: Attachment[] = [];
  for (const { name, mediaType, bytes } of uploads) {
    const kind = attachmentKind(mediaType, name);
    if (!kind) return { error: `${name} isn't a picture, a PDF or a text file.` };
    if (kind === "text") {
      const text = new TextDecoder().decode(bytes);
      if (text.length > textChars) return { error: `${name} is too long: up to ${textChars} characters.` };
      attachments.push({ kind, name, text });
    } else attachments.push({ kind, name, mediaType, bytes, dataUrl: `data:${mediaType};base64,${base64(bytes)}` });
  }
  return { attachments };
}

/** The attachments as parts of the musician's message, each introduced by its name. */
export function attachmentParts(attachments: Attachment[]): ContentPart[] {
  return attachments.flatMap((attachment, index): ContentPart[] => {
    const title = `[Attachment ${index + 1}: ${attachment.name}]`;
    if (attachment.kind === "text") return [{ type: "text", text: `${title}\n${attachment.text}` }];
    if (attachment.kind === "pdf")
      return [
        { type: "text", text: title },
        { type: "file", filename: attachment.name, dataUrl: attachment.dataUrl },
      ];
    return [
      { type: "text", text: title },
      { type: "image", dataUrl: attachment.dataUrl },
    ];
  });
}

/** Bytes per chunk handed to `btoa`, small enough for the argument list of `fromCharCode`. */
const BASE64_CHUNK = 0x8000;

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
}
