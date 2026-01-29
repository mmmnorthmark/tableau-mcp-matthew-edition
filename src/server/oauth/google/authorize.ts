import { randomBytes } from 'crypto';
import express from 'express';
import { fromError } from 'zod-validation-error';

import { getConfig } from '../../../config.js';
import { setLongTimeout } from '../../../utils/setLongTimeout.js';
import { generateCodeChallenge } from '../generateCodeChallenge.js';
import { isValidRedirectUri } from '../isValidRedirectUri.js';
import { GooglePendingAuthorization } from '../providers/GoogleOAuthProvider.js';
import { mcpAuthorizeSchema } from '../schemas.js';

/**
 * Google OAuth 2.1 Authorization Endpoint
 *
 * Handles MCP client authorization requests with PKCE parameters.
 * Validates request, stores pending authorization, and
 * redirects to Google OAuth.
 */
export function googleAuthorize(
  app: express.Application,
  pendingAuthorizations: Map<string, GooglePendingAuthorization>,
): void {
  const config = getConfig();

  app.get('/oauth/authorize', async (req, res) => {
    const result = mcpAuthorizeSchema.safeParse(req.query);

    if (!result.success) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: fromError(result.error).toString(),
      });
      return;
    }

    const { client_id, redirect_uri, response_type, code_challenge, code_challenge_method, state } =
      result.data;

    if (response_type !== 'code') {
      res.status(400).json({
        error: 'unsupported_response_type',
        error_description: 'Only authorization code flow is supported',
      });
      return;
    }

    if (code_challenge_method !== 'S256') {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'Only S256 code challenge method is supported',
      });
      return;
    }

    if (!isValidRedirectUri(redirect_uri)) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: `Invalid redirect URI: ${redirect_uri}`,
      });
      return;
    }

    // Generate Google state and store pending authorization
    const googleState = randomBytes(32).toString('hex');
    const authKey = randomBytes(32).toString('hex');

    // Generate PKCE code verifier for Google OAuth
    const numCodeVerifierBytes = Math.floor(Math.random() * (64 - 22 + 1)) + 22;
    const googleCodeVerifier = randomBytes(numCodeVerifierBytes).toString('hex');

    pendingAuthorizations.set(authKey, {
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      state: state ?? '',
      googleState,
      googleCodeVerifier,
    });

    // Clean up expired authorizations
    setLongTimeout(() => pendingAuthorizations.delete(authKey), config.oauth.authzCodeTimeoutMs);

    // Redirect to Google OAuth
    const googleClientId = config.oauth.googleClientId;
    if (!googleClientId) {
      res.status(500).json({
        error: 'server_error',
        error_description: 'Google OAuth is not configured. Missing GOOGLE_CLIENT_ID.',
      });
      return;
    }

    const oauthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    oauthUrl.searchParams.set('client_id', googleClientId);
    oauthUrl.searchParams.set('redirect_uri', config.oauth.redirectUri);
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('scope', 'openid email profile');
    oauthUrl.searchParams.set('state', `${authKey}:${googleState}`);
    oauthUrl.searchParams.set('access_type', 'offline'); // Request refresh token
    oauthUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token

    // Google OAuth supports PKCE
    const googleCodeChallenge = generateCodeChallenge(googleCodeVerifier);
    oauthUrl.searchParams.set('code_challenge', googleCodeChallenge);
    oauthUrl.searchParams.set('code_challenge_method', 'S256');

    res.redirect(oauthUrl.toString());
  });
}
