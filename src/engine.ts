// Engine adapter contract. Implementations:
//   - engine-claude-code  (default, ships preinstalled)
//   - engine-codex        (future)
//   - engine-aider        (future)
//   - engine-noop         (testing / shell-without-AI mode)

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

export interface Engine {
  /** Stable identifier — matches the pkg id of the engine adapter. */
  readonly id: string;

  /** Human-readable adapter version. */
  readonly version: string;

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
