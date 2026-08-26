import { connectionManager } from '../websocket/connection.manager';
import { broadcastDashboardMetrics } from '../modules/dashboard/dashboard.handler';

const BROADCAST_INTERVAL_MS = 5000;

/**
 * Counts only this instance's local connections. Fine for a single-instance
 * deployment; a multi-instance deployment would need a Redis-backed global
 * counter to report an accurate cluster-wide figure.
 */
export function startDashboardMetricsJob(): NodeJS.Timeout {
  return setInterval(() => {
    const connections = [...connectionManager.all()];
    const onlineUsers = new Set(connections.map(([, conn]) => conn.userId)).size;

    broadcastDashboardMetrics({
      activeConnections: connections.length,
      onlineUsers,
      generatedAt: new Date().toISOString(),
    });
  }, BROADCAST_INTERVAL_MS);
}
