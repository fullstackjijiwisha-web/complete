import type { RequestHandler } from 'express';

// express-mongo-sanitize is incompatible with Express 5 (req.query is a
// read-only getter), so the same protection is implemented here: strip keys
// starting with '$' or containing '.' from incoming objects, in place.
// Defense in depth — every route additionally validates with Zod, which strips
// unknown keys, so raw request objects never reach a Mongo query directly.
function clean(value: unknown, depth = 0): void {
  if (!value || typeof value !== 'object' || depth > 10) return;
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
    } else {
      clean(obj[key], depth + 1);
    }
  }
}

export const sanitizeRequest: RequestHandler = (req, _res, next) => {
  clean(req.body);
  clean(req.params);
  clean(req.query);
  next();
};
