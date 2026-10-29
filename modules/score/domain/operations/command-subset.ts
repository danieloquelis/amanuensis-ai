import { z } from "zod";
import { commandSchema, OPERATION_BATCH_LIMIT, operationSchema, type OperationType } from "./schema";

/**
 * The command schema with some operation types left out, for an agent that has another way to do
 * them (whole bars written as score text) or should not see them. Calls are still validated by
 * the full `commandSchema`; this only shrinks what the model reads.
 */
export function commandSchemaWithout(excluded: readonly OperationType[]) {
  const kept = operationSchema.options.filter((option) => !excluded.includes(option.shape.type.value));
  const operation = z.discriminatedUnion("type", kept as unknown as typeof operationSchema.options);
  const batch = z
    .strictObject({ type: z.literal("batch"), operations: z.array(operation).min(1).max(OPERATION_BATCH_LIMIT) })
    .describe(commandSchema.shape.operation.options[1].description ?? "");
  return commandSchema.extend({ operation: z.union([operation, batch]) });
}
