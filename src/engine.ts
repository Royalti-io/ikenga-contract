// Engine adapter contract. Implementations:
//   - engine-claude-code  (default, ships preinstalled)
//   - engine-codex        (future)
//   - engine-aider        (future)
//   - engine-noop         (testing / shell-without-AI mode)

import { z } from 'zod';

export interface SessionOpts {
  cwd?: string;
  systemPrompt?: string;
  toolAllowList?: string[];
  /** Caller pkg id, used by the engine for per-pkg billing/audit. */
  callerPkg?: string;
}

export interface Session {
  readonly id: string;
  /** Best-effort cancellation. Resolves once the engine has stopped streaming. */
  cancel(): Promise<void>;
}

export type EngineEvent =
  | { type: 'message_delta'; text: string }
  | { type: 'tool_use'; tool: string; input: unknown; toolUseId: string }
  | { type: 'tool_result'; toolUseId: string; output: unknown; isError?: boolean }
  | { type: 'thinking_delta'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cacheCreationTokens?: number; cacheReadTokens?: number }
  | { type: 'done'; reason: 'stop' | 'cancel' | 'error'; error?: string };

export interface McpServerSpec {
  id: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// ---------- Capabilities (single source of truth) ----------

/**
 * Capability flags every engine adapter advertises. This is the canonical
 * shape consumed by both the shell-side ChatAdapter layer and any pkg that
 * needs to reason about adapter features (wizard, settings UI, telemetry).
 *
 * Fields are intentionally a *superset* of what any single adapter
 * supports — an adapter sets the ones it implements to `true` and the
 * rest to `false`. Adding a new flag is a non-breaking schema change so
 * long as adapters default it to `false` until they implement it.
 */
export const AgentCapabilitiesSchema = z.object({
  /** Streams partial responses as they arrive (vs. all-at-once). */
  streaming: z.boolean(),
  /** Invokes external tools / function calls during a turn. */
  toolUse: z.boolean(),
  /** Emits an extended-thinking / reasoning channel separate from output. */
  thinking: z.boolean(),
  /** Produces structured artifacts (code blocks, files, images) the host renders. */
  artifacts: z.boolean(),
  /** Accepts file attachments as part of an input. */
  fileAttachments: z.boolean(),
  /** Accepts image input (vision). */
  imageInput: z.boolean(),
  /** Recognises a `/slash` command vocabulary. */
  slashCommands: z.boolean(),
  /** Lets the user switch models mid-thread. */
  modelSwitching: z.boolean(),
  /** Uses prompt-caching for repeated context (Anthropic-specific today). */
  promptCaching: z.boolean(),
  /** Runs agentic tools (recursive sub-agents, long-running loops). */
  agenticTools: z.boolean(),
  /** Speaks MCP — can register and route through MCP servers. */
  mcp: z.boolean(),
  /** Can resume a prior session by id. */
  sessionResume: z.boolean(),
});
export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;

// ---------- Engine pkg manifest "engine" block ----------

/**
 * Per-adapter onboarding requirements surfaced in the first-run wizard.
 * The wizard composes these instead of hardcoding per-agent forms —
 * every engine pkg owns its own setup story.
 */
export const EngineOnboardingSchema = z.object({
  /** Stronghold-vault keys this adapter needs at runtime (e.g. `ANTHROPIC_API_KEY`). */
  requiredVaultKeys: z.array(z.string()).default([]),
  /** Plain env-vars the adapter expects on the host shell. */
  requiredEnvVars: z.array(z.string()).default([]),
  /**
   * CLI command the user can run to authenticate. The wizard surfaces this
   * as a copy-to-clipboard hint — it never shells out on the user's behalf.
   */
  authCommand: z.string().optional(),
  /** Docs URL for setting up this adapter. */
  docsUrl: z.string().url().optional(),
});
export type EngineOnboarding = z.infer<typeof EngineOnboardingSchema>;

/**
 * Manifest block declared by engine-* pkgs. Read by the shell's
 * `AdapterLoader` at pkg-discovery time; consumed by the wizard to compose
 * adapter-specific onboarding hints.
 */
export const EngineProvidesSchema = z.object({
  /**
   * Stable id — matches the detection-side agent id (e.g. `claude-code`,
   * `codex`, `aider`, `noop`). The wizard's `selected_agent_id` is matched
   * against this field at adapter-resolve time.
   */
  agentId: z.string().min(1),
  /** Display name; overrides any detection-side display if both present. */
  display: z.string().optional(),
  /** Snapshot of what this adapter implements. */
  capabilities: AgentCapabilitiesSchema,
  /** Onboarding requirements composed by the wizard. */
  onboarding: EngineOnboardingSchema.default({
    requiredVaultKeys: [],
    requiredEnvVars: [],
  }),
});
export type EngineProvides = z.infer<typeof EngineProvidesSchema>;

// ---------- Engine adapter runtime contract ----------

export interface Engine {
  /** Stable identifier — matches the pkg id of the engine adapter. */
  readonly id: string;

  /** Human-readable adapter version. */
  readonly version: string;

  /**
   * Static metadata copied from the loading manifest's `engine` block.
   * Required: every adapter must surface its agentId / display / capabilities
   * / onboarding so the shell and wizard can introspect without re-parsing
   * the manifest.
   */
  readonly metadata: {
    agentId: string;
    display: string;
    capabilities: AgentCapabilities;
    onboarding: EngineOnboarding;
  };

  /** Open a new session. Sessions are cheap; create one per pkg invocation. */
  startSession(opts: SessionOpts): Promise<Session>;

  /** Send input and stream events. The iterable completes on `done`. */
  stream(session: Session, input: string): AsyncIterable<EngineEvent>;

  /** Register an MCP server with the engine. Idempotent on `id`. */
  registerMcpServer(spec: McpServerSpec): Promise<void>;

  /** Unregister an MCP server. */
  unregisterMcpServer(id: string): Promise<void>;

  /** Health check — used by the kernel before routing pkg requests. */
  healthCheck(): Promise<{ ok: boolean; reason?: string }>;
}

// ---------- Adapter loader contract ----------

/**
 * Loader the shell uses to bring engine-* pkgs online at boot, tear them
 * down on removal, and gracefully fall back when the user's
 * `selected_agent_id` has no installed adapter.
 *
 * Implementation lives shell-side (post-Phase-7); this interface lets
 * the contract pin the shape so engine pkgs and the shell agree on the
 * load lifecycle.
 */
export interface AdapterLoader {
  /**
   * Load + register the engine for a given pkg manifest. The manifest must
   * carry an `engine` block (see `EngineProvidesSchema`); the loader
   * resolves the adapter implementation and threads the manifest's
   * metadata into the returned `Engine.metadata`.
   */
  load(manifest: { id: string; engine: EngineProvides }): Promise<Engine>;

  /** Unload — used on pkg removal. After this resolves the agentId is unregistered. */
  unload(agentId: string): Promise<void>;

  /**
   * Fallback returned when the requested agentId has no registered loader.
   * Implementations MUST return a working `engine-noop` (or equivalent
   * inert) adapter so the chat surface never dead-ends.
   */
  fallback(): Engine;
}

// ─── ACP (Agent Client Protocol) shapes ───────────────────────────────────────
//
// Phase 10: a second, ACP-shaped contract sits alongside the legacy `Engine`
// interface above. The two coexist while Phase 11 retires the legacy
// adapter. New engines (in-process Rust ACP, Node ACP sidecars, etc.) target
// `AcpEngine`; existing consumers keep the `Engine` shape until they migrate.
//
// The names mirror ACP's method names verbatim so the wire layer and the
// adapter layer share vocabulary — `newSession`, `prompt`, `cancel`,
// `setMode`, `loadSession`, `forkSession`, `requestPermission`.

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
