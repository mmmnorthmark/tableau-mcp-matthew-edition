/**
 * Identity-gateway Express middleware.
 *
 * Runs BEFORE the OAuth bearer middleware and does two things:
 *
 * 1. Header promotion (Mode 3): when an edge proxy consumes the
 *    Authorization header for its own hop auth (e.g. a Cloudflare Worker
 *    minting a Google ID token for Cloud Run), the original client bearer
 *    arrives in `X-Forwarded-Authorization`. Promote it back to
 *    `Authorization` so the OAuth middleware finds it where it expects.
 *    No-op when the header is absent — safe to deploy unconditionally.
 *
 * 2. Gateway identity: when the configured identity header (default
 *    `cf-access-jwt-assertion`) carries a JWT that verifies against the
 *    gateway's JWKS, the request is authenticated WITHOUT a bearer token —
 *    the gateway (e.g. Cloudflare Access via the MCP portal) already
 *    vouched for the user. We set `req.auth` with the minimal shape the
 *    MCP handler needs (mirroring the Google OAuth direct-trust path:
 *    username + server + siteName, no Tableau tokens — the server's
 *    configured direct-trust connected app signs in downstream), and run
 *    the rest of the request inside `identityContext` so the tool-call
 *    layer can read the verified identity for role-based authorization.
 *
 * On an invalid/unverifiable JWT the request falls through WITHOUT an
 * identity (no 401 here) — the OAuth middleware then applies its normal
 * bearer-token rules. When no identity-gateway env vars are configured the
 * middleware is a pure pass-through and existing behavior is unchanged.
 */

import { NextFunction, RequestHandler, Response } from 'express';

import { getConfig } from '../../config.js';
import { log } from '../../logging/logger.js';
import { AuthenticatedRequest } from '../oauth/types.js';
import {
  getIdentityHeaderName,
  identityContext,
  isIdentityGatewayConfigured,
  verifyIdentityJwt,
} from './identityJwtVerifier.js';

export const X_FORWARDED_AUTHORIZATION_HEADER = 'x-forwarded-authorization';

export function identityGatewayMiddleware(): RequestHandler {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    // Mode 3 header promotion: restore the client's original bearer token
    // when an edge proxy moved it aside. No-op when the header is absent.
    const forwarded = req.headers[X_FORWARDED_AUTHORIZATION_HEADER];
    if (forwarded) {
      req.headers.authorization = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    }

    if (!isIdentityGatewayConfigured()) {
      next();
      return;
    }

    const headerValue = req.headers[getIdentityHeaderName()];
    const jwt = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!jwt) {
      next();
      return;
    }

    const identity = await verifyIdentityJwt(jwt);
    if (!identity) {
      // Invalid gateway JWT: fall through without identity. The OAuth
      // middleware decides whether the request is otherwise authorized.
      next();
      return;
    }

    log({
      message: `Identity gateway verified user '${identity.email}'`,
      level: 'debug',
      logger: 'auth',
    });

    // Gateway-vouched requests are authenticated without a bearer token.
    // Mirror the minimal AuthInfo shape the Google OAuth direct-trust path
    // produces so getTableauAuthInfo(req.auth) yields a valid
    // TableauAuthInfo and downstream tools sign in with the server's
    // configured connected app. Respect req.auth set by earlier middleware.
    if (!req.auth) {
      const config = getConfig();
      req.auth = {
        token: jwt,
        clientId: 'identity-gateway',
        // MCP scopes are not enforced for gateway-authenticated requests;
        // role-based authorization (roleAuthz) gates tools instead.
        scopes: [],
        extra: {
          type: 'X-Tableau-Auth',
          username: identity.email,
          server: config.server,
          siteName: config.siteName,
        },
      };
    }

    identityContext.run(identity, () => next());
  };
}
