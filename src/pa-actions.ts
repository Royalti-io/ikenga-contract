/**
 * Approve-gate draft types — the run-then-pause (`ux_mode: approve`) payload.
 *
 * An approve-aware action does its work, then — instead of performing the
 * external side effect — hands the shell a batch of `DraftItem`s plus an
 * `ApproveGateMeta` via the (forthcoming) `host.paActionsPause` verb. The shell
 * persists them to `pa_action_drafts` (ikenga.db), emits `pa-action-paused`, and
 * mounts the approve-gate panel
 * (`shell/src/shell/atelier/surfaces/approve-gate-panel.tsx`) at
 * `/outbox/approvals`. The panel renders the rich `PausedDraft` view-model;
 * `fromDraftItem` derives it from the lean producer `DraftItem` so producers
 * stay simple (they never hand-build display state).
 *
 * Scope: `plans/atelier/10-approve-gate-seam.md` (WP-1); behaviour:
 * `07-fe-button-renderer.md` §3.5. Plain-TS by convention (mirrors
 * `host-verbs.ts`) — runtime validation, when needed, lives at the host boundary.
 */

/** Outbound channel an approve gate commits to. Locked to provider identity. */
export type DraftChannel = 'smtp' | 'resend' | 'listmonk' | 'buffer';

/** Human channel label (display). */
export const CHANNEL_LABEL: Record<DraftChannel, string> = {
	smtp: 'SMTP',
	resend: 'Resend',
	listmonk: 'Listmonk',
	buffer: 'Buffer',
};

/** A draft's position inside an outreach sequence/drip, if any. */
export interface DraftSequence {
	name: string;
	step: number;
	total: number;
	/** Audience size for this step (e.g. a 388-recipient newsletter section). */
	recipients: number;
}

/** One sub-post in an X/Twitter thread (X allows ≤4 images per tweet). */
export interface ThreadPost {
	text: string;
	/** Per-sub-post media URLs (X allows ≤4 images per tweet). */
	imageUrls?: string[];
}

/**
 * Media block carried on a Buffer DraftItem. `kind` selects the adapter path:
 * - `'single'`   — 0–1 image attached to the post body.
 * - `'carousel'` — 2–10 images (IG ≤10, LI ≤9); adapter uses multi-asset upload.
 * - `'thread'`   — ordered sub-posts; adapter posts as N linked Buffer posts (≥2, ≤25).
 */
export interface SocialMedia {
	kind: 'single' | 'carousel' | 'thread';
	/** single = 0–1 image URL; carousel = 2–10 (platform-dependent). */
	imageUrls?: string[];
	/** thread-kind only: ordered sub-posts (≥2, ≤25). */
	thread?: ThreadPost[];
}

/**
 * What an approve-aware action emits per draft — the lean, authoritative
 * producer shape. The shell derives the panel's `PausedDraft` from this via
 * `fromDraftItem` (computes preview, time bucketing, consequence), so an action
 * never hand-builds display state.
 */
export interface DraftItem {
	id: string;
	/** Recipient display (a person, or a broadcast target like "L5 Winback · 388 recipients"). */
	recipient: string;
	recipientEmail: string | null;
	tenantId?: string | null;
	subject: string;
	body: string;
	channel: DraftChannel;
	/** Sending address, e.g. "chinedum@royalti.io" or "ned@getroyalti.com". */
	senderAddress: string;
	/** Sending route display, e.g. "SMTP · Fastmail". */
	fromProvider: string;
	/** Cold outreach (separate sender domain / reputation). */
	cold?: boolean;
	/**
	 * Audience size for the consequence line; defaults to 1.
	 * Kept for display (e.g. "388 recipients"); use `recipientsList` for the actual
	 * per-recipient send list on direct-email channels.
	 */
	recipients?: number;
	/**
	 * Actual recipient list for direct-email channels (smtp, resend).
	 * Adapters iterate this for per-recipient sends + partial-success tracking (DEC-9).
	 * Broadcast channels (listmonk, buffer) address a list/channel audience and
	 * ignore this field.
	 */
	recipientsList?: { name?: string; email: string }[];
	/**
	 * Body content type — adapters set the MIME part accordingly.
	 * Defaults to `'text'` when absent.
	 */
	bodyFormat?: 'html' | 'text';
	/** Reply-To header for direct-email channels (smtp, resend). */
	replyTo?: string;
	/** Machine schedule time (ISO) for overdue/today bucketing; null = unscheduled. */
	scheduledIso: string | null;
	/** Row time display, e.g. "scheduled 17:00" / "today" / "2d late". */
	scheduledLabel: string;
	/** Detail-chip schedule display, e.g. "Scheduled · today 17:00". Falls back to scheduledLabel. */
	scheduledChip?: string;
	sequence?: DraftSequence | null;
	deal?: string | null;
	threadCount?: string;
	/** Explicit section bucket; otherwise derived from `scheduledIso`. */
	section?: string;
	// ── Buffer / social fields (mirror of payload_json media contract) ──────────
	/**
	 * Resolved Buffer channel id — company vs personal LinkedIn disambiguated at
	 * enqueue time (not in the adapter). Only set for `channel: 'buffer'` drafts.
	 */
	channelId?: string;
	/**
	 * First comment text for hashtags / blog URL. Avoids Buffer link-preview
	 * attachment errors on LinkedIn. Mapped to `metadata.<platform>.firstComment`.
	 */
	firstComment?: string;
	/**
	 * Social media block; selects single / carousel / thread adapter path.
	 * Kept in lockstep with `payload.schema.ts` `SocialMedia` Zod schema and
	 * the worker mirror in `scripts/cron/lib/channels/types.ts`.
	 */
	media?: SocialMedia;
}

/**
 * Partial-success result returned by a `ChannelAdapter.send()` call (DEC-9).
 * `ok` is true when at least one recipient was accepted; `failed` lists
 * per-recipient errors so callers can surface them without dropping success.
 * Shared here so the contract module is the single SoT; the daemon's
 * `lib/channels/types.ts` imports it directly from `@ikenga/contract`.
 */
export interface SendResult {
	/** False only when ALL recipients failed (or a batch-level error occurred). */
	ok: boolean;
	/** Provider message/campaign/post id — write around the network call where supported (G-05). */
	externalId?: string;
	/** Addresses the provider accepted (partial success — DEC-9). */
	sent?: string[];
	/** Per-recipient failures for partial-success scenarios. */
	failed?: { email: string; error: string }[];
	/** Batch-level error message (to error_text column) when ok is false. */
	error?: string;
	/** True for transient errors (5xx/429/network) — drives in-worker retry vs permanent fail. */
	retryable?: boolean;
}

/** Batch-level metadata for one approve-mode run (the gate header + undo window). */
export interface ApproveGateMeta {
	/** `<pkgId>/<verb>` that produced the batch. */
	actionId: string;
	/** Human action name for the gate header. */
	actionName: string;
	/** Drafting agent label, e.g. "PA" / "CMO" / "CBO". */
	agent: string;
	/** Engine/model that drafted, e.g. "Opus 4.7". */
	model: string;
	/** Undo window before commit, ms. Defaults to 10_000. */
	undoMs?: number;
}

/**
 * The rich view-model the approve-gate panel renders. Kept byte-identical to the
 * panel's prior local definition so the panel just imports it. Derived from a
 * `DraftItem` + `ApproveGateMeta` via `fromDraftItem`; the panel flips
 * `everEdited`/`status` locally as the operator edits.
 */
export interface PausedDraft {
	id: string;
	recipient: string;
	recipientEmail: string | null;
	tenantId: string | null;
	subject: string;
	body: string;
	bodyPreview: string;
	channel: DraftChannel;
	agent: string;
	senderAddress: string;
	cold: boolean;
	/**
	 * Panel display status. `'failed'` means the send worker exhausted retries
	 * and the draft needs operator attention (see `errorMessage` / `attempts`).
	 */
	status: 'awaiting' | 'edited' | 'overdue' | 'failed';
	scheduledAt: string;
	scheduledLabel: string;
	timeVariant: 'is-today' | 'is-overdue' | null;
	overdue: boolean;
	everEdited: boolean;
	section: string;
	sequence: DraftSequence | null;
	fromProvider: string;
	model: string;
	threadCount: string;
	deal: string | null;
	consequence: {
		target: string;
		recipients: number;
		channel: string;
		time: string;
		undoMs: number;
	};
	/** Last error surfaced by the send worker (from pa_action_drafts.error_text). */
	errorMessage?: string;
	/** Number of send attempts so far (from pa_action_drafts.attempts). */
	attempts?: number;
}

const PREVIEW_MAX = 160;
const DEFAULT_UNDO_MS = 10_000;

/** Collapse whitespace + truncate `body` for the row preview line. */
export function draftPreview(body: string, max = PREVIEW_MAX): string {
	const flat = body.replace(/\s+/g, ' ').trim();
	return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

function sameLocalDay(a: number, b: number): boolean {
	const da = new Date(a);
	const db = new Date(b);
	return (
		da.getFullYear() === db.getFullYear() &&
		da.getMonth() === db.getMonth() &&
		da.getDate() === db.getDate()
	);
}

/**
 * Derive the panel's `PausedDraft` from a producer `DraftItem` + the batch
 * `ApproveGateMeta`. `now` is injectable for deterministic tests; it only affects
 * time bucketing (overdue / today / section). Pure + side-effect-free.
 *
 * `errorMessage` and `attempts` are not derivable from a `DraftItem` (they live
 * on the DB row after worker runs); callers that reconstruct a `PausedDraft` from
 * a stored row should set them on the returned object directly.
 */
export function fromDraftItem(
	item: DraftItem,
	meta: ApproveGateMeta,
	now: number = Date.now()
): PausedDraft {
	const scheduledMs = item.scheduledIso ? Date.parse(item.scheduledIso) : null;
	const hasTime = scheduledMs !== null && !Number.isNaN(scheduledMs);
	const overdue = hasTime && (scheduledMs as number) < now;
	const today = hasTime && !overdue && sameLocalDay(scheduledMs as number, now);
	const timeVariant: PausedDraft['timeVariant'] = overdue
		? 'is-overdue'
		: today
			? 'is-today'
			: null;
	const section = item.section ?? (overdue ? 'Overdue' : today ? 'Today' : 'This week');

	return {
		id: item.id,
		recipient: item.recipient,
		recipientEmail: item.recipientEmail,
		tenantId: item.tenantId ?? null,
		subject: item.subject,
		body: item.body,
		bodyPreview: draftPreview(item.body),
		channel: item.channel,
		agent: meta.agent,
		senderAddress: item.senderAddress,
		cold: item.cold ?? false,
		status: overdue ? 'overdue' : 'awaiting',
		scheduledAt: item.scheduledLabel,
		scheduledLabel: item.scheduledChip ?? item.scheduledLabel,
		timeVariant,
		overdue,
		everEdited: false,
		section,
		sequence: item.sequence ?? null,
		fromProvider: item.fromProvider,
		model: meta.model,
		threadCount: item.threadCount ?? '',
		deal: item.deal ?? null,
		consequence: {
			target: item.recipient,
			recipients: item.recipients ?? 1,
			channel: CHANNEL_LABEL[item.channel],
			time: item.scheduledLabel,
			undoMs: meta.undoMs ?? DEFAULT_UNDO_MS,
		},
	};
}
