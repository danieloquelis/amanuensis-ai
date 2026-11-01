import { z } from "zod";

/** How long the model may think before acting, as the musician chooses it: faster, or more careful. */
export const THINKING_LEVELS = ["low", "medium", "high"] as const;
export type Thinking = (typeof THINKING_LEVELS)[number];
export const thinkingSchema = z.enum(THINKING_LEVELS);
/** Used until the musician picks one: careful enough to reason about the music, still quick. */
export const DEFAULT_THINKING: Thinking = "medium";

/** The thinking a request body asks for, if it names a valid level. */
export function thinkingOf(body: unknown): Thinking | undefined {
  const value = typeof body === "object" && body !== null ? (body as { thinking?: unknown }).thinking : undefined;
  const parsed = thinkingSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** One level below: what a helper (a band musician) thinks at, next to its leader. */
export const thinkingBelow = (level: Thinking | undefined): Thinking => (level === "high" ? "medium" : "low");
