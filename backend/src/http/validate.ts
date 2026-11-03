import { z } from 'zod';
import { notFound } from '../lib/errors';

/**
 * Parses request input with a Zod schema. A failure throws a ZodError, which
 * the error handler turns into a 400 listing the invalid fields.
 */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  return schema.parse(input);
}

const UuidSchema = z.uuid();

/**
 * Route ids must be UUIDs. Anything else is answered with 404 (not 400), the
 * same as an id that exists but belongs to someone else.
 */
export function parseId(value: unknown): string {
  const result = UuidSchema.safeParse(value);
  if (!result.success) throw notFound();
  return result.data;
}
