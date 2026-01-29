import { KeyObject, randomBytes } from 'crypto';
import express from 'express';
import { CompactEncrypt } from 'jose';
import { fromError } from 'zod-validation-error';

import { getConfig } from '../../../config.js';
import { setLongTimeout } from '../../../utils/setLongTimeout.js';
import { generateCodeChallenge } from '../generateCodeChallenge.js';
import {
  AUDIENCE,
  GoogleAuthorizationCode,
  GoogleRefreshTokenData,
  GoogleUser,
} from '../providers/GoogleOAuthProvider.js';
import { mcpTokenSchema } from '../schemas.js';

/**
 * Google OAuth 2.1 Token Endpoint
 *
 * Exchanges MCP authorization code for access token.
 * Verifies PKCE code_verifier matches the original challenge.
 * Returns JWE containing Google user identity for MCP authentication.
 *
 * Note: We don't store Google tokens since Tableau uses direct-trust.
 * The JWE contains the user's email which maps to Tableau via JWT_SUB_CLAIM={OAUTH_USERNAME}
 */
export function googleToken(
  app: express.Application,
  authorizationCodes: Map<string, GoogleAuthorizationCode>,
  refreshTokens: Map<string, GoogleRefreshTokenData>,
  publicKey: KeyObject,
): void {
  const config = getConfig();

  app.post('/oauth/token', async (req, res) => {
    const result = mcpTokenSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: fromError(result.error).toString(),
      });
      return;
    }

    // Client credentials grant is not supported for Google OAuth
    // (it requires Tableau tokens which we don't have)
    if (result.data.grantType === 'client_credentials') {
      res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Client credentials grant is not supported with Google OAuth',
      });
      return;
    }

    try {
      switch (result.data.grantType) {
        case 'authorization_code': {
          // Handle authorization code exchange
          const { code, codeVerifier } = result.data;
          const authCode = authorizationCodes.get(code);

          if (!authCode || authCode.expiresAt < Math.floor(Date.now() / 1000)) {
            authorizationCodes.delete(code);
            res.status(400).json({
              error: 'invalid_grant',
              error_description: 'Invalid or expired authorization code',
            });
            return;
          }

          // Verify PKCE
          const challengeFromVerifier = generateCodeChallenge(codeVerifier);
          if (challengeFromVerifier !== authCode.codeChallenge) {
            res.status(400).json({
              error: 'invalid_grant',
              error_description: 'Invalid code verifier',
            });
            return;
          }

          // Generate tokens
          const refreshTokenId = randomBytes(32).toString('hex');
          const accessToken = await createGoogleAccessToken(authCode.user, authCode.clientId, publicKey);

          refreshTokens.set(refreshTokenId, {
            user: authCode.user,
            clientId: authCode.clientId,
            expiresAt: Math.floor((Date.now() + config.oauth.refreshTokenTimeoutMs) / 1000),
          });

          setLongTimeout(
            () => refreshTokens.delete(refreshTokenId),
            config.oauth.refreshTokenTimeoutMs,
          );

          authorizationCodes.delete(code);

          res.json({
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: config.oauth.accessTokenTimeoutMs / 1000,
            refresh_token: refreshTokenId,
          });
          return;
        }

        case 'refresh_token': {
          // Handle refresh token
          const { refreshToken } = result.data;
          const tokenData = refreshTokens.get(refreshToken);

          if (!tokenData || tokenData.expiresAt < Math.floor(Date.now() / 1000)) {
            refreshTokens.delete(refreshToken);
            res.status(400).json({
              error: 'invalid_grant',
              error_description: 'Invalid or expired refresh token',
            });
            return;
          }

          // Generate new access token
          const accessToken = await createGoogleAccessToken(
            tokenData.user,
            tokenData.clientId,
            publicKey,
          );

          // Rotate the refresh token
          refreshTokens.delete(refreshToken);
          const newRefreshTokenId = randomBytes(32).toString('hex');

          refreshTokens.set(newRefreshTokenId, {
            user: tokenData.user,
            clientId: tokenData.clientId,
            expiresAt: Math.floor((Date.now() + config.oauth.refreshTokenTimeoutMs) / 1000),
          });

          setLongTimeout(
            () => refreshTokens.delete(newRefreshTokenId),
            config.oauth.refreshTokenTimeoutMs,
          );

          res.json({
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: config.oauth.accessTokenTimeoutMs / 1000,
            refresh_token: newRefreshTokenId,
          });
          return;
        }
      }
    } catch (error) {
      console.error('Token endpoint error:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Internal server error',
      });
      return;
    }
  });
}

/**
 * Creates JWE access token containing Google user identity
 *
 * The token includes:
 * - sub: Google email (used for Tableau user mapping via {OAUTH_USERNAME})
 * - tableauServer: From config (direct-trust doesn't need per-user server)
 *
 * The authMiddleware will extract these and create TableauAuthInfo
 * which flows through to tool execution and JWT generation.
 */
async function createGoogleAccessToken(
  user: GoogleUser,
  clientId: string,
  publicKey: KeyObject,
): Promise<string> {
  const config = getConfig();

  const payload = JSON.stringify({
    sub: user.email, // This becomes the Tableau username via {OAUTH_USERNAME}
    clientId,
    tableauServer: config.server, // Direct-trust uses configured server
    // Note: No tableauUserId since we don't have it from Google
    // Note: No tableauAccessToken/refreshToken since we use direct-trust
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor((Date.now() + config.oauth.accessTokenTimeoutMs) / 1000),
    aud: AUDIENCE,
    iss: config.oauth.issuer,
    // Extra claims for debugging/logging
    googleEmail: user.email,
    googleName: user.name,
  });

  const jwe = await new CompactEncrypt(new TextEncoder().encode(payload))
    .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
    .encrypt(publicKey);

  return jwe;
}
