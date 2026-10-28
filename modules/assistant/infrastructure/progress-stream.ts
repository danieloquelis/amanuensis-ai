import type { ProgressEvent, ProgressListener } from "../application/run-assistant";

/** One line of the streamed reply: progress while working, then the final result. */
export type StreamLine = { type: "progress"; event: ProgressEvent } | { type: "result"; status: number; body: unknown };

/**
 * Streams a use case's progress as newline-delimited JSON, ending with its result, so the
 * musician sees each step live. The HTTP status is 200 once streaming starts; the result line
 * carries the use case's own status.
 */
export function progressResponse(run: (onProgress: ProgressListener) => Promise<{ status: number; body: unknown }>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: StreamLine) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      const { status, body } = await run((event) => send({ type: "progress", event }));
      send({ type: "result", status, body });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
