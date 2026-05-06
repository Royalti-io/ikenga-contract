// Engine adapter contract. Implementations: engine-claude-code, future
// engine-codex, engine-aider, engine-noop.

export interface SessionOpts {
  cwd?: string;
  systemPrompt?: string;
  toolAllowList?: string[];
}

export interface Session {
  id: string;
  cancel(): void;
}

export type EngineEvent =
  | { type: 'message_delta'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; output: unknown }
  | { type: 'done'; reason: 'stop' | 'cancel' | 'error'; error?: string };

export interface McpServerSpec {
  id: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface Engine {
  startSession(opts: SessionOpts): Promise<Session>;
  stream(session: Session, input: string): AsyncIterable<EngineEvent>;
  registerMcpServer(spec: McpServerSpec): Promise<void>;
}
