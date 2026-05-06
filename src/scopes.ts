// Capability scopes a pkg can request in its manifest. The kernel enforces
// these at IPC boundary.

export const SCOPES = {
  tasks: ['tasks:read', 'tasks:write'],
  contacts: ['contacts:read', 'contacts:write'],
  email: ['email_drafts:read', 'email_drafts:write', 'email:send'],
  social: ['social:read', 'social:publish'],
  fs: ['fs:read', 'fs:write'],
  engine: ['engine:invoke', 'engine:register_mcp'],
  shell: ['shell:notify', 'shell:open_pane'],
} as const;

export type ScopeGroup = keyof typeof SCOPES;
export type Scope = (typeof SCOPES)[ScopeGroup][number];
