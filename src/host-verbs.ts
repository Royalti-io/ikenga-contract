/**
 * Host-bridge verb shapes for the agent-ops pkg — the **G-TRIGGER** freeze gate.
 *
 * Unlike the kernel RPC methods in `rpc.ts`, `host.*` verbs are dispatched
 * FE-side in the iframe host (`shell/src/components/pkg/pkg-iframe-host.tsx`)
 * and invoked from the iframe via `app.callServerTool({ name, arguments })`,
 * returning their payload on `res.structuredContent`. These types are the
 * shared contract the shell (WP-09) produces and the agent-ops pkg
 * (WP-08 reads, WP-12 writes) consumes. Frozen so changing them after both
 * sides exist forces a cross-repo re-sync.
 *
 * Gated by `capabilities.agentOps` (see `AgentOpsCapabilitySchema`).
 */

/** Typed failure codes a host.agentOps verb returns on the `{ ok: false }`
 *  branch, so the pkg UI can render a specific state rather than a raw string.
 *  - `daemon_down`   — `~/.agent-ops/daemon.lock` missing or daemon not alive
 *  - `unauthorized`  — the daemon rejected the token (401) — should not happen
 *                      in normal operation (the shell reads the live lock)
 *  - `not_found`     — no job with that id (daemon 404 / config miss)
 *  - `disabled`      — job is disabled, cannot run-now (daemon 409)
 *  - `forbidden`     — daemon rejected host/origin/method (403/405)
 *  - `io_error`      — lock/config file unreadable or unwritable
 *  - `error`         — any other failure */
export type AgentOpsErrorCode =
  | 'daemon_down'
  | 'unauthorized'
  | 'not_found'
  | 'disabled'
  | 'forbidden'
  | 'io_error'
  | 'error';

export interface AgentOpsErrorResult {
  ok: false;
  code: AgentOpsErrorCode;
  /** HTTP status from the daemon when applicable, else null. */
  status: number | null;
  error: string;
}

/** `host.agentOps.runNow({ jobId })` — fire an out-of-schedule run via the
 *  daemon's localhost trigger endpoint. The shell reads the 0600
 *  `~/.agent-ops/daemon.lock` for `{ port, secret }` and POSTs
 *  `127.0.0.1:<port>/jobs/<jobId>/trigger` with BOTH required headers
 *  (`x-agent-ops-token: <secret>` + `x-agent-ops-trigger: 1`). */
export interface AgentOpsRunNowArgs {
  jobId: string;
}
export type AgentOpsRunNowResult =
  | { ok: true; status: number; message: string }
  | AgentOpsErrorResult;

/** `host.agentOps.setEnabled({ jobId, enabled })` — flip a job's `enabled`
 *  flag in the project-scoped config (`~/.atelier/skill-agent-ops/jobs.json`).
 *  The daemon honors it on next config load. Does NOT touch the executor. */
export interface AgentOpsSetEnabledArgs {
  jobId: string;
  enabled: boolean;
}
export type AgentOpsSetEnabledResult =
  | { ok: true; jobId: string; enabled: boolean }
  | AgentOpsErrorResult;

/** A merged config+state row as returned by `host.agentOps.listJobs`. Config
 *  fields come from `~/.atelier/skill-agent-ops/jobs.json` (a JobDefinition);
 *  `state` is that job's entry in `.company/cron/jobs-state.json` (or null if
 *  it has never run). Field casing matches the on-disk files (camelCase state);
 *  the pkg's data layer (WP-08) maps this into the snake_case G-VIEW. */
export interface AgentOpsRawJobState {
  nextRunAtMs: number | null;
  lastRunAtMs: number | null;
  lastStatus: string | null;
  consecutiveErrors: number;
  lastDurationMs: number | null;
  totalCostUsd: number | null;
  totalRuns: number | null;
  lastUsage: {
    costUsd: number | null;
    numTurns: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    sessionId: string | null;
  } | null;
}
export interface AgentOpsRawJob {
  id: string;
  label: string;
  schedule: string;
  schedule_dialect: '5f' | '6f';
  timezone: string;
  enabled: boolean;
  command: string;
  mode: 'agent' | 'script';
  model: string | null;
  agent: string | null;
  _disabledReason: string | null;
  state: AgentOpsRawJobState | null;
}

/** `host.agentOps.listJobs({})` — read the project-scoped job config + the
 *  daemon's runtime state file and return both, merged per job, plus daemon
 *  liveness. Run history (cron_job_runs / agent_runs) is NOT included here —
 *  the pkg reads that directly via `host.dbQuery`. */
export type AgentOpsListJobsArgs = Record<string, never>;
export type AgentOpsListJobsResult =
  | {
      ok: true;
      daemon_up: boolean;
      daemon_pid: number | null;
      jobs: AgentOpsRawJob[];
    }
  | AgentOpsErrorResult;
