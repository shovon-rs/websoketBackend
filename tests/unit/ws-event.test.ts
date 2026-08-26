import { describe, expect, it } from 'vitest';
import { buildEvent, buildErrorEvent } from '../../src/types/ws';

describe('WsEvent helpers', () => {
  it('builds an event envelope with a generated eventId and ISO timestamp', () => {
    const event = buildEvent('message:new', { content: 'hi' });

    expect(event.type).toBe('message:new');
    expect(event.payload).toEqual({ content: 'hi' });
    expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(() => new Date(event.timestamp).toISOString()).not.toThrow();
  });

  it('preserves a supplied eventId for correlation', () => {
    const event = buildEvent('message:new', {}, 'evt_abc123');
    expect(event.eventId).toBe('evt_abc123');
  });

  it('builds an error envelope carrying the error code and message', () => {
    const event = buildErrorEvent('UNKNOWN_EVENT', 'No handler registered', 'evt_1');

    expect(event.type).toBe('error');
    expect(event.error).toEqual({ code: 'UNKNOWN_EVENT', message: 'No handler registered' });
    expect(event.eventId).toBe('evt_1');
  });
});
