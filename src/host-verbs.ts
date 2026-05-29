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

/** The editable job fields the CRUD form sends to `host.agentOps.upsertJob`.
 *  The host fills JobDefinition defaults (schedule_dialect, timeout_ms, retries,
 *  backoff, concurrency_policy) for any omitted field; the daemon's Zod loader
 *  is the final validation backstop on next config load. */
export interface AgentOpsJobInput {
  id: string;
  label: string;
  schedule: string;
  timezone?: string;
  enabled?: boolean;
  mode?: 'agent' | 'script';
  command: string;
  model?: string | null;
  agent?: string | null;
  schedule_dialect?: '5f' | '6f';
  timeout_ms?: number;
}

/** `host.agentOps.upsertJob({ job })` — create-or-update a job in the
 *  project-scoped config (atomic rewrite; replace by id if present, else
 *  append). The daemon honors it on next config load. Validating-only write —
 *  the shell does NOT run the job, never becomes the executor. */
export interface AgentOpsUpsertJobArgs {
  job: AgentOpsJobInput;
}
export type AgentOpsUpsertJobResult =
  | { ok: true; jobId: string; created: boolean }
  | AgentOpsErrorResult;

/** `host.agentOps.deleteJob({ jobId })` — remove a job from the project-scoped
 *  config (atomic rewrite). The daemon stops scheduling it on next load. */
export interface AgentOpsDeleteJobArgs {
  jobId: string;
}
export type AgentOpsDeleteJobResult =
  | { ok: true; jobId: string }
  | AgentOpsErrorResult;

/** `host.agentOps.tailRun({ jobId, offset? })` — read the live (or last-completed)
 *  run output for a job by byte-range, for the pkg's Live-output view.
 *
 *  Unlike the other agent-ops verbs (which reach the daemon's localhost endpoint
 *  or rewrite its config), tailRun is a pure **filesystem read on the shell's own
 *  event loop**: it opens the per-job marker (`~/.agent-ops/runs/<slug>.marker.json`)
 *  to learn the current run's `tailPath` + `status` + `pid`, then reads that tail
 *  file from `offset` forward (capped per call). Because it never touches the
 *  daemon, the daemon being blocked mid-run (synchronously executing a job) is
 *  irrelevant — the shell still streams whatever the child has teed to disk so far.
 *
 *  Mechanism is **script-mode only**: the daemon tees a script job's combined
 *  stdout/stderr to the tail file as it runs. Agent jobs (`claude -p`) stay
 *  byte-for-byte unchanged and have no tail file, so tailRun returns an empty
 *  chunk with `mode:'agent'` (the pkg renders 'live output not available for
 *  agent jobs' + a spinner driven off the marker's `status`).
 *
 *  Polling loop: call with `offset:0` first, then feed the returned `nextOffset`
 *  back on each poll. `eof` true means the reader caught up to the current end of
 *  file; keep polling while `running` is true. After a run completes the marker
 *  still points at the final tail, so `running:false` STILL returns the final
 *  chunk for scrollback — the view shows the completed output, not an empty pane.
 *
 *  - `running`     — `status === 'running'` AND the marker's `pid` is alive.
 *  - `status`      — the marker's `status` (`'running' | 'done'`), or `null` when
 *                    no marker exists yet (job has never produced a run).
 *  - `startedAtMs` — the run's start epoch-ms from the marker, else `null`.
 *  - `mode`        — `'script'` (has a tail) / `'agent'` (no tail) / `null` (no marker).
 *  - `chunk`       — lossy-utf8 decode of the bytes read this call (may be empty).
 *  - `nextOffset`  — `offset + bytesRead`; pass back on the next poll.
 *  - `eof`         — reached the current end of the tail file.
 *
 *  Best-effort + non-throwing on the shell side: a missing marker / missing tail /
 *  unreadable file resolves to `{ ok:true, chunk:'', eof:true, ... }` rather than
 *  an error, so the view degrades to 'no output yet'. Only a path-escape attempt
 *  (marker.tailPath pointing outside `~/.agent-ops/runs/`) maps to an
 *  `{ ok:false, code:'io_error' }`. */
export interface AgentOpsTailRunArgs {
  jobId: string;
  /** Byte offset into the tail file to read from. Defaults to 0. */
  offset?: number;
}
export type AgentOpsTailRunResult =
  | {
      ok: true;
      running: boolean;
      status: 'running' | 'done' | null;
      startedAtMs: number | null;
      mode: 'agent' | 'script' | null;
      chunk: string;
      nextOffset: number;
      eof: boolean;
    }
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
