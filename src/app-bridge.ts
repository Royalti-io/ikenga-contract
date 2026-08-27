// `repo.changed` — the push a pkg's long-lived MCP server emits so its iframe
// learns that a git repo moved on disk, without polling.
//
// ─── Why this file is about an MCP notification, not a sidecar event ───────
//
// An earlier draft of this module described a `host-sidecar-event` push fed by
// `manifest.sidecars[]`. That path does not exist. Verified in shell source:
//
//   • `manifest.sidecars[]` entries are NOT supervised — `src-tauri/src/pkg/
//     registries/sidecars.rs` only resolves their binary paths.
//   • `host.pkgSidecarCall` → `pkg_sidecar_call` spawns a FRESH process per
//     call; it is one-shot request/response, with no stdout event stream.
//   • The `pkg://sidecar/{pkgId}/{name}/message` Tauri event is emitted only
//     by the lazy-spawn `pkg_sidecar_rpc_send` path, which no `host.*` verb
//     reaches — so nothing an iframe can call ever produces one.
//   • The only supervised long-lived child is a `manifest.mcp[]` entry with
//     `lifecycle: "long-lived"` (`src-tauri/src/pkg/lifecycle.rs`).
//
// So the real push channel is the MCP notification relay that already ships:
//
//   pkg MCP server                shell (Rust)                 pkg iframe
//   ──────────────                ────────────                 ──────────
//   server.sendLoggingMessage(    read loop matches             AppBridge
//     { level, logger,       →    `notifications/message`  →    notification
//       data: <envelope> })       (lifecycle.rs:160), rate-     handler for
//                                 caps, emits the Tauri         LoggingMessage-
//                                 event `pkg-mcp-notification`  Notification
//                                 `{pkg_id, method, params}`
//                                 (lifecycle.rs:154, ~1440-1460)
//                                       ↓
//                                 `shell/src/components/pkg/pkg-iframe-host.tsx`
//                                 Step 3b filters on `pkg_id` and forwards
//                                 `{method, params}` VERBATIM onto the bridge.
//
// The relayed top-level `method` is therefore always the literal string
// `notifications/message` — never `repo.changed`. The MCP spec's logging
// params are `{ level, logger, data }`, and `data` is free-form, so the pkg's
// own routing discriminant has to live inside `data`. `com.ikenga.git` puts a
// JSON-RPC-shaped envelope there:
//
//   { level: 'info', logger: 'git-mcp/watcher',
//     data: { method: 'repo.changed',
//             params: { repo, seq, coalesced, at } } }
//
// (Same convention Studio already uses for its render events — see
// `ikenga-pkgs/packages/apps/studio/mcp/src/index.ts` `sendLoggingMessage` and
// the demux in `studio/src/studio/bridge.ts`.)
//
// This module types that envelope and gives the iframe a guard that accepts
// either the whole relayed frame or a bare `data` envelope, so a consumer
// doesn't have to hand-write the `params.data.method` reach.

import { z } from 'zod';

/** The `method` discriminant carried inside the logging frame's `data`. */
export const REPO_CHANGED_METHOD = 'repo.changed' as const;

/**
 * Per-pkg relay budget enforced by the Rust supervisor's MCP read loop.
 *
 * Mirrors `MCP_NOTIFICATION_MAX_PER_SEC` in
 * `shell/src-tauri/src/pkg/lifecycle.rs:166` — this is a re-declaration for
 * pkg authors, NOT a second enforcement point. The shell drops (never queues)
 * frames past the cap, so an over-cap burst loses the middle of the run, not
 * the tail.
 *
 * The window is **TUMBLING, not rolling**: the loop resets `window_start` to
 * `now` and zeroes the counter the first time a frame arrives ≥1s after the
 * window opened (`lifecycle.rs:~1427-1439`). A burst can therefore straddle
 * two windows and land up to 2× this many frames inside one arbitrary
 * one-second span — that is expected, not a leak.
 *
 * Practical consequence for a watcher: coalesce ruthlessly before sending.
 * `repo.changed` carries `coalesced` precisely so one frame can stand for many
 * filesystem events.
 */
export const HOST_NOTIFICATION_MAX_PER_SEC = 20;

/** Zod schema for the `repo.changed` payload. */
export const RepoChangedParamsSchema = z.object({
	/** Absolute path to the repo's toplevel (the `git rev-parse --show-toplevel`
	 *  value), which is the same key the pkg's RPC surface uses for `repo`. */
	repo: z.string().min(1),
	/** Monotonic per-repo sequence, starting at 1, incremented once per emitted
	 *  frame. Lets a consumer detect frames the relay's rate cap dropped: a gap
	 *  means "you missed something, re-read the snapshot". */
	seq: z.number().int().nonnegative(),
	/** How many raw filesystem events this frame stands for (≥1). A large value
	 *  is normal during a rebase or a branch switch. */
	coalesced: z.number().int().positive(),
	/** `Date.now()` at emit time, in the MCP server's process. */
	at: z.number().int().nonnegative(),
});

/** The `repo.changed` payload — what a consumer actually wants. */
export type RepoChangedParams = z.infer<typeof RepoChangedParamsSchema>;

/** The JSON-RPC-shaped envelope the pkg's MCP server places in the logging
 *  frame's `data` field. */
export interface RepoChangedEnvelope {
	method: typeof REPO_CHANGED_METHOD;
	params: RepoChangedParams;
}

/** Zod schema for that envelope. */
export const RepoChangedEnvelopeSchema = z.object({
	method: z.literal(REPO_CHANGED_METHOD),
	params: RepoChangedParamsSchema,
});

/**
 * Pull the `repo.changed` params out of anything the iframe might hand us,
 * or return `null` if this isn't a `repo.changed` frame.
 *
 * Accepts three shapes, so a caller can pass whatever their notification
 * handler gave them without unwrapping first:
 *
 *   1. the full relayed frame — `{ method: 'notifications/message',
 *      params: { level, logger, data: <envelope> } }`
 *   2. the logging params alone — `{ level, logger, data: <envelope> }`
 *      (this is what `setNotificationHandler(LoggingMessageNotificationSchema,
 *      n => …)` hands you as `n.params`)
 *   3. the bare envelope — `{ method: 'repo.changed', params: {…} }`
 *
 * Returns `null` for anything else, including a well-formed logging frame for
 * a different topic. Never throws.
 */
export function readRepoChangedParams(value: unknown): RepoChangedParams | null {
	if (typeof value !== 'object' || value === null) return null;
	const v = value as Record<string, unknown>;

	// Shape 3 — bare envelope.
	const bare = RepoChangedEnvelopeSchema.safeParse(v);
	if (bare.success) return bare.data.params;

	// Shape 1 — full frame: descend into `params` and retry as shape 2.
	if (v.method === 'notifications/message') {
		return readRepoChangedParams(v.params);
	}

	// Shape 2 — logging params: the envelope is in `data`.
	if ('data' in v) {
		const inner = RepoChangedEnvelopeSchema.safeParse(v.data);
		if (inner.success) return inner.data.params;
	}

	return null;
}

/**
 * Type guard over the same three shapes `readRepoChangedParams` accepts.
 * Narrows only to "this carries a valid `repo.changed`" — call
 * `readRepoChangedParams` to get the payload, since the guard cannot narrow
 * through the outer wrapper.
 */
export function isRepoChangedNotification(value: unknown): boolean {
	return readRepoChangedParams(value) !== null;
}
