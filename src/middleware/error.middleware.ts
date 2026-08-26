import { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

interface HttpError extends Error {
  status?: number;
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
}

export function errorHandler(err: HttpError, req: Request, res: Response, _next: NextFunction): void {
  const status = err.status ?? 500;

  if (status >= 500) {
    logger.error({ err, path: req.path }, 'Unhandled request error');
  }

  res.status(status).json({
    error: { code: status >= 500 ? 'INTERNAL_ERROR' : err.message, message: err.message || 'Unexpected error' },
  });
}
