import { RequestHandler } from 'express';
import express from 'express';

import { getConfig } from '../../../config.js';
import { OAuthProvider } from '../provider.js';
import { GoogleOAuthProvider } from './GoogleOAuthProvider.js';

/**
 * Interface for OAuth providers
 *
 * Both Tableau and Google OAuth providers implement this interface,
 * allowing them to be used interchangeably in the Express server.
 */
export interface IOAuthProvider {
  readonly authMiddleware: RequestHandler;
  setupRoutes(app: express.Application): void;
}

/**
 * Factory function to create the appropriate OAuth provider
 *
 * Returns GoogleOAuthProvider when OAUTH_PROVIDER=google,
 * otherwise returns the default Tableau OAuthProvider.
 */
export function createOAuthProvider(): IOAuthProvider {
  const config = getConfig();

  if (config.oauth.provider === 'google') {
    return new GoogleOAuthProvider();
  }

  return new OAuthProvider();
}
