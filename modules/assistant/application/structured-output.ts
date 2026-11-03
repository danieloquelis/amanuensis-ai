import { z } from "zod";
import type { ResponseFormat } from "./model-port";

/**
 * A structured-output format generated from the Zod schema that later reads the reply, so the
 * two cannot drift. Zod already writes what strict decoding needs (every property required, no
 * others allowed); only the `$schema` header is dropped.
 */
export function structuredFormat(name: string, schema: z.ZodType): ResponseFormat {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return { name, schema: jsonSchema };
}

/**
 * The reply's JSON read with its schema, or null when it is missing, not JSON or the wrong shape
 * (a provider that ignored the format, a cut-off reply): each caller decides what null means.
 */
export function parseStructured<T>(schema: z.ZodType<T>, content: string | null): T | null {
  if (!content) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
