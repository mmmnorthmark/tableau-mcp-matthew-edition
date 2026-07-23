/**
 * Role-based per-tool authorization, layered on top of identity-gateway
 * group memberships.
 *
 * Role tiers (highest → lowest):
 *   admin > writer > reader
 *
 * Higher tiers satisfy any lower-tier requirement (admin can call
 * writer/reader tools; writer can call reader tools).
 *
 * Configuration (env vars, read at call time so redeploys propagate
 * without a restart):
 *   IDENTITY_ROLE_ADMIN_GROUPS   Comma-separated list of group names that
 *                                map to the `admin` role.
 *   IDENTITY_ROLE_WRITER_GROUPS  Comma-separated list of group names that
 *                                map to the `writer` role.
 *   IDENTITY_ROLE_READER_GROUPS  Comma-separated list of group names that
 *                                map to the `reader` role.
 *
 * If NONE of these are configured, requireRole is a no-op (RBAC not in
 * use, allow all). This preserves the existing behavior of deployments
 * that have no identity gateway or no group claims to drive RBAC from.
 *
 * Throws InsufficientScopeError on denial (the SDK's 403-mapped OAuth
 * error), surfaced to the MCP client as a tool-call error with a clear
 * reason in the message.
 */

import { InsufficientScopeError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

import { Identity } from './identityJwtVerifier.js';

export type Role = 'admin' | 'writer' | 'reader';

// Higher number = more privileged. admin (3) ≥ writer (2) ≥ reader (1).
const ROLE_TIER: Record<Role, number> = {
  admin: 3,
  writer: 2,
  reader: 1,
};

/**
 * Minimum role required per tool. Nearly every tool this server exposes is
 * a read or a render, which maps to `reader`. Only the mutating tools
 * (updates/deletes) are listed here explicitly.
 *
 * Tools NOT listed default to `reader` via getRequiredRoleForTool. When
 * adding a future tool that MUTATES Tableau content, add it here as
 * `writer` (or `admin` for destructive operations) — the default is
 * read-tier and will NOT protect a mutating tool on its own.
 */
export const TOOL_REQUIRED_ROLE: Record<string, Role> = {
  'update-cloud-extract-refresh-task': 'writer',
  'confirm-update-cloud-extract-refresh-task': 'writer',
  'update-user': 'writer',
  'delete-content': 'admin',
  'confirm-delete-content': 'admin',
};

/**
 * Resolve the minimum role required to call a tool. Unknown tools default
 * to `reader` — everything currently unlisted is a read/render. See the
 * TOOL_REQUIRED_ROLE comment before relying on this default for new
 * mutating tools.
 */
export function getRequiredRoleForTool(toolName: string): Role {
  return TOOL_REQUIRED_ROLE[toolName] ?? 'reader';
}

function parseGroupList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((g) => g.trim())
    .filter((g) => g.length > 0);
}

interface RoleConfig {
  admin: string[];
  writer: string[];
  reader: string[];
}

function loadConfig(): RoleConfig {
  return {
    admin: parseGroupList(process.env.IDENTITY_ROLE_ADMIN_GROUPS),
    writer: parseGroupList(process.env.IDENTITY_ROLE_WRITER_GROUPS),
    reader: parseGroupList(process.env.IDENTITY_ROLE_READER_GROUPS),
  };
}

function isRbacConfigured(config: RoleConfig): boolean {
  return config.admin.length > 0 || config.writer.length > 0 || config.reader.length > 0;
}

/**
 * Resolve the HIGHEST role the user qualifies for from their group
 * memberships, given the current env-var configuration. Returns null if
 * the user matches no configured role group.
 *
 * Higher-tier matches win: a user in both an admin group and a reader
 * group resolves to `admin`.
 */
export function getRoleFromGroups(groups: string[]): Role | null {
  const config = loadConfig();
  const inSet = (set: string[]): boolean => set.some((g) => groups.includes(g));

  if (inSet(config.admin)) {
    return 'admin';
  }
  if (inSet(config.writer)) {
    return 'writer';
  }
  if (inSet(config.reader)) {
    return 'reader';
  }
  return null;
}

/**
 * Enforce a minimum role for the current request.
 *
 * Behavior:
 * - If NO role groups are configured anywhere (RBAC not in use), no-op
 *   and allow the call. Preserves existing behavior for deployments that
 *   don't run an identity gateway or don't want group-based RBAC.
 * - Otherwise: throw InsufficientScopeError if identity is null, or if
 *   the user's resolved role is lower than `required`.
 *
 * The InsufficientScopeError message includes the required role and the
 * user's current role for actionable debugging.
 */
export function requireRole(required: Role, identity: Identity | null, toolName?: string): void {
  const config = loadConfig();
  if (!isRbacConfigured(config)) {
    return;
  }

  const where = toolName ? `Tool '${toolName}'` : 'This operation';

  if (!identity) {
    throw new InsufficientScopeError(
      `${where} requires role '${required}'; no identity on this request`,
    );
  }

  const actual = getRoleFromGroups(identity.groups);
  if (!actual || ROLE_TIER[actual] < ROLE_TIER[required]) {
    throw new InsufficientScopeError(
      `${where} requires role '${required}'; you are '${actual ?? 'none'}'`,
    );
  }
}
