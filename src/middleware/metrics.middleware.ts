import { NextFunction, Request, Response } from 'express';
import { httpRequestDuration } from '../metrics/prometheus';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const route = req.route?.path ?? req.path;
    httpRequestDuration.observe(
      { method: req.method, route, status: res.statusCode },
      durationMs,
    );
  });

  next();
}
