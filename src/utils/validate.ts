import { z } from 'zod';
import { HttpError } from './httpError';

// Validates data against a zod schema; throws a 400 with field errors if invalid
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(
      400,
      'Validation failed',
      result.error.issues.map((i) => ({ field: i.path.map(String).join('.'), message: i.message }))
    );
  }
  return result.data;
}