import { InsufficientScopeError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

import { stubDefaultEnvVars } from '../../testShared.js';
import { Identity } from './identityJwtVerifier.js';
import { getRequiredRoleForTool, getRoleFromGroups, requireRole } from './roleAuthz.js';

function makeIdentity(groups: string[]): Identity {
  return { email: 'user@example.com', sub: 'sub-1', groups };
}

function clearRoleEnv(): void {
  vi.stubEnv('IDENTITY_ROLE_ADMIN_GROUPS', '');
  vi.stubEnv('IDENTITY_ROLE_WRITER_GROUPS', '');
  vi.stubEnv('IDENTITY_ROLE_READER_GROUPS', '');
}

afterEach(() => {
  vi.unstubAllEnvs();
  stubDefaultEnvVars();
});

describe('requireRole — no-op when RBAC is not configured', () => {
  beforeEach(() => {
    clearRoleEnv();
  });

  it('allows any call with an identity when no role groups are configured', () => {
    expect(() => requireRole('admin', makeIdentity([]), 'delete-content')).not.toThrow();
  });

  it('allows any call without an identity when no role groups are configured', () => {
    expect(() => requireRole('admin', null)).not.toThrow();
  });
});

describe('requireRole — tier enforcement', () => {
  beforeEach(() => {
    clearRoleEnv();
    vi.stubEnv('IDENTITY_ROLE_ADMIN_GROUPS', 'Tableau Admins');
    vi.stubEnv('IDENTITY_ROLE_WRITER_GROUPS', 'Tableau Writers, Tableau Editors');
    vi.stubEnv('IDENTITY_ROLE_READER_GROUPS', 'Tableau Readers');
  });

  it('allows a reader to call a reader tool', () => {
    expect(() =>
      requireRole('reader', makeIdentity(['Tableau Readers']), 'list-workbooks'),
    ).not.toThrow();
  });

  it('denies a reader calling a writer tool', () => {
    expect(() => requireRole('writer', makeIdentity(['Tableau Readers']), 'update-user')).toThrow(
      InsufficientScopeError,
    );
  });

  it('denies a writer calling an admin tool', () => {
    expect(() => requireRole('admin', makeIdentity(['Tableau Writers']), 'delete-content')).toThrow(
      InsufficientScopeError,
    );
  });

  it('allows a writer to call reader and writer tools (higher tier satisfies lower)', () => {
    const identity = makeIdentity(['Tableau Editors']);
    expect(() => requireRole('reader', identity)).not.toThrow();
    expect(() => requireRole('writer', identity)).not.toThrow();
  });

  it('allows an admin to call tools of every tier', () => {
    const identity = makeIdentity(['Tableau Admins']);
    expect(() => requireRole('reader', identity)).not.toThrow();
    expect(() => requireRole('writer', identity)).not.toThrow();
    expect(() => requireRole('admin', identity)).not.toThrow();
  });

  it('denies a user whose groups match no configured role', () => {
    expect(() => requireRole('reader', makeIdentity(['Unrelated Group']))).toThrow(
      InsufficientScopeError,
    );
  });

  it('denies when identity is null and RBAC is configured', () => {
    expect(() => requireRole('reader', null, 'list-workbooks')).toThrow(InsufficientScopeError);
  });

  it('includes the tool name, required role, and actual role in the denial message', () => {
    expect(() => requireRole('admin', makeIdentity(['Tableau Readers']), 'delete-content')).toThrow(
      /Tool 'delete-content' requires role 'admin'; you are 'reader'/,
    );
  });
});

describe('getRoleFromGroups', () => {
  beforeEach(() => {
    clearRoleEnv();
    vi.stubEnv('IDENTITY_ROLE_ADMIN_GROUPS', 'Admins');
    vi.stubEnv('IDENTITY_ROLE_READER_GROUPS', 'Readers');
  });

  it('resolves the highest matching tier when a user is in multiple role groups', () => {
    expect(getRoleFromGroups(['Readers', 'Admins'])).toBe('admin');
  });

  it('returns null when no groups match', () => {
    expect(getRoleFromGroups(['Nobody'])).toBeNull();
  });

  it('reads env at call time (config changes apply without reload)', () => {
    expect(getRoleFromGroups(['Late Group'])).toBeNull();
    vi.stubEnv('IDENTITY_ROLE_WRITER_GROUPS', 'Late Group');
    expect(getRoleFromGroups(['Late Group'])).toBe('writer');
  });
});

describe('getRequiredRoleForTool', () => {
  it('defaults unknown/read tools to reader', () => {
    expect(getRequiredRoleForTool('list-workbooks')).toBe('reader');
    expect(getRequiredRoleForTool('some-future-tool')).toBe('reader');
  });

  it('requires writer for mutating tools', () => {
    expect(getRequiredRoleForTool('update-user')).toBe('writer');
    expect(getRequiredRoleForTool('update-cloud-extract-refresh-task')).toBe('writer');
    expect(getRequiredRoleForTool('confirm-update-cloud-extract-refresh-task')).toBe('writer');
  });

  it('requires admin for destructive tools', () => {
    expect(getRequiredRoleForTool('delete-content')).toBe('admin');
    expect(getRequiredRoleForTool('confirm-delete-content')).toBe('admin');
  });
});
