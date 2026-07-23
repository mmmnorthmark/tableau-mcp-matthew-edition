import express, { RequestHandler } from 'express';

import { getConfig } from '../../../config.js';
import { EmbeddedOAuthProvider, TableauOAuthProvider } from '../provider.js';
import { GoogleOAuthProvider } from './GoogleOAuthProvider.js';

/**
 * Interface for OAuth providers
 *
 * Tableau (embedded or external authz server) and Google OAuth providers all
 * implement this interface, allowing them to be used interchangeably in the
 * Express server.
 */
export interface IOAuthProvider {
  readonly authMiddleware: RequestHandler;
  setupRoutes(app: express.Application): void;
}

/**
 * Factory function to create the appropriate OAuth provider
 *
 * Returns GoogleOAuthProvider when OAUTH_PROVIDER=google, otherwise the
 * embedded or Tableau authorization-server provider per OAUTH_EMBEDDED_AUTHZ_SERVER.
 */
export function createOAuthProvider(): IOAuthProvider {
  const config = getConfig();

  if (config.oauth.provider === 'google') {
    return new GoogleOAuthProvider();
  }

  return config.oauth.embeddedAuthzServer
    ? new EmbeddedOAuthProvider()
    : new TableauOAuthProvider();
}
