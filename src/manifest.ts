// Ikenga pkg manifest schema — mirrors the Rust schema in
// `royalti-io/ikenga` at `src-tauri/src/pkg/manifest.rs`.
//
// Source of truth is the Rust struct. This zod schema is used by the CLI,
// registry, and tooling for client-side parse + validation. Field changes
// MUST be made in lockstep with the Rust struct, and IKENGA_API_VERSION
// must be bumped if semantics change in a non-additive way.
//
// On disk: `<pkg-root>/manifest.json` (JSON, not TOML).

import { z } from 'zod';
import { EngineProvidesSchema } from './engine/index.js';

export const IKENGA_API_VERSION = 1 as const;
export const IKENGA_API_MIN_SUPPORTED = 1 as const;

// ---------- Sub-schemas ----------

export const AuthorSchema = z.object({
  name: z.string(),
  key: z.string().optional(),
});

export const McpServerSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  /** "per-call" (default) | "long-lived" */
  lifecycle: z.enum(['per-call', 'long-lived']).optional(),
  /** Phase 9: glob patterns relative to pkg dir; supervisor restarts the
   * long-lived child 250 ms after any matched file changes. Per-call entries
   * ignore this. Empty = no watcher. */
  restart_when_changed: z.array(z.string()).default([]),
  /** Phase 9: auto-restart on unexpected exit. Default true (existing
   * supervisor behavior). Set false for one-shot long-lived tools. Per-call
   * entries ignore this. */
  auto_restart: z.boolean().default(true),
});
export type McpServer = z.infer<typeof McpServerSchema>;

export const SidecarSpecSchema = z.object({
  /** Must start with `pa-<pkg-slug>-` (slug = id with `.` → `-`). */
  name: z.string(),
  /** Path inside pkg dir; may contain `{target}` (host triple). */
  bin: z.string(),
  /** "json" (default) | "raw" */
  stdio: z.string().default('json'),
  /** Phase 9: glob patterns relative to pkg dir; supervisor restarts the
   * sidecar 250 ms after any matched file changes. Empty = no watcher. */
  restart_when_changed: z.array(z.string()).default([]),
  /** Phase 9: auto-restart on unexpected exit. Default true (existing
   * supervisor behavior). Set false for one-shot tools. */
  auto_restart: z.boolean().default(true),
});
export type SidecarSpec = z.infer<typeof SidecarSpecSchema>;

export const PermissionsSchema = z.object({
  'shell.execute': z.array(z.string()).default([]),
  'fs.read': z.array(z.string()).default([]),
  'fs.write': z.array(z.string()).default([]),
  net: z.array(z.string()).default([]),
  'supabase.tables': z.array(z.string()).default([]),
  'vault.keys': z.array(z.string()).default([]),
}).default({});

export const NavEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string().optional(),
  section: z.string().optional(),
  route: z.string(),
});

export const UiRouteSchema = z.object({
  path: z.string(),
  /** "iframe" | "component" (component is builtin-only) */
  kind: z.enum(['iframe', 'component']),
  /** iframe: URL or pkg-relative html path. component: identifier. */
  source: z.string(),
});

export const CommandPaletteEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  shortcut: z.string().optional(),
  action: z.unknown(),
});

export const SidePaneViewerSchema = z.object({
  id: z.string(),
  label: z.string(),
  route: z.string(),
});

export const UiBlockSchema = z.object({
  nav: z.array(NavEntrySchema).default([]),
  routes: z.array(UiRouteSchema).default([]),
  command_palette: z.array(CommandPaletteEntrySchema).default([]),
  side_pane_viewers: z.array(SidePaneViewerSchema).default([]),
  /** Per-directive CSP overrides for the iframe content. */
  csp: z.record(z.array(z.string())).optional(),
  /** Per-directive Permission-Policy values. */
  permissions: z.record(z.array(z.string())).optional(),
}).default({});

export const SettingsFieldSchema = z.object({
  key: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'secret']),
  label: z.string(),
  default: z.unknown().optional(),
  description: z.string().optional(),
});
export const SettingsBlockSchema = z.object({
  schema: z.array(SettingsFieldSchema).default([]),
});

export const IykeRouteSchema = z.object({
  method: z.enum(['GET', 'POST']),
  /** Must start with `/pkg/<id>/`. */
  path: z.string(),
  /** `sidecar:<name> <sub>` | `event:<name>` */
  handler: z.string(),
});
export const IykeBlockSchema = z.object({
  routes: z.array(IykeRouteSchema).default([]),
  events: z.array(z.string()).default([]),
});

export const CronEntrySchema = z.object({
  id: z.string(),
  /** 6-field cron expression: sec min hour day month dow */
  expr: z.string(),
  handler: z.string(),
  env_from_settings: z.array(z.string()).default([]),
});

export const WindowBlockSchema = z.object({
  label: z.string(),
  url: z.string(),
  size: z.tuple([z.number(), z.number()]).optional(),
  decorations: z.boolean().optional(),
  menu: z.string().optional(),
});

export const QueriesBlockSchema = z.object({
  key_prefixes: z.array(z.string()).default([]),
});

/**
 * UI preview screenshot. `path` is relative to the package's install_path
 * for bundled pkgs; the shell resolves it to a webview-loadable URL on
 * render. Registry pkgs surface absolute https:// URLs through the
 * `screenshots` array on the registry entry (see `./registry.ts`).
 */
export const ScreenshotSchema = z.object({
  path: z.string(),
  caption: z.string().optional(),
});
export type Screenshot = z.infer<typeof ScreenshotSchema>;

// ---------- Manifest ----------

export const ManifestSchema = z.object({
  /** Reverse-DNS, e.g. `com.ikenga.studio`. */
  id: z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/, 'must be reverse-DNS'),
  name: z.string(),
  version: z.string(),
  /** Numeric string — host accepts versions in [MIN, CURRENT]. */
  ikenga_api: z.string().regex(/^\d+$/),

  /** Hint, not enforced: "skill" | "embedded" | "windowed" | "engine". */
  kind: z.string().optional(),
  author: AuthorSchema.optional(),
  /** Rust target triples; empty = host-agnostic. */
  targets: z.array(z.string()).default([]),

  // Capability blocks (all optional — kernel walks present blocks)
  skills: z.string().optional(),
  commands: z.string().optional(),
  agents: z.string().optional(),
  mcp: z.array(McpServerSchema).default([]),
  sidecars: z.array(SidecarSpecSchema).default([]),
  permissions: PermissionsSchema,
  migrations: z.string().optional(),
  settings: SettingsBlockSchema.optional(),
  ui: UiBlockSchema,
  iyke: IykeBlockSchema.optional(),
  cron: z.array(CronEntrySchema).default([]),
  window: WindowBlockSchema.optional(),
  queries: QueriesBlockSchema.optional(),

  /**
   * Engine-adapter manifest block. Present iff this pkg is an engine-*
   * adapter. Declares the agent id, display name, capability snapshot,
   * and onboarding hints surfaced by the first-run wizard.
   * See `@ikenga/contract/engine` for the source-of-truth schema.
   */
  engine: EngineProvidesSchema.optional(),

  /**
   * Optional UI preview screenshots surfaced by the package manager and the
   * install sheet. `path` is relative to the package's install_path; the
   * shell mints a webview-loadable URL for it on render. Packages without
   * UI (engines, MCP-only servers) typically leave this empty.
   */
  screenshots: z.array(ScreenshotSchema).default([]),
});

export type Manifest = z.infer<typeof ManifestSchema>;
/** Alias retained for symmetry with the Rust side / external consumers. */
export const PkgManifestSchema = ManifestSchema;
export type PkgManifest = Manifest;

// ---------- Helpers ----------

/** Convert a reverse-DNS id to a slug: `com.ikenga.studio` → `com-ikenga-studio`. */
export function pkgSlug(id: string): string {
  return id.replaceAll('.', '-');
}

/** Sidecar names must start with `pa-<pkg-slug>-`. */
export function expectedSidecarPrefix(id: string): string {
  return `pa-${pkgSlug(id)}-`;
}

export function isCompatible(api: string): boolean {
  const n = Number.parseInt(api, 10);
  if (Number.isNaN(n)) return false;
  return n >= IKENGA_API_MIN_SUPPORTED && n <= IKENGA_API_VERSION;
}
