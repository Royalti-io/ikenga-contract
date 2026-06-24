// pkg-browser MCP I/O types.
//
// Shared by the `@ikenga/mcp-browser` MCP server (which exposes these as
// tool inputs/outputs to Claude), the shell's `/iyke/browser/*` HTTP
// handlers (which validate them on the wire), and any other client that
// drives a child-webview pane.
//
// Pane addressing: the MCP server allocates `b1, b2, …` ids on `open()`
// and maps them internally to the kernel's `(pkg_id, pane_id)` pair. The
// kernel identifiers stay private; agents only see `bN`.
//
// Element refs: a snapshot returns opaque `e0, e1, …` refs that map to
// live DOM nodes inside the child webview. Refs invalidate on the next
// snapshot or page navigation — the same convention used by Iyke's
// `iyke_dom` so a model that knows one drives the other.
//
// This module is intentionally Zod-only (no separate JSON Schema export).
// Consumers that need JSON Schema can call `zodToJsonSchema()` themselves;
// the schema generator under `scripts/generate-schemas.mjs` does not need
// to know about browser tools.

import { z } from 'zod';

// ---------- Brands ----------

/** Pattern for pane ids allocated by the MCP server. */
export const BROWSER_PANE_ID_PATTERN = /^b[1-9]\d*$/;

/** Pattern for element refs returned by a snapshot. */
export const BROWSER_REF_PATTERN = /^e\d+$/;

export const BrowserPaneIdSchema = z
  .string()
  .regex(BROWSER_PANE_ID_PATTERN, 'must match /^b[1-9]\\d*$/ (e.g. "b1", "b42")')
  .brand<'BrowserPaneId'>();

export type BrowserPaneId = z.infer<typeof BrowserPaneIdSchema>;

export const BrowserRefSchema = z
  .string()
  .regex(BROWSER_REF_PATTERN, 'must match /^e\\d+$/ (e.g. "e0", "e12")')
  .brand<'BrowserRef'>();

export type BrowserRef = z.infer<typeof BrowserRefSchema>;

// ---------- Engine ----------
//
// Which underlying browser engine backs a pane. `webkit` (default) is the
// in-shell child-webview (WebKitGTK on Linux / WKWebView / WebView2). `chrome`
// is "Managed mode": the shell launches the user's installed Google Chrome with
// a dedicated `--user-data-dir` + `--remote-debugging-port` and drives it over
// CDP. The engine is chosen at `open()`; subsequent actions address the pane by
// id and inherit its engine. See plans/chrome-pkg/01-plan.md §Architecture.

export const BROWSER_ENGINES = ['webkit', 'chrome'] as const;

export const BrowserEngineSchema = z.enum(BROWSER_ENGINES);

export type BrowserEngine = z.infer<typeof BrowserEngineSchema>;

// ---------- Snapshot ----------
//
// Mirrors the shape of Iyke's `DomResult` so models can move between the
// two MCPs without re-learning the format. `text` is the Playwright-style
// plaintext tree; `nodes` is the structured form keyed by ref.

export const BrowserSnapshotNodeSchema = z.object({
  ref: BrowserRefSchema,
  role: z.string(),
  /** Accessible name (label, alt text, innerText, etc.). */
  name: z.string().optional(),
  /** Current value for inputs / selects / textareas. */
  value: z.string().optional(),
  /** Best-effort tag name for non-ARIA debugging. */
  tag: z.string().optional(),
  /** Truthy iff `checked`/`aria-checked` is set on a checkbox/radio. */
  checked: z.boolean().optional(),
  /** Truthy iff the element is `disabled`/`aria-disabled`. */
  disabled: z.boolean().optional(),
  /** Truthy iff `aria-expanded === "true"`. */
  expanded: z.boolean().optional(),
  /** Truthy iff `aria-selected === "true"`. */
  selected: z.boolean().optional(),
  /** Hidden / aria-hidden / display:none. Always set when `all=true`. */
  hidden: z.boolean().optional(),
  /** Refs of direct children, in document order. Omitted on leaves. */
  children: z.array(BrowserRefSchema).optional(),
});

export type BrowserSnapshotNode = z.infer<typeof BrowserSnapshotNodeSchema>;

export const BrowserSnapshotSchema = z.object({
  id: BrowserPaneIdSchema,
  url: z.string(),
  title: z.string(),
  /** Playwright-style accessibility tree, ref-annotated. */
  text: z.string(),
  /** Flat list keyed by ref. The first entry is the document root. */
  nodes: z.array(BrowserSnapshotNodeSchema),
  /** Monotonic counter for this pane; used to detect stale refs. */
  snapshotId: z.number().int().nonnegative(),
});

export type BrowserSnapshot = z.infer<typeof BrowserSnapshotSchema>;

// ---------- Pane lifecycle ----------

const RectSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});

export type BrowserRect = z.infer<typeof RectSchema>;

export const BrowserOpenInputSchema = z
  .object({
    url: z.string().url(),
    /**
     * Named cookie/storage jar slug. Must be declared in the pkg manifest's
     * `capabilities.webview.partitions` unless it's `"default"`. Mutually
     * exclusive with `session`.
     */
    partition: z.string().optional(),
    /**
     * Named-session handle (see {@link BrowserSessionSchema}). The MCP
     * server resolves this to a partition before calling the shell, so
     * multiple sessions can share an underlying partition if the caller
     * declared it that way at create time.
     */
    session: z.string().optional(),
    /**
     * Optional initial rect in main-window-client coordinates. Omitted when
     * the FE owns layout (the kernel will refuse without a rect; the MCP
     * layer is expected to supply a sane default if the caller didn't).
     *
     * Ignored for `engine: "chrome"` — Managed Chrome renders in its own OS
     * window, not a shell pane.
     */
    rect: RectSchema.optional(),
    /**
     * Which engine backs this pane. Defaults to `"webkit"` (the in-shell
     * child-webview). `"chrome"` is Managed mode (installed Chrome over CDP).
     * The pkg must declare the engine in `capabilities.webview.engines`.
     */
    engine: BrowserEngineSchema.default('webkit'),
  })
  .refine((v) => !(v.partition && v.session), {
    message: 'pass at most one of `partition` / `session`',
  });

export type BrowserOpenInput = z.infer<typeof BrowserOpenInputSchema>;

export const BrowserOpenResultSchema = z.object({
  id: BrowserPaneIdSchema,
  url: z.string(),
  partition: z.string(),
  /** The resolved engine backing this pane. */
  engine: BrowserEngineSchema,
});

export type BrowserOpenResult = z.infer<typeof BrowserOpenResultSchema>;

export const BrowserPaneIdInputSchema = z.object({ id: BrowserPaneIdSchema });
export type BrowserPaneIdInput = z.infer<typeof BrowserPaneIdInputSchema>;

export const BrowserOkResultSchema = z.object({ ok: z.literal(true) });
export type BrowserOkResult = z.infer<typeof BrowserOkResultSchema>;

export const BrowserListEntrySchema = z.object({
  id: BrowserPaneIdSchema,
  url: z.string(),
  partition: z.string(),
  focused: z.boolean(),
  /** Which engine backs this pane (`"webkit"` if absent, for back-compat). */
  engine: BrowserEngineSchema.default('webkit'),
});

export type BrowserListEntry = z.infer<typeof BrowserListEntrySchema>;

export const BrowserListResultSchema = z.object({
  panes: z.array(BrowserListEntrySchema),
});

export type BrowserListResult = z.infer<typeof BrowserListResultSchema>;

// ---------- Navigation ----------

export const BrowserGotoInputSchema = z.object({
  id: BrowserPaneIdSchema,
  url: z.string().url(),
});

export type BrowserGotoInput = z.infer<typeof BrowserGotoInputSchema>;

export const BrowserNavResultSchema = z.object({
  id: BrowserPaneIdSchema,
  url: z.string(),
});

export type BrowserNavResult = z.infer<typeof BrowserNavResultSchema>;

// ---------- Inspection ----------

export const BrowserSnapshotInputSchema = z.object({
  id: BrowserPaneIdSchema,
  /** Substring filter against role/name/value. */
  query: z.string().optional(),
  /** Include hidden + aria-hidden elements. */
  all: z.boolean().optional(),
});

export type BrowserSnapshotInput = z.infer<typeof BrowserSnapshotInputSchema>;

export const BrowserReadTextInputSchema = z.object({
  id: BrowserPaneIdSchema,
  ref: BrowserRefSchema,
});

export type BrowserReadTextInput = z.infer<typeof BrowserReadTextInputSchema>;

export const BrowserReadTextResultSchema = z.object({
  text: z.string(),
});

export type BrowserReadTextResult = z.infer<typeof BrowserReadTextResultSchema>;

export const BrowserScreenshotInputSchema = z.object({
  id: BrowserPaneIdSchema,
  /** Override default output path (`~/.local/share/ikenga/screenshots/…`). */
  out_path: z.string().optional(),
});

export type BrowserScreenshotInput = z.infer<typeof BrowserScreenshotInputSchema>;

export const BrowserScreenshotResultSchema = z.object({
  path: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
});

export type BrowserScreenshotResult = z.infer<typeof BrowserScreenshotResultSchema>;

// ---------- Interaction ----------
//
// `click` / `fill` / `select` / `press_key` all accept either a `ref` (from
// a prior snapshot, most reliable), a CSS `selector`, or — for `click` —
// an innerText `text` match. The MCP server enforces exactly-one; the
// schema accepts any combination so the validator can return a clearer
// error message than Zod's `refine` would.

const InteractionTargetFields = {
  ref: BrowserRefSchema.optional(),
  selector: z.string().optional(),
} as const;

export const BrowserClickInputSchema = z.object({
  id: BrowserPaneIdSchema,
  ...InteractionTargetFields,
  /** innerText substring match. Lower-priority than ref/selector. */
  text: z.string().optional(),
});

export type BrowserClickInput = z.infer<typeof BrowserClickInputSchema>;

export const BrowserFillInputSchema = z.object({
  id: BrowserPaneIdSchema,
  ...InteractionTargetFields,
  text: z.string(),
  /** Default false (append). True overwrites the existing value. */
  replace: z.boolean().optional(),
});

export type BrowserFillInput = z.infer<typeof BrowserFillInputSchema>;

export const BrowserSelectInputSchema = z.object({
  id: BrowserPaneIdSchema,
  ...InteractionTargetFields,
  /** Option `value` attribute (preferred) or visible label. */
  value: z.string(),
});

export type BrowserSelectInput = z.infer<typeof BrowserSelectInputSchema>;

export const BrowserPressKeyInputSchema = z.object({
  id: BrowserPaneIdSchema,
  ...InteractionTargetFields,
  /** Key combo, e.g. "Enter", "Escape", "Ctrl+S", "Meta+K", "Shift+Tab". */
  combo: z.string(),
});

export type BrowserPressKeyInput = z.infer<typeof BrowserPressKeyInputSchema>;

// ---------- wait_for ----------

export const BROWSER_WAIT_FOR_KINDS = [
  'url',
  'ref',
  'text',
  'gone-text',
  'selector',
  'gone-selector',
  'idle',
] as const;

export type BrowserWaitForKind = (typeof BROWSER_WAIT_FOR_KINDS)[number];

export const BrowserWaitForInputSchema = z.object({
  id: BrowserPaneIdSchema,
  kind: z.enum(BROWSER_WAIT_FOR_KINDS),
  /**
   * Predicate value. Required for `url`/`ref`/`text`; ignored for `idle`.
   * - `url`: substring match against `location.href`.
   * - `ref`: wait for an element with this ref to appear in the next
   *   snapshot (i.e. snapshot is re-taken until the ref exists).
   * - `text`: substring match against the snapshot's rendered text.
   */
  value: z.string().optional(),
  /** Default 10_000ms; clamped to [100, 60_000] by the server. */
  timeout_ms: z.number().int().min(100).max(60_000).optional(),
});

export type BrowserWaitForInput = z.infer<typeof BrowserWaitForInputSchema>;

export const BrowserWaitForResultSchema = z.object({
  satisfied: z.boolean(),
  elapsed_ms: z.number().int().nonnegative(),
  message: z.string().optional(),
});

export type BrowserWaitForResult = z.infer<typeof BrowserWaitForResultSchema>;

// ---------- eval (escape hatch) ----------
//
// Not surfaced through the MCP tool list by default; exposed only for the
// pkg-browser MCP's own internal scripting (a11y snapshot injection,
// console hooks). FE / Tauri-IPC callers never see this.

export const BrowserEvalInputSchema = z.object({
  id: BrowserPaneIdSchema,
  /**
   * JavaScript source to evaluate in the child webview's page context.
   * Fire-and-forget at the kernel layer; the caller is expected to ferry
   * results back via a known callback shape if needed.
   */
  script: z.string(),
});

export type BrowserEvalInput = z.infer<typeof BrowserEvalInputSchema>;

// ---------- Named sessions (Phase 4) ----------
//
// A session is a human-friendly handle for a cookie/storage partition. The
// kernel's on-disk partition data is the source of truth; this table just
// maps `(pkg_id, name) → partition`. Deleting a session preserves the
// partition data — a future create with the same partition slug picks
// the cookies back up.
//
// Timestamps are unix milliseconds (integers), matching the shell's
// SQLite-backed storage. JSON callers should treat them as opaque ints.

export const BrowserSessionSchema = z.object({
  pkg_id: z.string(),
  name: z.string().min(1).max(64),
  partition: z.string(),
  created_at: z.number().int().nonnegative(),
  last_used_at: z.number().int().nonnegative().nullable().optional(),
});

export type BrowserSession = z.infer<typeof BrowserSessionSchema>;

export const BrowserSessionCreateInputSchema = z.object({
  name: z.string().min(1).max(64),
  /** Defaults to a sanitized form of `name` if omitted. */
  partition: z.string().optional(),
});

export type BrowserSessionCreateInput = z.infer<typeof BrowserSessionCreateInputSchema>;

export const BrowserSessionDeleteInputSchema = z.object({
  name: z.string().min(1).max(64),
});

export type BrowserSessionDeleteInput = z.infer<typeof BrowserSessionDeleteInputSchema>;

export const BrowserSessionListResultSchema = z.object({
  sessions: z.array(BrowserSessionSchema),
});

export type BrowserSessionListResult = z.infer<typeof BrowserSessionListResultSchema>;
