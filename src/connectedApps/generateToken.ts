import jwt from 'jsonwebtoken';

import { getConfig } from '../config.js';

export interface ConnectedAppsTokenParams {
  sub: string; // Tableau username
  ttlSec?: number; // Token time-to-live in seconds (default: 300, max: 600)
  metricUrl?: string; // Optional: validate against this URL
}

export interface ConnectedAppsToken {
  token: string;
  expiresAt: Date;
}

/**
 * Generate a Connected Apps JWT token for Tableau embedding
 *
 * Uses Direct Trust authentication to create short-lived tokens for embedding Tableau content.
 * The token is signed server-side with the Connected App secret and includes the required scopes
 * for Pulse metric embedding.
 *
 * @param params - Token generation parameters
 * @returns The signed JWT token and expiration time
 * @throws Error if Connected Apps credentials are not configured or if metric URL validation fails
 */
export function generateConnectedAppsToken(
  params: ConnectedAppsTokenParams,
): ConnectedAppsToken {
  const { sub, ttlSec = 300, metricUrl } = params;
  const config = getConfig();

  // Validate Connected Apps configuration
  const clientId = config.connectedAppClientId;
  const secretId = config.connectedAppSecretId;
  const secretValue = config.connectedAppSecretValue;

  if (!clientId || !secretId || !secretValue) {
    throw new Error(
      'Connected Apps credentials not configured. Set CONNECTED_APP_CLIENT_ID, ' +
        'CONNECTED_APP_SECRET_ID, and CONNECTED_APP_SECRET_VALUE environment variables.',
    );
  }

  // Validate TTL bounds
  const boundedTtl = Math.min(Math.max(ttlSec, 60), 600);
  if (boundedTtl !== ttlSec) {
    throw new Error(`TTL must be between 60 and 600 seconds. Requested: ${ttlSec}`);
  }

  // Optional: validate metric URL matches configured Tableau host
  if (metricUrl) {
    const tableauHost = config.server;
    if (!tableauHost) {
      throw new Error('SERVER not configured but metricUrl validation requested');
    }

    const metricUrlObj = new URL(metricUrl);
    const expectedHost = new URL(tableauHost).host;

    if (metricUrlObj.host !== expectedHost) {
      throw new Error(
        `Metric URL host (${metricUrlObj.host}) does not match configured Tableau host (${expectedHost})`,
      );
    }
  }

  // Generate Connected Apps JWT (Direct Trust)
  const now = Math.floor(Date.now() / 1000);
  const exp = now + boundedTtl;

  const payload = {
    iss: clientId,
    exp,
    jti: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    aud: 'tableau',
    sub,
    scp: ['tableau:views:embed', 'tableau:metrics:embed'],
  };

  const header = {
    alg: 'HS256' as const,
    typ: 'JWT',
    kid: secretId,
    iss: clientId,
  };

  const token = jwt.sign(payload, secretValue, {
    algorithm: 'HS256',
    header,
  });

  return {
    token,
    expiresAt: new Date(exp * 1000),
  };
}
