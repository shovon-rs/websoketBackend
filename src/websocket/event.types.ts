import { ZodType } from 'zod';
import { ConnectionRecord } from './connection.manager';

export interface EventDefinition<T> {
  schema: ZodType<T>;
  handle: (conn: ConnectionRecord, payload: T, eventId: string) => Promise<void>;
}
