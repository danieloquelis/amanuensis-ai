import { ATTACHMENT_LIMITS } from "../application/attachments";

/** JPEG quality for rendered pages: sharp enough for noteheads, stems and the detector's labels. */
const JPEG_QUALITY = 0.85;

/**
 * A PDF's pages as pictures, the long side at the size pictures are read at, so each page of
 * sheet music goes through the notehead detector and the page check like a photo. At most `room`
 * pages; `total` says how many the PDF has. pdf.js loads only when a PDF is attached.
 */
export async function pdfPages(file: File, room: number): Promise<{ pages: File[]; total: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loading.promise;
  const base = file.name.replace(/\.pdf$/i, "");
  const pages: File[] = [];
  try {
    for (let number = 1; number <= Math.min(pdf.numPages, room); number++) {
      const page = await pdf.getPage(number);
      const natural = page.getViewport({ scale: 1 });
      const scale = ATTACHMENT_LIMITS.imageSide / Math.max(natural.width, natural.height);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d")!;
      // Paper is white: a transparent page would turn black as a JPEG.
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
      if (!blob) throw new Error("A page could not be drawn.");
      pages.push(new File([blob], `${base} – page ${number}.jpg`, { type: "image/jpeg" }));
    }
    return { pages, total: pdf.numPages };
  } finally {
    await loading.destroy();
  }
}
