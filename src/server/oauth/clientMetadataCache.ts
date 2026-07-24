import { milliseconds } from '../../utils/milliseconds.js';
import { ClientMetadata } from './schemas.js';
import { createOAuthStore, getClientsCollection } from './stores/oauthStore.js';

export const CLIENT_METADATA_DEFAULT_TTL_MS = milliseconds.fromMinutes(10);

/**
 * Cache of client metadata documents fetched from URL client IDs (CIMD).
 * Persisted via the OAuth store layer so dynamically registered client
 * lookups survive Cloud Run cold starts. Entries expire after the TTL
 * supplied at set() time (from the Cache-Control header) or after
 * CLIENT_METADATA_DEFAULT_TTL_MS.
 */
export const clientMetadataCache = createOAuthStore<ClientMetadata>({
  namespace: 'client-metadata',
  collection: getClientsCollection(),
  defaultTtlMs: CLIENT_METADATA_DEFAULT_TTL_MS,
});
