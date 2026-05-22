// Capability scopes a pkg can request in its manifest. The kernel enforces
// these at the IPC boundary — scope-denied requests fail with
// `RpcErrorCode.scope_denied` before reaching the handler.
//
// Scope syntax: `<resource>:<action>` or `<resource>:<action>:<qualifier>`
//
// Pattern wildcards are allowed in qualifiers only:
//   "fs:read:projects/*"   ✓  (file under /projects/)
//   "tasks:*"              ✗  (action wildcards forbidden — be explicit)

export interface ScopeDef {
  scope: string;
  description: string;
  /** Whether this scope requires explicit user consent at install time. */
  sensitive?: boolean;
}

export const SCOPE_CATALOGUE: ScopeDef[] = [
  // identity
  { scope: 'identity:read', description: 'Read the current user / tenant identity.' },

  // tasks
  { scope: 'tasks:read', description: 'List and read tasks.' },
  { scope: 'tasks:write', description: 'Create, update, complete tasks.' },

  // contacts
  { scope: 'contacts:read', description: 'Read the contacts directory.' },
  { scope: 'contacts:write', description: 'Create or update contacts.', sensitive: true },

  // email
  { scope: 'email_drafts:read', description: 'Read drafts in the email queue.' },
  { scope: 'email_drafts:write', description: 'Create or modify drafts.' },
  { scope: 'email:send', description: 'Send email through the shell delivery layer.', sensitive: true },

  // social
  { scope: 'social:read', description: 'Read queued and posted social items.' },
  { scope: 'social:publish', description: 'Publish to connected social accounts.', sensitive: true },

  // filesystem (shell-mediated)
  { scope: 'fs:read', description: 'Read files inside the shell-managed sandbox.' },
  { scope: 'fs:write', description: 'Write files inside the shell-managed sandbox.', sensitive: true },

  // engine
  { scope: 'engine:invoke', description: 'Start sessions and stream from the active AI engine.', sensitive: true },
  { scope: 'engine:register_mcp', description: 'Register additional MCP servers with the engine.', sensitive: true },

  // shell chrome
  { scope: 'shell:notify', description: 'Show notifications in the shell UI.' },
  { scope: 'shell:open_pane', description: 'Open or split panes in the shell layout.' },
];

const SCOPE_INDEX = new Map(SCOPE_CATALOGUE.map((s) => [s.scope, s]));

export function isKnownScope(scope: string): boolean {
  if (SCOPE_INDEX.has(scope)) return true;
  // Allow qualified variants (`fs:read:projects/*`) only if the unqualified
  // form is in the catalogue.
  const parts = scope.split(':');
  if (parts.length < 3) return false;
  return SCOPE_INDEX.has(`${parts[0]}:${parts[1]}`);
}

export function isSensitiveScope(scope: string): boolean {
  const def = SCOPE_INDEX.get(scope);
  if (def) return !!def.sensitive;
  const parts = scope.split(':');
  if (parts.length < 3) return false;
  return !!SCOPE_INDEX.get(`${parts[0]}:${parts[1]}`)?.sensitive;
}

export type Scope = string;
