import { log } from '../../../logging/logger.js';
import {
  clearSharedMemoryBackends,
  createOAuthStore,
  defaultCollections,
  getClientsCollection,
  getCodesCollection,
  getFirestoreProjectId,
  getStorageBackend,
  getTokensCollection,
} from './oauthStore.js';

vi.mock('../../../logging/logger.js', () => ({
  log: vi.fn(),
}));

describe('oauthStore env helpers', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('STORAGE_BACKEND', '');
    vi.stubEnv('FIRESTORE_PROJECT_ID', '');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to memory backend when STORAGE_BACKEND is unset', () => {
    expect(getStorageBackend()).toBe('memory');
  });

  it('uses firestore backend when STORAGE_BACKEND=firestore', () => {
    vi.stubEnv('STORAGE_BACKEND', 'firestore');
    expect(getStorageBackend()).toBe('firestore');
  });

  it('treats unknown STORAGE_BACKEND values as memory', () => {
    vi.stubEnv('STORAGE_BACKEND', 'sqlite');
    expect(getStorageBackend()).toBe('memory');
  });

  it('prefers FIRESTORE_PROJECT_ID over GOOGLE_CLOUD_PROJECT', () => {
    vi.stubEnv('FIRESTORE_PROJECT_ID', 'explicit-project');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'runtime-project');
    expect(getFirestoreProjectId()).toBe('explicit-project');
  });

  it('falls back to GOOGLE_CLOUD_PROJECT when FIRESTORE_PROJECT_ID is unset', () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'runtime-project');
    expect(getFirestoreProjectId()).toBe('runtime-project');
  });

  it('returns undefined when no project env var is set', () => {
    expect(getFirestoreProjectId()).toBeUndefined();
  });

  it('returns default collection names when env vars are unset', () => {
    expect(getClientsCollection()).toBe(defaultCollections.clients);
    expect(getCodesCollection()).toBe(defaultCollections.codes);
    expect(getTokensCollection()).toBe(defaultCollections.tokens);
    expect(defaultCollections.clients).toBe('tableau-matthewmillertableau-oauth-clients');
  });

  it('honors collection env var overrides', () => {
    vi.stubEnv('OAUTH_CLIENTS_COLLECTION', 'custom-clients');
    vi.stubEnv('OAUTH_CODES_COLLECTION', 'custom-codes');
    vi.stubEnv('OAUTH_TOKENS_COLLECTION', 'custom-tokens');
    expect(getClientsCollection()).toBe('custom-clients');
    expect(getCodesCollection()).toBe('custom-codes');
    expect(getTokensCollection()).toBe('custom-tokens');
  });
});

describe('oauthStore memory backend', () => {
  type TestValue = { id: string; label: string };

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('STORAGE_BACKEND', 'memory');
    clearSharedMemoryBackends();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  function createTestStore(
    namespace = 'test-store',
    defaultTtlMs?: number,
  ): ReturnType<typeof createOAuthStore<TestValue>> {
    return createOAuthStore<TestValue>({
      namespace,
      collection: 'test-collection',
      defaultTtlMs,
    });
  }

  it('stores and retrieves a value', async () => {
    const store = createTestStore();
    await store.set('key-1', { id: 'key-1', label: 'first' });
    expect(await store.get('key-1')).toEqual({ id: 'key-1', label: 'first' });
  });

  it('returns undefined for a missing key', async () => {
    const store = createTestStore();
    expect(await store.get('missing')).toBeUndefined();
  });

  it('deletes a value and reports whether it existed', async () => {
    const store = createTestStore();
    await store.set('key-1', { id: 'key-1', label: 'first' });
    expect(await store.delete('key-1')).toBe(true);
    expect(await store.get('key-1')).toBeUndefined();
    expect(await store.delete('key-1')).toBe(false);
  });

  it('overwrites an existing value', async () => {
    const store = createTestStore();
    await store.set('key-1', { id: 'key-1', label: 'first' });
    await store.set('key-1', { id: 'key-1', label: 'second' });
    expect(await store.get('key-1')).toEqual({ id: 'key-1', label: 'second' });
  });

  it('clears all values', async () => {
    const store = createTestStore();
    await store.set('key-1', { id: 'key-1', label: 'first' });
    await store.set('key-2', { id: 'key-2', label: 'second' });
    await store.clear();
    expect(await store.get('key-1')).toBeUndefined();
    expect(await store.get('key-2')).toBeUndefined();
  });

  it('supports keys containing "/" (URL client IDs)', async () => {
    const store = createTestStore();
    const urlKey = 'https://client.example.com/.well-known/client-metadata.json';
    await store.set(urlKey, { id: urlKey, label: 'url client' });
    expect(await store.get(urlKey)).toEqual({ id: urlKey, label: 'url client' });
    expect(await store.delete(urlKey)).toBe(true);
  });

  it('expires values after the default TTL', async () => {
    vi.useFakeTimers();
    const store = createTestStore('ttl-store', 10_000);
    await store.set('key-1', { id: 'key-1', label: 'short-lived' });

    vi.advanceTimersByTime(10_000);
    expect(await store.get('key-1')).toBeDefined();

    vi.advanceTimersByTime(1);
    expect(await store.get('key-1')).toBeUndefined();
  });

  it('honors a per-call TTL override', async () => {
    vi.useFakeTimers();
    const store = createTestStore('ttl-override-store', 10_000);
    await store.set('key-1', { id: 'key-1', label: 'long-lived' }, 60_000);

    vi.advanceTimersByTime(10_001);
    expect(await store.get('key-1')).toBeDefined();

    vi.advanceTimersByTime(50_000);
    expect(await store.get('key-1')).toBeUndefined();
  });

  it('never expires values when no TTL is configured', async () => {
    vi.useFakeTimers();
    const store = createTestStore('no-ttl-store');
    await store.set('key-1', { id: 'key-1', label: 'permanent' });

    vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000);
    expect(await store.get('key-1')).toBeDefined();
  });

  it('shares data between store instances with the same namespace (cold start survival)', async () => {
    // First instance writes (first server instance)
    const first = createTestStore('shared-namespace');
    await first.set('refresh-token-abc', { id: 'refresh-token-abc', label: 'issued token' });

    // Second instance created later reads what the first wrote,
    // simulating a Cloud Run cold start creating a fresh provider.
    const second = createTestStore('shared-namespace');
    expect(await second.get('refresh-token-abc')).toEqual({
      id: 'refresh-token-abc',
      label: 'issued token',
    });

    // Deletes are visible across instances too.
    await second.delete('refresh-token-abc');
    expect(await first.get('refresh-token-abc')).toBeUndefined();
  });

  it('isolates data between different namespaces', async () => {
    const codes = createTestStore('namespace-a');
    const tokens = createTestStore('namespace-b');
    await codes.set('same-key', { id: 'same-key', label: 'code' });
    expect(await tokens.get('same-key')).toBeUndefined();
  });
});

describe('oauthStore firestore backend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    clearSharedMemoryBackends();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('keyv-firestore');
  });

  it('falls back to memory when no project ID is available', async () => {
    vi.stubEnv('STORAGE_BACKEND', 'firestore');
    vi.stubEnv('FIRESTORE_PROJECT_ID', '');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');

    const store = createOAuthStore<string>({
      namespace: 'fallback-store',
      collection: 'test-collection',
    });

    await store.set('key-1', 'value-1');
    expect(await store.get('key-1')).toBe('value-1');

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('Falling back to memory backend'),
      }),
    );
  });

  it('constructs keyv-firestore with the project ID and collection', async () => {
    vi.stubEnv('STORAGE_BACKEND', 'firestore');
    vi.stubEnv('FIRESTORE_PROJECT_ID', 'test-project');

    const backing = new Map<string, string>();
    const keyvFirestoreCtor = vi.fn(function (this: Record<string, unknown>) {
      this.get = vi.fn((key: string) => backing.get(key));
      this.set = vi.fn((key: string, value: string) => {
        backing.set(key, value);
      });
      this.delete = vi.fn((key: string) => backing.delete(key));
      this.clear = vi.fn(() => backing.clear());
      this.on = vi.fn();
    });
    vi.doMock('keyv-firestore', () => ({ default: keyvFirestoreCtor }));
    vi.resetModules();

    // Re-import so the module-under-test resolves the mocked keyv-firestore
    const { createOAuthStore: createStore } = await import('./oauthStore.js');
    const store = createStore<{ value: string }>({
      namespace: 'firestore-store',
      collection: 'my-collection',
    });

    await store.set('key-1', { value: 'v1' });

    expect(keyvFirestoreCtor).toHaveBeenCalledWith({
      projectId: 'test-project',
      collection: 'my-collection',
    });
  });

  it('encodes keys so Firestore document IDs never contain "/"', async () => {
    vi.stubEnv('STORAGE_BACKEND', 'firestore');
    vi.stubEnv('FIRESTORE_PROJECT_ID', 'test-project');

    const setSpy = vi.fn();
    const keyvFirestoreCtor = vi.fn(function (this: Record<string, unknown>) {
      this.get = vi.fn();
      this.set = setSpy;
      this.delete = vi.fn();
      this.clear = vi.fn();
      this.on = vi.fn();
    });
    vi.doMock('keyv-firestore', () => ({ default: keyvFirestoreCtor }));
    vi.resetModules();

    const { createOAuthStore: createStore } = await import('./oauthStore.js');
    const store = createStore<string>({
      namespace: 'encode-store',
      collection: 'my-collection',
    });

    await store.set('https://client.example.com/metadata.json', 'value');

    expect(setSpy).toHaveBeenCalled();
    const storedKey = setSpy.mock.calls[0][0] as string;
    expect(storedKey).not.toContain('/');
  });
});
