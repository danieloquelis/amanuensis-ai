import { useCallback, useEffect, useRef, useState } from "react";
import {
  ATTACHMENT_LIMITS,
  attachmentKind,
  fittedSize,
  needsResize,
  type AttachmentKind,
} from "../../application/attachments";
import { pdfPages } from "../pdf-pages";

/** A file waiting in the compose bar, with a thumbnail URL for pictures. */
export type PendingFile = { id: string; file: File; kind: AttachmentKind; preview?: string };
export type Attachments = ReturnType<typeof useAttachments>;

/** JPEG quality for pictures re-encoded in the browser: sharp enough for noteheads and labels. */
const JPEG_QUALITY = 0.85;
const PASTED_NAME = "Pasted text.txt";

/**
 * Files attached to the next request: added from the picker, a drop or a paste (long pasted
 * text becomes a file), pictures scaled down in the browser first, a PDF's pages turned into
 * pictures (so they are read like photos, notehead detector and all). `take` hands them over and
 * empties the bar.
 */
export function useAttachments() {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const previews = useRef(new Set<string>());
  const attached = useRef(0);
  useEffect(() => {
    attached.current = files.length;
  }, [files]);

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const add = useCallback(async (incoming: File[]) => {
    setError(null);
    const prepared: PendingFile[] = [];
    const picture = (file: File) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      prepared.push({ id: crypto.randomUUID(), file, kind: "image", preview });
    };
    for (const original of incoming) {
      if (original.type === "application/pdf") {
        const room = ATTACHMENT_LIMITS.files - attached.current - prepared.length;
        // A PDF that cannot be drawn (encrypted, damaged) still goes as a file, read by eye.
        const drawn = room > 0 ? await pdfPages(original, room).catch(() => null) : null;
        if (drawn?.pages.length) {
          drawn.pages.forEach(picture);
          if (drawn.total > drawn.pages.length)
            setError(`${original.name} has ${drawn.total} pages: I attached the first ${drawn.pages.length}.`);
          continue;
        }
      }
      const file = await prepare(original).catch(() => null);
      const kind = file && attachmentKind(file.type, file.name);
      if (!file || !kind) {
        setError(`${original.name} isn't a picture, a PDF or a text file I can read.`);
        continue;
      }
      const preview = kind === "image" ? URL.createObjectURL(file) : undefined;
      if (preview) previews.current.add(preview);
      prepared.push({ id: crypto.randomUUID(), file, kind, preview });
    }
    setFiles((current) => {
      const next = [...current, ...prepared];
      const bytes = next.reduce((sum, item) => sum + item.file.size, 0);
      if (next.length > ATTACHMENT_LIMITS.files) setError(`Attach up to ${ATTACHMENT_LIMITS.files} files at a time.`);
      else if (bytes > ATTACHMENT_LIMITS.totalBytes) setError("Attachments can be up to 20 MB in all.");
      else return next;
      return current;
    });
  }, []);

  /** Text too long for an instruction, kept as a text file instead. */
  const addText = useCallback((text: string) => add([new File([text], PASTED_NAME, { type: "text/plain" })]), [add]);

  const remove = useCallback((id: string) => {
    setError(null);
    setFiles((current) => current.filter((item) => item.id !== id));
  }, []);

  /** The files to send; the bar is emptied. */
  const take = useCallback((): PendingFile[] => {
    const taken = files;
    setFiles([]);
    setError(null);
    return taken;
  }, [files]);

  return { files, error, add, addText, remove, take };
}

/** A picture scaled to fit the limit (or re-encoded when the model can't take its format); other files as they are. */
async function prepare(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  if (!needsResize(file.type, bitmap.width, bitmap.height)) return file;
  const { width, height } = fittedSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("The picture could not be read.");
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
