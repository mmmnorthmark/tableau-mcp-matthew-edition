import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { stubDefaultEnvVars } from '../../testShared.js';

// ---------------------------------------------------------------------------
// Shared crypto setup. Signing is the expensive part — generate one keypair
// for the whole suite and serve its public JWK from the stubbed fetch.
// ---------------------------------------------------------------------------

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let jwksResponseBody: string;

beforeAll(async () => {
  const keyPair = await generateKeyPair('RS256');
  privateKey = keyPair.privateKey;
  const publicJwk = await exportJWK(keyPair.publicKey);
  publicJwk.kid = 'test-key-1';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  jwksResponseBody = JSON.stringify({ keys: [publicJwk] });
});

function stubFetchToServeJwks(expectedUrl: string): void {
  type FetchInput = Parameters<typeof fetch>[0];
  globalThis.fetch = vi.fn(async (url: FetchInput) => {
    if (url.toString() === expectedUrl) {
      return new Response(jwksResponseBody, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
}

interface SignOpts {
  iss: string;
  aud: string | string[];
  sub?: string;
  exp?: number;
  emailClaim?: string;
  email?: string;
  groupsClaim?: string;
  groups?: unknown;
}

async function signTestJwt(opts: SignOpts): Promise<string> {
  const payload: Record<string, unknown> = {};
  if (opts.email !== undefined) {
    payload[opts.emailClaim ?? 'email'] = opts.email;
  }
  if (opts.groups !== undefined) {
    payload[opts.groupsClaim ?? 'groups'] = opts.groups;
  }

  const builder = new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
    .setIssuedAt()
    .setIssuer(opts.iss)
    .setAudience(opts.aud)
    .setSubject(opts.sub ?? 'user-sub-123');
  if (opts.exp !== undefined) {
    builder.setExpirationTime(opts.exp);
  } else {
    builder.setExpirationTime('5m');
  }
  return builder.sign(privateKey);
}

function clearIdentityEnv(): void {
  vi.stubEnv('IDENTITY_HEADER', '');
  vi.stubEnv('IDENTITY_JWKS_URL', '');
  vi.stubEnv('IDENTITY_ISSUER', '');
  vi.stubEnv('IDENTITY_AUDIENCE', '');
  vi.stubEnv('IDENTITY_EMAIL_CLAIM', '');
  vi.stubEnv('IDENTITY_GROUPS_CLAIM', '');
  vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', '');
  vi.stubEnv('CF_ACCESS_AUD', '');
}

// ---------------------------------------------------------------------------
// Feature disabled by default
// ---------------------------------------------------------------------------

describe('verifyIdentityJwt — disabled by default', () => {
  beforeEach(() => {
    vi.resetModules();
    clearIdentityEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    stubDefaultEnvVars();
    vi.restoreAllMocks();
  });

  it('returns null without throwing when no config env vars are set', async () => {
    const { verifyIdentityJwt } = await import('./identityJwtVerifier.js');
    await expect(verifyIdentityJwt('anything')).resolves.toBeNull();
  });

  it('reports the gateway as not configured', async () => {
    const { isIdentityGatewayConfigured } = await import('./identityJwtVerifier.js');
    expect(isIdentityGatewayConfigured()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cloudflare back-compat: CF_ACCESS_* alias derivation
// ---------------------------------------------------------------------------

describe('verifyIdentityJwt — CF_ACCESS_* alias derivation', () => {
  const TEAM = 'northmark';
  const AUD = 'test-app-aud-tag-deadbeef';
  const ISSUER = `https://${TEAM}.cloudflareaccess.com`;
  const JWKS_URL = `https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`;

  beforeEach(() => {
    vi.resetModules();
    clearIdentityEnv();
    vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', TEAM);
    vi.stubEnv('CF_ACCESS_AUD', AUD);
    stubFetchToServeJwks(JWKS_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    stubDefaultEnvVars();
    vi.restoreAllMocks();
  });

  it('derives JWKS URL / issuer / audience from CF_ACCESS_* and verifies a valid JWT', async () => {
    const { verifyIdentityJwt, isIdentityGatewayConfigured } =
      await import('./identityJwtVerifier.js');
    expect(isIdentityGatewayConfigured()).toBe(true);

    const jwt = await signTestJwt({ iss: ISSUER, aud: AUD, email: 'matthew@example.com' });
    await expect(verifyIdentityJwt(jwt)).resolves.toEqual({
      email: 'matthew@example.com',
      sub: 'user-sub-123',
      groups: [],
    });
  });

  it('returns null when CF_ACCESS_AUD is unset (feature disabled)', async () => {
    vi.stubEnv('CF_ACCESS_AUD', '');
    const { verifyIdentityJwt } = await import('./identityJwtVerifier.js');
    const jwt = await signTestJwt({ iss: ISSUER, aud: AUD, email: 'matthew@example.com' });
    await expect(verifyIdentityJwt(jwt)).resolves.toBeNull();
  });

  it('returns null when the audience does not match the derived AUD', async () => {
    const { verifyIdentityJwt } = await import('./identityJwtVerifier.js');
    const jwt = await signTestJwt({
      iss: ISSUER,
      aud: 'some-other-app-aud',
      email: 'matthew@example.com',
    });
    await expect(verifyIdentityJwt(jwt)).resolves.toBeNull();
  });

  it('returns null when the issuer does not match the derived issuer', async () => {
    const { verifyIdentityJwt } = await import('./identityJwtVerifier.js');
    const jwt = await signTestJwt({
      iss: 'https://attacker.example.com',
      aud: AUD,
      email: 'matthew@example.com',
    });
    await expect(verifyIdentityJwt(jwt)).resolves.toBeNull();
  });

  it('returns null when the JWT is expired', async () => {
    const { verifyIdentityJwt } = await import('./identityJwtVerifier.js');
    const jwt = await signTestJwt({
      iss: ISSUER,
      aud: AUD,
      email: 'matthew@example.com',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    await expect(verifyIdentityJwt(jwt)).resolves.toBeNull();
  });

  it('returns null when the email claim is missing', async () => {
    const { verifyIdentityJwt } = await import('./identityJwtVerifier.js');
    const jwt = await signTestJwt({ iss: ISSUER, aud: AUD });
    await expect(verifyIdentityJwt(jwt)).resolves.toBeNull();
  });

  it('returns null when the JWT is malformed', async () => {
    const { verifyIdentityJwt } = await import('./identityJwtVerifier.js');
    await expect(verifyIdentityJwt('not-a-real-jwt')).resolves.toBeNull();
  });

  it('returns null when the signature was made with a different key', async () => {
    const { privateKey: otherKey } = await generateKeyPair('RS256');
    const jwt = await new SignJWT({ email: 'matthew@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUD)
      .setSubject('user-sub-123')
      .setExpirationTime('5m')
      .sign(otherKey);

    const { verifyIdentityJwt } = await import('./identityJwtVerifier.js');
    await expect(verifyIdentityJwt(jwt)).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Explicit IDENTITY_* config (provider-agnostic gateway)
// ---------------------------------------------------------------------------

describe('verifyIdentityJwt — explicit IDENTITY_* config', () => {
  const JWKS_URL = 'https://idp.example.com/.well-known/jwks.json';
  const ISSUER = 'https://idp.example.com/';
  const AUD = 'mcp-resource-server';

  beforeEach(() => {
    vi.resetModules();
    clearIdentityEnv();
    vi.stubEnv('IDENTITY_JWKS_URL', JWKS_URL);
    vi.stubEnv('IDENTITY_ISSUER', ISSUER);
    vi.stubEnv('IDENTITY_AUDIENCE', AUD);
    // CF_ACCESS_* must NOT take precedence over explicit IDENTITY_* config
    vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', 'should-not-be-used');
    vi.stubEnv('CF_ACCESS_AUD', 'should-not-be-used');
    stubFetchToServeJwks(JWKS_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    stubDefaultEnvVars();
    vi.restoreAllMocks();
  });

  it('verifies a JWT against the explicit JWKS URL / issuer / audience', async () => {
    const { verifyIdentityJwt } = await import('./identityJwtVerifier.js');
    const jwt = await signTestJwt({ iss: ISSUER, aud: AUD, email: 'user@example.com' });
    await expect(verifyIdentityJwt(jwt)).resolves.toEqual({
      email: 'user@example.com',
      sub: 'user-sub-123',
      groups: [],
    });
  });

  it('uses IDENTITY_EMAIL_CLAIM override to pick the email out of a non-default claim', async () => {
    vi.stubEnv('IDENTITY_EMAIL_CLAIM', 'user_email');
    const { verifyIdentityJwt } = await import('./identityJwtVerifier.js');
    const jwt = await signTestJwt({
      iss: ISSUER,
      aud: AUD,
      emailClaim: 'user_email',
      email: 'user@example.com',
    });
    expect((await verifyIdentityJwt(jwt))?.email).toBe('user@example.com');
  });

  it('uses IDENTITY_GROUPS_CLAIM override to pick groups out of a non-default claim', async () => {
    vi.stubEnv('IDENTITY_GROUPS_CLAIM', 'cognito:groups');
    const { verifyIdentityJwt } = await import('./identityJwtVerifier.js');
    const jwt = await signTestJwt({
      iss: ISSUER,
      aud: AUD,
      email: 'user@example.com',
      groupsClaim: 'cognito:groups',
      groups: ['Tableau Admin', 'Tableau Read-Write'],
    });
    expect((await verifyIdentityJwt(jwt))?.groups).toEqual(['Tableau Admin', 'Tableau Read-Write']);
  });

  it('returns [] when the groups claim is missing', async () => {
    const { verifyIdentityJwt } = await import('./identityJwtVerifier.js');
    const jwt = await signTestJwt({ iss: ISSUER, aud: AUD, email: 'user@example.com' });
    expect((await verifyIdentityJwt(jwt))?.groups).toEqual([]);
  });

  it('returns [] when the groups claim is not an array', async () => {
    const { verifyIdentityJwt } = await import('./identityJwtVerifier.js');
    const jwt = await signTestJwt({
      iss: ISSUER,
      aud: AUD,
      email: 'user@example.com',
      groups: 'not-an-array',
    });
    expect((await verifyIdentityJwt(jwt))?.groups).toEqual([]);
  });

  it('filters out non-string entries in the groups array', async () => {
    const { verifyIdentityJwt } = await import('./identityJwtVerifier.js');
    const jwt = await signTestJwt({
      iss: ISSUER,
      aud: AUD,
      email: 'user@example.com',
      groups: ['ok', 42, null, { x: 1 }, 'also-ok'],
    });
    expect((await verifyIdentityJwt(jwt))?.groups).toEqual(['ok', 'also-ok']);
  });
});

// ---------------------------------------------------------------------------
// Header name resolution
// ---------------------------------------------------------------------------

describe('getIdentityHeaderName', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    stubDefaultEnvVars();
  });

  it('defaults to cf-access-jwt-assertion', async () => {
    vi.stubEnv('IDENTITY_HEADER', '');
    const { getIdentityHeaderName } = await import('./identityJwtVerifier.js');
    expect(getIdentityHeaderName()).toBe('cf-access-jwt-assertion');
  });

  it('lowercases the configured header name', async () => {
    vi.stubEnv('IDENTITY_HEADER', 'X-Auth-JWT');
    const { getIdentityHeaderName } = await import('./identityJwtVerifier.js');
    expect(getIdentityHeaderName()).toBe('x-auth-jwt');
  });
});

// ---------------------------------------------------------------------------
// identityContext (AsyncLocalStorage)
// ---------------------------------------------------------------------------

describe('identityContext', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('isolates per-async-flow identity', async () => {
    const { identityContext } = await import('./identityJwtVerifier.js');

    const results: Array<string | undefined> = [];

    await Promise.all([
      identityContext.run({ email: 'a@example.com', sub: 'a', groups: [] }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        results.push(identityContext.getStore()?.email);
      }),
      identityContext.run({ email: 'b@example.com', sub: 'b', groups: [] }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        results.push(identityContext.getStore()?.email);
      }),
    ]);

    expect(results.sort()).toEqual(['a@example.com', 'b@example.com']);
  });

  it('returns undefined outside of a run()', async () => {
    const { identityContext } = await import('./identityJwtVerifier.js');
    expect(identityContext.getStore()).toBeUndefined();
  });
});
