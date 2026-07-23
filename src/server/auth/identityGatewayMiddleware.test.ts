import { NextFunction, Response } from 'express';

import { stubDefaultEnvVars } from '../../testShared.js';
import { AuthenticatedRequest } from '../oauth/types.js';
import { identityGatewayMiddleware } from './identityGatewayMiddleware.js';
import * as identityJwtVerifierModule from './identityJwtVerifier.js';
import { Identity, identityContext } from './identityJwtVerifier.js';

vi.mock('./identityJwtVerifier.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./identityJwtVerifier.js')>();
  return {
    ...original,
    isIdentityGatewayConfigured: vi.fn().mockReturnValue(false),
    verifyIdentityJwt: vi.fn().mockResolvedValue(null),
  };
});

const isIdentityGatewayConfigured = vi.mocked(
  identityJwtVerifierModule.isIdentityGatewayConfigured,
);
const verifyIdentityJwt = vi.mocked(identityJwtVerifierModule.verifyIdentityJwt);

const testIdentity: Identity = {
  email: 'matthew@example.com',
  sub: 'user-sub-123',
  groups: ['Tableau Readers'],
};

function makeReq(headers: Record<string, string | string[]>): AuthenticatedRequest {
  return { headers } as unknown as AuthenticatedRequest;
}

const res = {} as Response;

async function runMiddleware(
  req: AuthenticatedRequest,
): Promise<{ nextCalled: boolean; identityInNext: Identity | undefined }> {
  let nextCalled = false;
  let identityInNext: Identity | undefined;
  const next: NextFunction = () => {
    nextCalled = true;
    identityInNext = identityContext.getStore();
  };

  await (identityGatewayMiddleware()(req, res, next) as Promise<void>);
  return { nextCalled, identityInNext };
}

beforeEach(() => {
  vi.clearAllMocks();
  isIdentityGatewayConfigured.mockReturnValue(false);
  verifyIdentityJwt.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  stubDefaultEnvVars();
});

describe('identityGatewayMiddleware — x-forwarded-authorization promotion', () => {
  it('promotes x-forwarded-authorization to authorization', async () => {
    const req = makeReq({ 'x-forwarded-authorization': 'Bearer original-token' });
    const { nextCalled } = await runMiddleware(req);

    expect(nextCalled).toBe(true);
    expect(req.headers.authorization).toBe('Bearer original-token');
  });

  it('uses the first value when x-forwarded-authorization is an array', async () => {
    const req = makeReq({ 'x-forwarded-authorization': ['Bearer one', 'Bearer two'] });
    await runMiddleware(req);

    expect(req.headers.authorization).toBe('Bearer one');
  });

  it('is a no-op on authorization when x-forwarded-authorization is absent', async () => {
    const req = makeReq({ authorization: 'Bearer existing' });
    const { nextCalled } = await runMiddleware(req);

    expect(nextCalled).toBe(true);
    expect(req.headers.authorization).toBe('Bearer existing');
  });
});

describe('identityGatewayMiddleware — gateway not configured', () => {
  it('passes through without touching req.auth and never verifies', async () => {
    const req = makeReq({ 'cf-access-jwt-assertion': 'some-jwt' });
    const { nextCalled, identityInNext } = await runMiddleware(req);

    expect(nextCalled).toBe(true);
    expect(identityInNext).toBeUndefined();
    expect(req.auth).toBeUndefined();
    expect(verifyIdentityJwt).not.toHaveBeenCalled();
  });
});

describe('identityGatewayMiddleware — gateway configured', () => {
  beforeEach(() => {
    isIdentityGatewayConfigured.mockReturnValue(true);
  });

  it('authenticates a verified gateway identity without a bearer token', async () => {
    verifyIdentityJwt.mockResolvedValue(testIdentity);
    const req = makeReq({ 'cf-access-jwt-assertion': 'valid-jwt' });
    const { nextCalled, identityInNext } = await runMiddleware(req);

    expect(nextCalled).toBe(true);
    expect(verifyIdentityJwt).toHaveBeenCalledWith('valid-jwt');
    // next() runs inside identityContext with the verified identity
    expect(identityInNext).toEqual(testIdentity);
    // req.auth mirrors the Google direct-trust shape (no Tableau tokens)
    expect(req.auth).toEqual({
      token: 'valid-jwt',
      clientId: 'identity-gateway',
      scopes: [],
      extra: {
        type: 'X-Tableau-Auth',
        username: 'matthew@example.com',
        server: 'https://my-tableau-server.com',
        siteName: 'tc25',
      },
    });
  });

  it('falls through without identity (no 401) when the JWT is invalid', async () => {
    verifyIdentityJwt.mockResolvedValue(null);
    const req = makeReq({ 'cf-access-jwt-assertion': 'bad-jwt' });
    const { nextCalled, identityInNext } = await runMiddleware(req);

    expect(nextCalled).toBe(true);
    expect(identityInNext).toBeUndefined();
    expect(req.auth).toBeUndefined();
  });

  it('passes through when the identity header is absent', async () => {
    const req = makeReq({});
    const { nextCalled, identityInNext } = await runMiddleware(req);

    expect(nextCalled).toBe(true);
    expect(identityInNext).toBeUndefined();
    expect(req.auth).toBeUndefined();
    expect(verifyIdentityJwt).not.toHaveBeenCalled();
  });

  it('respects req.auth already set by earlier middleware but still provides identity context', async () => {
    verifyIdentityJwt.mockResolvedValue(testIdentity);
    const req = makeReq({ 'cf-access-jwt-assertion': 'valid-jwt' });
    const existingAuth = { token: 'passthrough', clientId: 'passthrough', scopes: [] };
    req.auth = existingAuth;

    const { nextCalled, identityInNext } = await runMiddleware(req);

    expect(nextCalled).toBe(true);
    expect(req.auth).toBe(existingAuth);
    expect(identityInNext).toEqual(testIdentity);
  });

  it('reads the identity JWT from a custom IDENTITY_HEADER', async () => {
    vi.stubEnv('IDENTITY_HEADER', 'X-Custom-Identity');
    verifyIdentityJwt.mockResolvedValue(testIdentity);
    const req = makeReq({ 'x-custom-identity': 'valid-jwt' });
    const { identityInNext } = await runMiddleware(req);

    expect(verifyIdentityJwt).toHaveBeenCalledWith('valid-jwt');
    expect(identityInNext).toEqual(testIdentity);
  });
});
