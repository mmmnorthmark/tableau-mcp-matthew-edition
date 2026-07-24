import Keyv from 'keyv';

import { log } from '../../../logging/logger.js';

/**
 * Env-driven persistence layer for OAuth server state.
 *
 * Backs the OAuth stores (pending authorizations, authorization codes,
 * refresh tokens, client metadata) with a Keyv store so they survive
 * Cloud Run cold starts and redeploys. Backend is selected by env at
 * store construction:
 *
 *   - STORAGE_BACKEND=memory (or unset)  — in-process Map (local dev, tests)
 *   - STORAGE_BACKEND=firestore          — Firestore via keyv-firestore
 *
 * Firestore mode requires FIRESTORE_PROJECT_ID (falls back to
 * GOOGLE_CLOUD_PROJECT, the Cloud Run-provided project env var). If neither
 * is set, the store logs an error and falls back to memory.
 *
 * Note on keyv-firestore document layout: documents are written under
 * `{collection}/{namespace}:{key}`. Keys are encodeURIComponent-encoded
 * before storage because Firestore document IDs cannot contain '/'
 * (e.g. URL client IDs used for client metadata).
 *
 * Memory mode shares one underlying Map per namespace across store
 * instances, mirroring how all instances in firestore mode share one
 * Firestore database.
 */

export type OAuthStore<T> = {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
};

export type OAuthStoreOptions = {
  /** Keyv namespace, unique per store (e.g. 'refresh-tokens'). */
  namespace: string;
  /** Firestore collection name (ignored in memory mode). */
  collection: string;
  /** Default TTL applied on set() when no per-call TTL is given. Omit for no expiry. */
  defaultTtlMs?: number;
};

type StorageBackend = 'memory' | 'firestore';

export function getStorageBackend(): StorageBackend {
  return process.env.STORAGE_BACKEND?.toLowerCase() === 'firestore' ? 'firestore' : 'memory';
}

export function getFirestoreProjectId(): string | undefined {
  return process.env.FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || undefined;
}

export const defaultCollections = {
  clients: 'tableau-matthewmillertableau-oauth-clients',
  codes: 'tableau-matthewmillertableau-oauth-codes',
  tokens: 'tableau-matthewmillertableau-oauth-tokens',
} as const;

export function getClientsCollection(): string {
  return process.env.OAUTH_CLIENTS_COLLECTION || defaultCollections.clients;
}

export function getCodesCollection(): string {
  return process.env.OAUTH_CODES_COLLECTION || defaultCollections.codes;
}

export function getTokensCollection(): string {
  return process.env.OAUTH_TOKENS_COLLECTION || defaultCollections.tokens;
}

// Memory mode: one shared Map per namespace so that every store instance for a
// namespace reads and writes the same data, matching firestore-mode semantics.
const sharedMemoryBackends = new Map<string, Map<string, unknown>>();

function getSharedMemoryBackend(namespace: string): Map<string, unknown> {
  let backend = sharedMemoryBackends.get(namespace);
  if (!backend) {
    backend = new Map<string, unknown>();
    sharedMemoryBackends.set(namespace, backend);
  }
  return backend;
}

/** Test-only: clears all shared memory backends. */
export function clearSharedMemoryBackends(): void {
  sharedMemoryBackends.clear();
}

async function initializeKeyv<T>(
  options: OAuthStoreOptions,
  backend: StorageBackend,
  projectId: string | undefined,
): Promise<Keyv<T>> {
  const { namespace, collection, defaultTtlMs } = options;

  if (backend === 'firestore') {
    if (!projectId) {
      log({
        message: `OAuth store '${namespace}': STORAGE_BACKEND=firestore but neither FIRESTORE_PROJECT_ID nor GOOGLE_CLOUD_PROJECT is set. Falling back to memory backend.`,
        level: 'error',
        logger: 'oauth',
      });
    } else {
      log({
        message: `OAuth store '${namespace}': using firestore backend (project=${projectId}, collection=${collection})`,
        level: 'info',
        logger: 'oauth',
      });
      const KeyvFirestore = (await import('keyv-firestore')).default;
      const firestoreStore = new KeyvFirestore({ projectId, collection });
      return new Keyv<T>({ store: firestoreStore, namespace, ttl: defaultTtlMs });
    }
  }

  return new Keyv<T>({
    store: getSharedMemoryBackend(namespace),
    namespace,
    ttl: defaultTtlMs,
  });
}

/**
 * Creates an OAuth store. Backend selection (env) happens at construction;
 * the underlying Keyv instance is created lazily on first use because the
 * firestore adapter is loaded via dynamic import.
 */
export function createOAuthStore<T>(options: OAuthStoreOptions): OAuthStore<T> {
  // Env is read once at construction; the Keyv instance itself is created lazily.
  const backend = getStorageBackend();
  const projectId = getFirestoreProjectId();

  let keyvPromise: Promise<Keyv<T>> | undefined;

  const getKeyv = (): Promise<Keyv<T>> => {
    if (!keyvPromise) {
      keyvPromise = initializeKeyv<T>(options, backend, projectId).then((keyv) => {
        keyv.on('error', (error: Error) => {
          log({
            message: `OAuth store '${options.namespace}' error: ${error.message}`,
            level: 'error',
            logger: 'oauth',
            data: error,
          });
        });
        return keyv;
      });
    }
    return keyvPromise;
  };

  // Firestore document IDs cannot contain '/', but some keys are URLs.
  const encodeKey = (key: string): string => encodeURIComponent(key);

  return {
    async get(key: string): Promise<T | undefined> {
      const keyv = await getKeyv();
      return await keyv.get(encodeKey(key));
    },
    async set(key: string, value: T, ttlMs?: number): Promise<void> {
      const keyv = await getKeyv();
      await keyv.set(encodeKey(key), value, ttlMs);
    },
    async delete(key: string): Promise<boolean> {
      const keyv = await getKeyv();
      return await keyv.delete(encodeKey(key));
    },
    async clear(): Promise<void> {
      const keyv = await getKeyv();
      await keyv.clear();
    },
  };
}
