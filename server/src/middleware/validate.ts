import type { ZodTypeAny, z } from 'zod';
import { unprocessable } from '../lib/http.js';

/** Parses and returns validated data or throws a 422 with field errors. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    const first = result.error.issues[0]?.message ?? 'Invalid input';
    throw unprocessable(first, fieldErrors);
  }
  return result.data;
}
