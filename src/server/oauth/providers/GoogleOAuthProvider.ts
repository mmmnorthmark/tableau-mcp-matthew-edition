import { createPrivateKey, createPublicKey, KeyObject } from 'crypto';
import express, { RequestHandler } from 'express';
import { readFileSync } from 'fs';

import { getConfig } from '../../../config.js';
import { oauthAuthorizationServer } from '../.well-known/oauth-authorization-server.js';
import { oauthProtectedResource } from '../.well-known/oauth-protected-resource.js';
import { authMiddleware } from '../authMiddleware.js';
import { googleAuthorize } from '../google/authorize.js';
import { googleCallback } from '../google/callback.js';
import { googleToken } from '../google/token.js';
import { register } from '../register.js';
import { IOAuthProvider } from './index.js';

// Re-export for use in Google OAuth modules
export const AUDIENCE = 'tableau-mcp-server';

/**
 * Google OAuth types for pending authorizations and authorization codes
 */
export type GooglePendingAuthorization = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  googleState: string;
  googleCodeVerifier: string;
};

export type GoogleUser = {
  email: string;
  name: string;
  picture?: string;
};

export type GoogleAuthorizationCode = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  user: GoogleUser;
  expiresAt: number;
};

export type GoogleRefreshTokenData = {
  user: GoogleUser;
  clientId: string;
  expiresAt: number;
};

/**
 * Google OAuth 2.1 Provider
 *
 * Implements OAuth 2.1 flow with PKCE using Google as the identity provider.
 * Users authenticate with Google, and the server issues MCP access tokens
 * backed by Google identity. Tableau API access uses direct-trust.
 */
export class GoogleOAuthProvider implements IOAuthProvider {
  private readonly config = getConfig();

  private readonly pendingAuthorizations = new Map<string, GooglePendingAuthorization>();
  private readonly authorizationCodes = new Map<string, GoogleAuthorizationCode>();
  private readonly refreshTokens = new Map<string, GoogleRefreshTokenData>();

  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor() {
    this.privateKey = this.getPrivateKey();
    this.publicKey = createPublicKey(this.privateKey);
  }

  get authMiddleware(): RequestHandler {
    return authMiddleware(this.privateKey);
  }

  setupRoutes(app: express.Application): void {
    // .well-known/oauth-authorization-server (reuse existing)
    oauthAuthorizationServer(app);

    // .well-known/oauth-protected-resource (reuse existing)
    oauthProtectedResource(app);

    // oauth/register (reuse existing - generic PKCE registration)
    register(app);

    // oauth/authorize (Google-specific)
    googleAuthorize(app, this.pendingAuthorizations);

    // /Callback (Google-specific)
    googleCallback(app, this.pendingAuthorizations, this.authorizationCodes);

    // oauth/token (Google-specific)
    googleToken(app, this.authorizationCodes, this.refreshTokens, this.publicKey);
  }

  private getPrivateKey(): KeyObject {
    let privateKeyContents = this.config.oauth.jwePrivateKey.replace(/\\n/g, '\n');
    if (!privateKeyContents) {
      try {
        privateKeyContents = readFileSync(this.config.oauth.jwePrivateKeyPath, 'utf8');
      } catch {
        throw new Error('Failed to read private key file');
      }
    }

    try {
      return createPrivateKey({
        key: privateKeyContents,
        format: 'pem',
        passphrase: this.config.oauth.jwePrivateKeyPassphrase,
      });
    } catch {
      throw new Error('Failed to create private key');
    }
  }
}
