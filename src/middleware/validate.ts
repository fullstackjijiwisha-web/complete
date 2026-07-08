import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../utils/ApiError';

type Source = 'body' | 'query' | 'params';

export function validate(schema: ZodType, source: Source = 'body'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const fields: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || source;
        (fields[key] ??= []).push(issue.message);
      }
      throw new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', fields);
    }
    if (source === 'body') {
      req.body = result.data;
    } else {
      // req.query/req.params are getter-backed in Express 5 — merge in place.
      Object.assign(req[source] as Record<string, unknown>, result.data);
    }
    next();
  };
}
