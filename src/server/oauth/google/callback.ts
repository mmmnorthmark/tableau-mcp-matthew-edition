import { randomBytes } from 'crypto';
import express from 'express';
import { Err, Ok, Result } from 'ts-results-es';
import { fromError } from 'zod-validation-error';

import { getConfig } from '../../../config.js';
import { axios } from '../../../utils/axios.js';
import {
  GoogleAuthorizationCode,
  GooglePendingAuthorization,
  GoogleUser,
} from '../providers/GoogleOAuthProvider.js';
import { callbackSchema } from '../schemas.js';

/**
 * Google OAuth Callback Handler
 *
 * Receives callback from Google OAuth after user authorization.
 * Exchanges code for tokens, extracts user info from ID token,
 * generates MCP authorization code, and redirects back to client.
 */
export function googleCallback(
  app: express.Application,
  pendingAuthorizations: Map<string, GooglePendingAuthorization>,
  authorizationCodes: Map<string, GoogleAuthorizationCode>,
): void {
  const config = getConfig();

  app.get('/Callback', async (req, res) => {
    const result = callbackSchema.safeParse(req.query);

    if (!result.success) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: fromError(result.error).toString(),
      });
      return;
    }

    const { error, code, state } = result.data;

    if (error) {
      res.status(400).json({
        error: 'access_denied',
        error_description: 'User denied authorization',
      });
      return;
    }

    try {
      // Parse state to get auth key and Google state
      const [authKey, googleState] = state?.split(':') ?? [];
      const pendingAuth = pendingAuthorizations.get(authKey);

      if (!pendingAuth || pendingAuth.googleState !== googleState) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Invalid state parameter',
        });
        return;
      }

      // Exchange authorization code for tokens
      const tokensResult = await exchangeGoogleAuthorizationCode({
        code: code ?? '',
        redirectUri: config.oauth.redirectUri,
        clientId: config.oauth.googleClientId,
        clientSecret: config.oauth.googleClientSecret,
        codeVerifier: pendingAuth.googleCodeVerifier,
      });

      if (tokensResult.isErr()) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: tokensResult.error,
        });
        return;
      }

      const { idToken } = tokensResult.value;

      // Extract user info from ID token
      const userResult = extractUserFromIdToken(idToken);
      if (userResult.isErr()) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: userResult.error,
        });
        return;
      }

      const user = userResult.value;

      // Check if user is allowed (if allowlist is configured)
      if (config.oauth.allowedGoogleEmails.length > 0) {
        if (!config.oauth.allowedGoogleEmails.includes(user.email)) {
          res.status(403).json({
            error: 'access_denied',
            error_description: `Email ${user.email} is not authorized to access this server`,
          });
          return;
        }
      }

      // Generate authorization code
      const authorizationCode = randomBytes(32).toString('hex');
      authorizationCodes.set(authorizationCode, {
        clientId: pendingAuth.clientId,
        redirectUri: pendingAuth.redirectUri,
        codeChallenge: pendingAuth.codeChallenge,
        user,
        expiresAt: Math.floor((Date.now() + config.oauth.authzCodeTimeoutMs) / 1000),
      });

      // Clean up
      pendingAuthorizations.delete(authKey);

      // Redirect back to client with authorization code
      const redirectUrl = new URL(pendingAuth.redirectUri);
      redirectUrl.searchParams.set('code', authorizationCode);
      redirectUrl.searchParams.set('state', pendingAuth.state);

      res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Internal server error during authorization. Contact your administrator.',
      });
    }
  });
}

/**
 * Exchanges Google authorization code for tokens
 */
async function exchangeGoogleAuthorizationCode({
  code,
  redirectUri,
  clientId,
  clientSecret,
  codeVerifier,
}: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  codeVerifier: string;
}): Promise<Result<{ accessToken: string; idToken: string; refreshToken?: string }, string>> {
  try {
    const response = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const { access_token, id_token, refresh_token } = response.data;

    if (!access_token || !id_token) {
      return Err('Invalid token response from Google');
    }

    return Ok({
      accessToken: access_token,
      idToken: id_token,
      refreshToken: refresh_token,
    });
  } catch (error) {
    console.error('Failed to exchange Google authorization code:', error);
    return Err('Failed to exchange authorization code with Google');
  }
}

/**
 * Extracts user information from Google ID token (JWT)
 *
 * Note: We don't verify the signature here since we just received it
 * directly from Google's token endpoint over HTTPS.
 */
function extractUserFromIdToken(idToken: string): Result<GoogleUser, string> {
  try {
    // ID token is a JWT: header.payload.signature
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      return Err('Invalid ID token format');
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

    const { email, name, picture } = payload;

    if (!email) {
      return Err('ID token missing email claim');
    }

    return Ok({
      email,
      name: name || email.split('@')[0],
      picture,
    });
  } catch (error) {
    console.error('Failed to parse Google ID token:', error);
    return Err('Failed to parse ID token');
  }
}
