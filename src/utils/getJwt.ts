import { randomUUID } from 'node:crypto';

import { JWTHeaderParameters, JWTPayload, SignJWT } from 'jose';

export interface ConnectedAppConfig {
  clientId: string;
  secretId: string;
  secretValue: string;
}

export interface JwtOptions {
  username: string;
  connectedApp: ConnectedAppConfig;
  scopes: Set<string>;
  additionalPayload?: Record<string, unknown>;
  tokenLifetimeMinutes?: number;
}

export async function getJwt({
  username,
  connectedApp,
  scopes,
  additionalPayload,
  tokenLifetimeMinutes = 5,
}: JwtOptions): Promise<string> {
  // Validate inputs
  if (!username || !username.trim()) {
    throw new Error('Username is required for JWT generation');
  }
  
  if (!connectedApp.clientId || !connectedApp.secretId || !connectedApp.secretValue) {
    throw new Error('Connected App credentials are required for JWT generation');
  }
  
  if (!scopes || scopes.size === 0) {
    throw new Error('At least one scope is required for JWT generation');
  }

  const header: JWTHeaderParameters = {
    alg: 'HS256',
    typ: 'JWT',
    kid: connectedApp.secretId,
  };

  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    jti: randomUUID(),
    iss: connectedApp.clientId,
    aud: 'tableau',
    sub: username.trim(), // Ensure clean username
    scp: [...scopes],
    iat: now - 5, // 5 seconds clock skew tolerance
    exp: now + (tokenLifetimeMinutes * 60),
    ...additionalPayload,
  };

  try {
    const token = await new SignJWT(payload)
      .setProtectedHeader(header)
      .sign(new TextEncoder().encode(connectedApp.secretValue));

    return token;
  } catch (error) {
    throw new Error(`Failed to generate JWT for user ${username}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Convenience function for user impersonation
export async function getJwtForUser({
  userEmail,
  connectedApp,
  scopes,
  additionalPayload,
  tokenLifetimeMinutes = 5,
}: {
  userEmail: string;
  connectedApp: ConnectedAppConfig;
  scopes: Set<string>;
  additionalPayload?: Record<string, unknown>;
  tokenLifetimeMinutes?: number;
}): Promise<string> {
  return getJwt({
    username: userEmail,
    connectedApp,
    scopes,
    additionalPayload,
    tokenLifetimeMinutes,
  });
}
