import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(ApiError.notFound('Route not found'));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.fields ? { fields: err.fields } : {}),
      },
    });
    return;
  }

  const error = err as Error;
  logger.error('Unhandled error', {
    message: error?.message,
    ...(env.NODE_ENV !== 'production' ? { stack: error?.stack } : {}),
  });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  });
};
