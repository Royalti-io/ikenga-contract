/**
 * Legacy Engine adapter shape. New adapters target `./acp.ts`. Both are
 * exported through `@ikenga/contract/engine` during the deprecation cycle.
 *
 * Engine adapter contract. Implementations:
 *   - engine-claude-code  (default, ships preinstalled)
 *   - engine-codex        (future)
 *   - engine-aider        (future)
 *   - engine-noop         (testing / shell-without-AI mode)
 *
 * @deprecated Phase 11 retires this surface. New adapters target the ACP
 *   shape in `./acp.ts` (`AcpEngine`, `createAcpEngine`, `AcpHost`).
 */

import { z } from 'zod';

/** @deprecated Use the ACP shape in `./acp.ts`. */
export interface SessionOpts {
  cwd?: string;
  systemPrompt?: string;
  toolAllowList?: string[];
  /** Caller pkg id, used by the engine for per-pkg billing/audit. */
  callerPkg?: string;
  /** Model override for the session (adapter-specific). */
  model?: string;
  /** Resume a prior session by id (adapter-specific; requires sessionResume cap). */
  resumeSessionId?: string;
}

/** @deprecated Use the ACP shape in `./acp.ts`. */
export interface Session {
  readonly id: string;
  /** Best-effort cancellation. Resolves once the engine has stopped streaming. */
  cancel(): Promise<void>;
}

/** @deprecated Use `AcpSessionUpdate` from `./acp.ts`. */
export type EngineEvent =
  | { type: 'message_delta'; text: string }
  | { type: 'tool_use'; tool: string; input: unknown; toolUseId: string }
  | { type: 'tool_result'; toolUseId: string; output: unknown; isError?: boolean }
  | { type: 'thinking_delta'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cacheCreationTokens?: number; cacheReadTokens?: number }
  | { type: 'done'; reason: 'stop' | 'cancel' | 'error'; error?: string };

/**
 * MCP server spec. Shared between the legacy `Engine` surface and the ACP
 * `newSession` request — not marked `@deprecated` because the ACP shape
 * reuses it verbatim.
 */
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

/**
 * Static metadata every adapter surfaces via `Engine.metadata`. Mirrors the
 * manifest's `engine` block so the shell + wizard can introspect without
 * re-parsing the manifest.
 */
export interface EngineMetadata {
  agentId: string;
  display: string;
  capabilities: AgentCapabilities;
  onboarding: EngineOnboarding;
}

// ---------- Host bridge (legacy) ----------

/**
 * Tauri-command surface the host shell exposes to legacy `Engine` adapters.
 * The shell binds these names to its `claude_chat_*` commands; adapters
 * never call `invoke()` directly so they remain testable.
 *
 * @deprecated Use the ACP shape (`AcpHost` in `./acp.ts`) for new adapters.
 */
export interface HostBridge {
  spawn(opts: {
    sessionId: string;
    cwd?: string;
    systemPrompt?: string;
    model?: string;
    resumeSessionId?: string;
  }): Promise<void>;
  send(sessionId: string, message: string): Promise<void>;
  kill(sessionId: string): Promise<void>;
  listen(sessionId: string): AsyncIterable<EngineEvent>;
  registerMcp(spec: McpServerSpec): Promise<void>;
  unregisterMcp(id: string): Promise<void>;
}

// ---------- Engine adapter runtime contract ----------

/** @deprecated Use `AcpEngine` from `./acp.ts`. Legacy shape retired in Phase 11. */
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
  readonly metadata: EngineMetadata;

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
