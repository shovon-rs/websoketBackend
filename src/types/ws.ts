export interface WsEvent<T = unknown> {
  type: string;
  eventId: string;
  timestamp: string;
  payload: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

export function buildEvent<T>(type: string, payload: T, eventId?: string): WsEvent<T> {
  return {
    type,
    eventId: eventId ?? crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    payload,
  };
}

export function buildErrorEvent(code: string, message: string, eventId?: string): WsEvent<null> {
  return {
    type: 'error',
    eventId: eventId ?? crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    payload: null,
    error: { code, message },
  };
}
