// Multi-window contract — mirrors the Rust source-of-truth in
// `royalti-io/ikenga` at `src-tauri/src/window/{descriptor,events}.rs`.
//
// This is the `G-WINDOW-MODEL` freeze-gate output (plans/multi-window WP-02).
// It has TWO co-equal halves: the `WindowDescriptor` (what a window IS) and the
// cross-window event envelope (how windows talk over the shared Rust core).
// Both are imported by every downstream consumer (the window registry, the thin
// detached FE entry, Flavor C). Field changes MUST be made in lockstep with the
// Rust structs; bump WINDOW_CONTRACT_VERSION on any non-additive change.

import { z } from 'zod';

/** Envelope + descriptor wire version. Bumped on non-additive change. */
export const WINDOW_CONTRACT_VERSION = 1 as const;

// ---------- WindowDescriptor ----------

/**
 * What a window is.
 * - `primary`        — the original "main" window (full chrome).
 * - `single-surface` — a thin detached window hosting one surface (Flavor C).
 * - `pane-set`       — a torn-off pane group (Flavor A, Phase 2).
 * - `workspace`      — a second full workspace window (Flavor B, Phase 3).
 */
export const WindowKindSchema = z.enum([
	'primary',
	'single-surface',
	'pane-set',
	'workspace',
]);
export type WindowKind = z.infer<typeof WindowKindSchema>;

export const WindowDescriptorSchema = z
	.object({
		/** OS window label. "main" for the primary; "detached-<n>" otherwise. */
		label: z.string().min(1),
		kind: WindowKindSchema,
		/** Surface/route ids the window's FE entry mounts. */
		surface_set: z.array(z.string()).default([]),
		/** Project this window is bound to (Flavor B); null = follows primary. */
		project_id: z.string().nullable().default(null),
		/**
		 * SQLite `layout_state` partition. A KEY-STRING suffix folded into
		 * `scopedKey()` (G-03) — NOT a new column. Usually equals `label`.
		 */
		layout_key: z.string().min(1),
	})
	.strict();
export type WindowDescriptor = z.infer<typeof WindowDescriptorSchema>;

// ---------- Cross-window event envelope ----------

/**
 * Where a window event goes. The DEFAULT for streaming/data channels is
 * `broadcast` (every window filters its own subscription); only the channels
 * that race (see WINDOW_TARGETED_CHANNELS) carry `window` targeting.
 */
export const WindowEventTargetSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('broadcast') }).strict(),
	z.object({ kind: z.literal('window'), label: z.string().min(1) }).strict(),
]);
export type WindowEventTarget = z.infer<typeof WindowEventTargetSchema>;

/**
 * The base shape every cross-window event rides. `payload` is opaque at the
 * contract layer (each topic refines it); the envelope itself is what the
 * registry + windows agree on.
 */
export const WindowEventEnvelopeSchema = z
	.object({
		v: z.literal(WINDOW_CONTRACT_VERSION),
		/** Channel name, e.g. "window://opened". */
		topic: z.string().min(1),
		/** Emitting window label, or "core" for the Rust core. */
		source_label: z.string().min(1),
		target: WindowEventTargetSchema,
		payload: z.unknown(),
	})
	.strict();
export type WindowEventEnvelope = z.infer<typeof WindowEventEnvelopeSchema>;

/** Canonical window-lifecycle channels emitted by the Rust core. */
export const WINDOW_TOPICS = {
	opened: 'window://opened',
	closed: 'window://closed',
	focusChanged: 'window://focus-changed',
} as const;
export type WindowTopic = (typeof WINDOW_TOPICS)[keyof typeof WINDOW_TOPICS];

/**
 * Channels that MUST be window-targeted (`emit_to`) rather than broadcast,
 * because a broadcast races across windows (first-reply-wins / wrong-window).
 * Everything not listed here stays broadcast + per-window topic filtering.
 * (plans/multi-window 03-research-internal: the ~25-channel routing table.)
 */
export const WINDOW_TARGETED_CHANNELS = [
	'screenshot://request',
	'screenshot://shortcut',
	'projects:active-changed',
] as const;
