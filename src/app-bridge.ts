// Host → pkg-iframe push envelope for long-lived sidecar stdout lines.
//
// Companion to the `pkg://sidecar/{pkgId}/{name}/message` Tauri event
// (`pkgSidecarMessageEvent` in `shell/src/lib/tauri-cmd.ts`). A pkg's
// sidecar (`manifest.sidecars[]`, spawned via the streaming RPC path —
// `pkg_sidecar_rpc_send` / `src-tauri/src/commands/pkg_sidecar_stream.rs`)
// emits one Tauri event per stdout line. The shell FE (`pkg-iframe-host.tsx`)
// subscribes to that event per mounted iframe for each of the pkg's declared
// sidecar names, rate-caps it, and forwards each surviving line onto the
// iframe's AppBridge connection as a `host-sidecar-event` notification —
// giving pkgs a push-based alternative to polling `host.pkgSidecarCall`.
//
// `host-sidecar-event` is a host-app-specific notification, not part of the
// `@modelcontextprotocol/ext-apps` protocol's own method union (compare
// `ui/notifications/host-context-changed`, which IS spec'd) — same pattern
// already used to relay `pkg-mcp-notification` frames. A pkg iframe listens
// with the SDK's generic `setNotificationHandler`, matching on `method`.

/** JSON-RPC-style `method` value used for this push. */
export const HOST_SIDECAR_EVENT_TYPE = 'host-sidecar-event' as const;

/**
 * Per-(pkgId, sidecar) relay budget, enforced FE-side in `pkg-iframe-host.tsx`
 * over a rolling one-second window. Mirrors the Rust supervisor's existing
 * per-pkg budget for the sibling `pkg-mcp-notification` relay
 * (`MCP_NOTIFICATION_MAX_PER_SEC` in `shell/src-tauri/src/pkg/lifecycle.rs`)
 * so a sidecar that floods stdout (a tight fs-watch loop, a chatty log) can't
 * saturate the iframe. Lines beyond this within a window are dropped, not
 * queued — the surviving lines are the freshest, not the oldest.
 */
export const HOST_SIDECAR_EVENT_MAX_PER_SEC = 20;

/** The envelope's `params` shape — what actually crosses the AppBridge wire. */
export interface HostSidecarEventParams<TEvent = unknown> {
	/** Owning pkg id, dot-form (e.g. `com.ikenga.git`) — matches
	 *  `Manifest.id`, NOT the Tauri-event-channel-safe underscore form. */
	pkgId: string;
	/** The `manifest.sidecars[].name` this line came from. */
	sidecar: string;
	/**
	 * The sidecar's stdout line, `JSON.parse`'d. Caller-defined shape — a
	 * sidecar opting into AppBridge push MUST emit one JSON object per line
	 * with at least a `kind` discriminant, e.g.
	 * `{ kind: 'repo-changed', repo: string, at: number }` for the
	 * `com.ikenga.git` sidecar (see `plans/git/09-orchestration.md`). A line
	 * that fails to parse as JSON is dropped before it reaches this type,
	 * not forwarded as a string.
	 */
	event: TEvent;
}

/** Full notification frame as sent to `AppBridge.prototype.notification`. */
export interface HostSidecarEventNotification<TEvent = unknown> {
	method: typeof HOST_SIDECAR_EVENT_TYPE;
	params: HostSidecarEventParams<TEvent>;
}

export function isHostSidecarEventNotification(
	value: unknown
): value is HostSidecarEventNotification {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	if (v.method !== HOST_SIDECAR_EVENT_TYPE) return false;
	const params = v.params;
	if (typeof params !== 'object' || params === null) return false;
	const p = params as Record<string, unknown>;
	return typeof p.pkgId === 'string' && typeof p.sidecar === 'string' && 'event' in p;
}
