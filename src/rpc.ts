// Shell ↔ pkg RPC. Same envelope on both transports:
//  - iframe pkgs: postMessage over MessageChannel
//  - mounted pkgs: direct function call on the host bus
//
// Methods are namespaced by capability area. The kernel enforces scopes
// declared in the pkg manifest before dispatching.

export const CONTRACT_VERSION = 1 as const;

// ---------- Envelope ----------

export interface RpcRequest<TParams = unknown> {
  v: typeof CONTRACT_VERSION;
  id: string;
  method: string;
  params: TParams;
}

export interface RpcResponseOk<TResult = unknown> {
  v: typeof CONTRACT_VERSION;
  id: string;
  result: TResult;
}

export interface RpcResponseErr {
  v: typeof CONTRACT_VERSION;
  id: string;
  error: { code: RpcErrorCode; message: string; data?: unknown };
}

export type RpcResponse<T = unknown> = RpcResponseOk<T> | RpcResponseErr;
export type RpcMessage = RpcRequest | RpcResponse;

export type RpcErrorCode =
  | 'method_not_found'
  | 'invalid_params'
  | 'scope_denied'
  | 'pkg_not_authenticated'
  | 'shell_unavailable'
  | 'internal_error';

// ---------- Notifications (one-way, pkg → shell or shell → pkg) ----------

export interface RpcNotification<TParams = unknown> {
  v: typeof CONTRACT_VERSION;
  notify: string;
  params: TParams;
}

// ---------- Method catalogue ----------
//
// Adding a method is a contract change. Removals require a deprecation
// period across two contract minor versions.

export interface RpcMethods {
  // identity
  'identity.whoami': { req: void; res: { user_id: string; tenant_id: string | null } };

  // pkg → engine
  'engine.start_session': {
    req: { systemPrompt?: string; toolAllowList?: string[] };
    res: { sessionId: string };
  };
  'engine.stream': {
    req: { sessionId: string; input: string };
    res: { ok: true }; // events delivered via 'engine.event' notifications
  };
  'engine.cancel': { req: { sessionId: string }; res: { ok: true } };

  // shell chrome
  'shell.notify': { req: { title: string; body?: string; level?: 'info' | 'warn' | 'error' }; res: void };
  'shell.open_pane': {
    req: { route?: string; pkg_id?: string; split?: 'horizontal' | 'vertical' };
    res: { pane_id: string };
  };

  // tasks (capability: tasks:read / tasks:write)
  'tasks.list': { req: { status?: string; owner?: string }; res: unknown[] };
  'tasks.create': { req: { subject: string; description?: string }; res: { id: string } };

  // email drafts
  'email_drafts.list': { req: { status?: string }; res: unknown[] };
  'email_drafts.create': { req: { subject: string; body_html: string; to: string[] }; res: { id: string } };
}

// Notifications: shell → pkg
export interface ShellToPkgNotifications {
  'engine.event': { sessionId: string; event: import('./engine/index.js').EngineEvent };
  'shell.theme_changed': { theme: 'light' | 'dark' };
  'shell.pane_focused': { focused: boolean };
}

// ---------- Helpers ----------

export type RpcMethodName = keyof RpcMethods;
export type RpcParams<M extends RpcMethodName> = RpcMethods[M]['req'];
export type RpcResult<M extends RpcMethodName> = RpcMethods[M]['res'];
