import { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

interface HttpError extends Error {
  status?: number;
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
}

/**
 * Services/handlers signal semantic failures as `throw new Error('SOME_CODE')` (the WS event
 * router already maps these to `error.code` in the WsEvent envelope — see event.router.ts).
 * REST controllers share those same services, so map the well-known codes to a proper HTTP
 * status here too instead of letting every thrown Error fall through to 500.
 */
const ERROR_CODE_STATUS: Record<string, number> = {
  FORBIDDEN: 403,
  NOT_A_MEMBER: 403,
  NOT_FOUND: 404,
  DOCUMENT_NOT_FOUND: 404,
  RATE_LIMITED: 429,
};

export function errorHandler(err: HttpError, req: Request, res: Response, _next: NextFunction): void {
  const status = err.status ?? ERROR_CODE_STATUS[err.message] ?? 500;

  if (status >= 500) {
    logger.error({ err, path: req.path }, 'Unhandled request error');
  }

  res.status(status).json({
    error: { code: status >= 500 ? 'INTERNAL_ERROR' : err.message, message: err.message || 'Unexpected error' },
  });
}
