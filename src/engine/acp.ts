/**
 * ACP (Agent Client Protocol) shapes. Phase 10: a second, ACP-shaped
 * contract sits alongside the legacy `Engine` interface in `./adapter.ts`.
 * The two coexist while Phase 11 retires the legacy adapter. New engines
 * (in-process Rust ACP, Node ACP sidecars, etc.) target `AcpEngine`;
 * existing consumers keep the `Engine` shape until they migrate.
 *
 * Method names mirror ACP's verbatim so the wire layer and the adapter
 * layer share vocabulary — `newSession`, `prompt`, `cancel`, `setMode`,
 * `loadSession`, `forkSession`, `requestPermission`.
 */

import type { McpServerSpec } from './adapter.js';

/** ACP `ProtocolVersion`. Numeric. V1 = 1. */
export type AcpProtocolVersion = number;

export interface AcpInitializeRequest {
  protocolVersion: AcpProtocolVersion;
  /** Optional `_meta` passthrough; the in-process shell ignores it. */
  _meta?: Record<string, unknown>;
}

export interface AcpPromptCapabilities {
  image: boolean;
  audio: boolean;
  embeddedContext: boolean;
}

export interface AcpMcpCapabilities {
  http: boolean;
  sse: boolean;
}

export interface AcpAgentCapabilities {
  loadSession: boolean;
  promptCapabilities: AcpPromptCapabilities;
  mcpCapabilities: AcpMcpCapabilities;
}

export interface AcpInitializeResponse {
  protocolVersion: AcpProtocolVersion;
  agentCapabilities: AcpAgentCapabilities;
  /** Authentication methods the agent supports — opaque structure passed
   *  through to the wizard. */
  authMethods?: unknown[];
  _meta?: Record<string, unknown>;
}

export interface AcpTextContentBlock {
  type: 'text';
  text: string;
}

/** ACP `ContentBlock::Image`. `data` is raw base64 with NO `data:` URI prefix. */
export interface AcpImageContentBlock {
  type: 'image';
  data: string;
  mimeType: string;
  uri?: string;
}

export type AcpContentBlock =
  | AcpTextContentBlock
  | AcpImageContentBlock
  | { type: 'audio'; data: string; mimeType: string }
  | { type: 'resource_link'; name: string; uri: string }
  | { type: 'resource'; resource: unknown };

export interface AcpNewSessionRequest {
  cwd: string;
  mcpServers: McpServerSpec[];
  _meta?: Record<string, unknown>;
}

/** The four canonical ACP session modes the Rust ACP server advertises. */
export type AcpSessionModeId = 'plan' | 'default' | 'auto' | 'bypassPermissions';

export interface AcpSessionMode {
  id: AcpSessionModeId;
  name: string;
  description?: string;
  _meta?: Record<string, unknown>;
}

export interface AcpSessionModes {
  currentModeId: AcpSessionModeId;
  availableModes: AcpSessionMode[];
  _meta?: Record<string, unknown>;
}

export interface AcpNewSessionResponse {
  sessionId: string;
  modes?: AcpSessionModes;
  models?: unknown;
  configOptions?: unknown[];
  _meta?: Record<string, unknown>;
}

export interface AcpPromptRequest {
  sessionId: string;
  prompt: AcpContentBlock[];
  messageId?: string;
  _meta?: Record<string, unknown>;
}

export type AcpStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'max_turn_requests'
  | 'refusal'
  | 'cancelled';

export interface AcpPromptResponse {
  stopReason: AcpStopReason;
  userMessageId?: string;
  usage?: unknown;
  _meta?: Record<string, unknown>;
}

/** ACP `SessionUpdate` discriminated union. Open-ended on the `string` tail
 *  so adapter-specific extensions don't break TS consumers. */
export type AcpSessionUpdate =
  | { sessionUpdate: 'agent_message_chunk'; content: AcpContentBlock; messageId?: string }
  | { sessionUpdate: 'agent_thought_chunk'; content: AcpContentBlock; messageId?: string }
  | { sessionUpdate: 'user_message_chunk'; content: AcpContentBlock }
  | {
      sessionUpdate: 'tool_call';
      toolCallId: string;
      title: string;
      kind?: string;
      status?: string;
      content?: unknown[];
      rawInput?: unknown;
      _meta?: Record<string, unknown>;
    }
  | {
      sessionUpdate: 'tool_call_update';
      toolCallId: string;
      fields: {
        status?: string;
        content?: unknown[];
        rawOutput?: unknown;
      };
      _meta?: Record<string, unknown>;
    }
  | { sessionUpdate: 'current_mode_update'; currentModeId: AcpSessionModeId }
  | { sessionUpdate: 'plan_update'; plan: unknown }
  | { sessionUpdate: string; [k: string]: unknown };

export interface AcpSessionNotification {
  sessionId: string;
  update: AcpSessionUpdate;
  _meta?: Record<string, unknown>;
}

// ── Permission round-trip (Phase 4) ───────────────────────────────────────────

export type AcpPermissionOptionKind =
  | 'allow_once'
  | 'allow_always'
  | 'reject_once'
  | 'reject_always';

export interface AcpPermissionOption {
  optionId: string;
  name: string;
  kind: AcpPermissionOptionKind;
}

export interface AcpToolCallSummary {
  toolCallId: string;
  title?: string;
  kind?: string;
  status?: string;
  content?: unknown[];
  rawInput?: unknown;
  rawOutput?: unknown;
}

export interface AcpRequestPermissionRequest {
  sessionId: string;
  toolCall: AcpToolCallSummary;
  options: AcpPermissionOption[];
  _meta?: Record<string, unknown>;
}

export type AcpRequestPermissionOutcome =
  | { outcome: 'cancelled' }
  | { outcome: 'selected'; optionId: string };

export interface AcpRequestPermissionResponse {
  outcome: AcpRequestPermissionOutcome;
  _meta?: Record<string, unknown>;
}

/** Wire envelope: pairs a `requestId` with the request body so the client
 *  reply can address the parked Rust-side oneshot. */
export interface AcpPermissionRequestEnvelope {
  requestId: string;
  request: AcpRequestPermissionRequest;
}

// ── Session load + fork (Phase 8) ─────────────────────────────────────────────

export interface AcpLoadSessionResponse {
  /** Optional mode advertisement so the picker can hydrate without paying
   *  the cold-spawn cost of `newSession`. */
  modes?: AcpSessionModes;
}

export interface AcpForkResult {
  newThreadId: string;
  sourceThreadId: string;
  branchedFromTurn?: number;
}

export interface AcpForkOpts {
  upToTurn?: number;
  label?: string;
}

// ── OS-attention notify (Phase 9) ─────────────────────────────────────────────

export type AcpNotifyKind = 'notification' | 'permissionRequest';

export interface AcpNotifyPayload {
  threadId: string;
  title: string;
  body: string;
  kind: AcpNotifyKind;
}

// ── Engine adapter (ACP-shaped) ───────────────────────────────────────────────

/**
 * ACP-shaped engine adapter. Implementations:
 *   - `pkgs/engine-claude-code` — wraps the in-process Rust ACP server.
 *   - future: `pkgs/engine-codex`, `pkgs/engine-aider` — each speaking the
 *     same wire shapes.
 *
 * Method names mirror ACP verbatim (`newSession`, `prompt`, `cancel`,
 * `setMode`, `loadSession`, `forkSession`, `respondPermission`) so the wire
 * layer, adapter layer, and host shell share one vocabulary.
 *
 * Subscriptions return a synchronous `() => void` unsubscribe — the
 * implementation may resolve the underlying tauri-listener asynchronously
 * but the caller can drop the registration immediately on unmount.
 */
export interface AcpEngine {
  initialize(req: AcpInitializeRequest): Promise<AcpInitializeResponse>;

  /** Mint a new session. The agent may lazily spawn its child on the first
   *  `prompt` rather than during `newSession` itself. */
  newSession(req: AcpNewSessionRequest): Promise<AcpNewSessionResponse>;

  /** Send a turn. Resolves when the turn ends; in-progress events flow via
   *  `onSessionUpdate`. */
  prompt(req: AcpPromptRequest): Promise<AcpPromptResponse>;

  /** Clean interrupt. Preserves the transcript and keeps the child alive
   *  for the next turn. */
  cancel(sessionId: string): Promise<void>;

  /** Switch the session's permission mode. */
  setMode(sessionId: string, modeId: AcpSessionModeId): Promise<void>;

  /** Re-attach to an existing session by id. The child stays lazy. */
  loadSession(sessionId: string): Promise<AcpLoadSessionResponse>;

  /** Clone a session from a chosen turn. The new thread inherits the source's
   *  on-disk transcript so the first prompt resumes from the cutoff. */
  forkSession(sourceSessionId: string, opts?: AcpForkOpts): Promise<AcpForkResult>;

  /** Subscribe to session updates. Returns a sync unsubscribe. */
  onSessionUpdate(
    sessionId: string,
    callback: (update: AcpSessionUpdate) => void,
  ): () => void;

  /** Subscribe to permission requests for this session. Reply via
   *  `respondPermission`. Returns a sync unsubscribe. */
  onPermissionRequest(
    sessionId: string,
    callback: (envelope: AcpPermissionRequestEnvelope) => void,
  ): () => void;

  /** Reply to a parked permission request. */
  respondPermission(
    requestId: string,
    response: AcpRequestPermissionResponse,
  ): Promise<void>;

  /** Subscribe to OS-attention notifications. Returns a sync unsubscribe. */
  onNotify(callback: (payload: AcpNotifyPayload) => void): () => void;
}

// ── Host bridge (ACP-shaped) ──────────────────────────────────────────────────

/** Synchronous unsubscribe handle. */
export type AcpUnlisten = () => void;

/**
 * Tauri-side surface the host shell exposes for the ACP engine. The shell
 * binds these to its `acp_*` Tauri commands and `acp://*` event listeners.
 *
 * Each `on*` returns a Promise of an unsubscribe fn — the engine wraps that
 * so callers get a sync unsubscribe.
 */
export interface AcpHost {
  initialize(req: AcpInitializeRequest): Promise<AcpInitializeResponse>;
  newSession(req: AcpNewSessionRequest): Promise<AcpNewSessionResponse>;
  prompt(req: AcpPromptRequest): Promise<AcpPromptResponse>;
  cancel(sessionId: string): Promise<void>;
  setMode(sessionId: string, modeId: AcpSessionModeId): Promise<void>;
  loadSession(sessionId: string): Promise<AcpLoadSessionResponse>;
  forkSession(
    sourceSessionId: string,
    opts?: AcpForkOpts,
  ): Promise<AcpForkResult>;
  listenSession(
    sessionId: string,
    onUpdate: (notification: AcpSessionNotification) => void,
  ): Promise<AcpUnlisten>;
  listenPermissionRequests(
    sessionId: string,
    onRequest: (envelope: AcpPermissionRequestEnvelope) => void,
  ): Promise<AcpUnlisten>;
  respondPermission(
    requestId: string,
    response: AcpRequestPermissionResponse,
  ): Promise<void>;
  listenNotify(
    callback: (payload: AcpNotifyPayload) => void,
  ): Promise<AcpUnlisten>;
}
