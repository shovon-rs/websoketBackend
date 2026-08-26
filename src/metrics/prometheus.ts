import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const wsConnectionsActive = new Gauge({
  name: 'ws_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [registry],
});

export const wsConnectionsTotal = new Counter({
  name: 'ws_connections_total',
  help: 'Total WebSocket connections opened',
  registers: [registry],
});

export const wsEventLatency = new Histogram({
  name: 'ws_event_latency_ms',
  help: 'WebSocket event processing latency',
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000],
  labelNames: ['event_type'],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration',
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500],
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

export const pushDispatchDuration = new Histogram({
  name: 'push_dispatch_duration_ms',
  help: 'Time to dispatch an offline push notification',
  buckets: [100, 500, 1000, 3000, 10000],
  registers: [registry],
});
