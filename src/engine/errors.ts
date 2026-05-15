/**
 * Shared error types for engine adapters.
 *
 * Stub adapters (e.g. `engine-codex`, `engine-gemini`) detect a CLI on the
 * host but don't yet implement `send` / `prompt`. They throw
 * `EngineNotImplementedError` so the shell can render an actionable
 * onboarding hint (the optional `docsUrl`) instead of a generic crash.
 */

export class EngineNotImplementedError extends Error {
  readonly engineId: string;
  readonly docsUrl?: string;

  constructor(engineId: string, opts?: { docsUrl?: string; message?: string }) {
    super(opts?.message ?? `Engine ${engineId} is not implemented yet`);
    this.name = 'EngineNotImplementedError';
    this.engineId = engineId;
    this.docsUrl = opts?.docsUrl;
  }
}
