import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

/**
 * Validates a request body against a Zod schema from `@agent/shared`.
 *
 * Nest's usual answer is class-validator DTOs, but those would mean writing the
 * rules twice — once here and once in the browser. Sharing one Zod schema keeps
 * the frontend's "is this form ready" check and the API's real gate in lockstep.
 *
 * Usage: `@Body(new ZodValidationPipe(agentSpecSchema)) spec: AgentSpec`
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    // Surface the first message only — the forms are short enough that a list
    // is noise, and the field-level errors are already rendered client-side.
    throw new BadRequestException(
      result.error.issues[0]?.message ?? "That request was not valid.",
    );
  }
}
