import * as Y from 'yjs';
import { prisma } from '../../config/database';

/**
 * In-memory registry of live Y.Doc instances, keyed by documentId. This is a
 * per-process singleton — see the module-level note below for the accepted
 * multi-instance limitation.
 *
 * KNOWN, ACCEPTED LIMITATION: this registry is per-process. In a
 * multi-instance deployment, two users editing the same document on
 * different instances would each be served by a different in-memory Y.Doc,
 * and only the instance that receives a given client's `document:update`
 * persists it — the two instances' in-memory docs would NOT converge with
 * each other (only each client directly connected to that room still gets
 * correct live updates via the existing Redis room broadcast, since Yjs
 * updates broadcast to the room are applied correctly on whichever
 * instance's sockets receive them via the frontend's own Y.Doc — it's
 * specifically the SERVER-side in-memory doc and the periodic Postgres
 * persistence that could diverge/interleave oddly across instances). This
 * mirrors the existing `connectionManager.getByUser` single-instance-target
 * note in the skill doc — an accepted tradeoff, not a bug to fix in this pass.
 */

const PERSIST_DEBOUNCE_MS = 3000;

interface RegistryEntry {
  doc: Y.Doc;
  saveTimer: NodeJS.Timeout | null;
}

const registry = new Map<string, RegistryEntry>();

async function persist(documentId: string, doc: Y.Doc): Promise<void> {
  const state = Buffer.from(Y.encodeStateAsUpdate(doc));
  await prisma.document.update({
    where: { id: documentId },
    data: { state },
  });
}

export async function getOrLoadDoc(documentId: string): Promise<Y.Doc> {
  const existing = registry.get(documentId);
  if (existing) return existing.doc;

  const record = await prisma.document.findUniqueOrThrow({ where: { id: documentId }, select: { state: true } });
  const doc = new Y.Doc();
  if (record.state && record.state.length > 0) {
    Y.applyUpdate(doc, new Uint8Array(record.state));
  }

  registry.set(documentId, { doc, saveTimer: null });
  return doc;
}

/**
 * Decodes and applies a client's base64-encoded Yjs update to the server-side
 * doc, schedules a debounced persist, and returns the raw update bytes so the
 * caller can broadcast them verbatim to the room (Yjs updates are designed to
 * be relayed as-is — no server-side re-encoding needed).
 */
export async function applyClientUpdate(documentId: string, updateBase64: string): Promise<Uint8Array> {
  const doc = await getOrLoadDoc(documentId);
  const update = new Uint8Array(Buffer.from(updateBase64, 'base64'));

  Y.applyUpdate(doc, update, 'remote');

  const entry = registry.get(documentId)!;
  if (entry.saveTimer) clearTimeout(entry.saveTimer);
  entry.saveTimer = setTimeout(() => {
    entry.saveTimer = null;
    persist(documentId, doc).catch(() => {
      /* best-effort debounced persist; a later update or explicit flush will retry */
    });
  }, PERSIST_DEBOUNCE_MS);

  return update;
}

/** Cancels any pending debounce timer and persists immediately. */
export async function flushPersist(documentId: string): Promise<void> {
  const entry = registry.get(documentId);
  if (!entry) return;

  if (entry.saveTimer) {
    clearTimeout(entry.saveTimer);
    entry.saveTimer = null;
  }
  await persist(documentId, entry.doc);
}

/**
 * Used by version restore: a live Y.Doc cannot be "reset" in place, so this
 * discards the current registry entry and creates a fresh Y.Doc seeded from
 * `newState`, then persists it immediately.
 */
export async function replaceState(documentId: string, newState: Buffer): Promise<void> {
  const existing = registry.get(documentId);
  if (existing?.saveTimer) clearTimeout(existing.saveTimer);

  const doc = new Y.Doc();
  if (newState.length > 0) {
    Y.applyUpdate(doc, new Uint8Array(newState));
  }
  registry.set(documentId, { doc, saveTimer: null });

  await persist(documentId, doc);
}

/** Encodes the current in-memory state as an update to send to a newly joining client. */
export function encodeCurrentState(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}
