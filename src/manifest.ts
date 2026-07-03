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
import { BrowserEngineSchema } from './browser.js';

// v2 (WP-05): added capabilities.sqlite + permissions["sqlite.tables"];
// permissions["supabase.tables"] kept as a compat alias for api=1 manifests.
// v3 (ADR-017): added capabilities.http / .secrets / .invoke (trusted-cap tier)
// + top-level optional `signature`. All additive; api=1/2 manifests parse
// unchanged. Elevated caps are inert unless the pkg is trusted.
export const IKENGA_API_VERSION = 3 as const;
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
  /** Local SQLite table patterns; validated against tables.json at install time.
   *  For api ≥ 2 manifests. Replaces `supabase.tables`. */
  'sqlite.tables': z.array(z.string()).default([]),
  /** @deprecated api=1 compat alias for `sqlite.tables`. New manifests should
   *  use `sqlite.tables` instead. Kept so ikenga_api="1" manifests parse
   *  without errors during the transition window. */
  'supabase.tables': z.array(z.string()).default([]),
  'vault.keys': z.array(z.string()).default([]),
  /** Engine scopes exercisable from the pkg iframe. `"invoke"` gates the
   *  FE-side host.sendToActiveSession / host.startChatSession verbs
   *  (pkgDeclaresScope). Mirrors `Permissions.engine` in the shell's
   *  manifest.rs — keep in lockstep. */
  engine: z.array(z.string()).default([]),
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

/** Local SQLite capability (api ≥ 2). Threads the logical db name into the
 *  iframe host context so the pkg can call `db_query` without hard-coding it.
 *  Mirrors `SqliteCapability` in `shell/src-tauri/src/pkg/manifest.rs`. */
export const SqliteCapabilitySchema = z.object({
  /** Logical DB name. Currently only `"ikenga.local"` is supported.
   *  Defaults to `"ikenga.local"` when omitted. */
  db: z.string().default('ikenga.local'),
});
export type SqliteCapability = z.infer<typeof SqliteCapabilitySchema>;

/** Supabase capability. Mirrors `SupabaseCapability` in
 *  `shell/src-tauri/src/pkg/manifest.rs`. */
export const SupabaseCapabilitySchema = z.object({
  /** When true, mint fails if the Supabase vault keys are missing; when
   *  false/omitted, missing keys surface as `supabase: null` in host context. */
  required: z.boolean().default(false),
});
export type SupabaseCapability = z.infer<typeof SupabaseCapabilitySchema>;

/** Native child-webview capability. Mirrors `WebviewCapability` in
 *  `shell/src-tauri/src/pkg/manifest.rs`. */
export const WebviewCapabilitySchema = z.object({
  /** Whether this pkg may create child webviews via the kernel. Required for
   *  any `ui.routes[]` entry with `kind = "webview"` to mount. */
  child_webviews: z.boolean().default(false),
  /** Named cookie/data partitions; empty = the implicit "default" partition. */
  partitions: z.array(z.string()).default([]),
  /** Browser engines this pkg may open panes with. `"webkit"` is the in-shell
   *  child-webview; `"chrome"` is Managed mode (installed Chrome over CDP, its
   *  own OS window). Defaults to `["webkit"]` so existing manifests are
   *  unchanged. Mirrors `engines` in `WebviewCapability` (manifest.rs). */
  engines: z.array(BrowserEngineSchema).default(['webkit']),
});
export type WebviewCapability = z.infer<typeof WebviewCapabilitySchema>;

/** Agent-ops host-bridge capability (api ≥ 2). Opt-in to the privileged
 *  `host.agentOps.*` verbs (run-now / enable-disable / list-jobs) the shell
 *  exposes for the agent-ops observability pkg — these reach the always-on
 *  cron daemon's localhost trigger endpoint and read the daemon's config +
 *  state files, hops an iframe cannot make itself. Presence of the block is
 *  the gate (mirrors the `capabilities.sqlite` opt-in). Mirrors
 *  `AgentOpsCapability` in `shell/src-tauri/src/pkg/manifest.rs`. */
export const AgentOpsCapabilitySchema = z.object({});
export type AgentOpsCapability = z.infer<typeof AgentOpsCapabilitySchema>;

/** host.fetch capability (ADR-017, TRUSTED-only). Host-mediated HTTP proxy;
 *  the shell makes the request and attaches auth from Stronghold — the key
 *  never enters the iframe. URL allowlist = `permissions.net`. Mirrors
 *  `HttpCapability` in `shell/src-tauri/src/pkg/manifest.rs`. */
export const HttpCapabilitySchema = z
  .object({
    /** Name of a `capabilities.secrets` declaration whose resolved value the
     *  shell attaches as the auth header. Omit = unauthenticated proxy. */
    auth_secret: z.string().optional(),
    /** Header name for the auth secret. Default "Authorization". */
    auth_header: z.string().default('Authorization'),
  })
  .strict();
export type HttpCapability = z.infer<typeof HttpCapabilitySchema>;

/** One named-secret declaration. `vault_key` is resolved host-side and never
 *  reaches the iframe; the iframe sees only `hostContext.secrets[name]`.
 *  Mirrors `NamedSecret` in `shell/src-tauri/src/pkg/manifest.rs`. */
export const NamedSecretSchema = z
  .object({
    name: z.string(),
    /** Vault key (must be within permissions["vault.keys"]). Host-only. */
    vault_key: z.string(),
    /** When true, mount fails if the key is missing (Supabase `required`). */
    required: z.boolean().default(false),
    /** Optional value-format hint: "jwt" | "bearer" | "raw". String, not enum. */
    format: z.string().optional(),
  })
  .strict();
export type NamedSecret = z.infer<typeof NamedSecretSchema>;

/** Named-secret injection capability (ADR-017, TRUSTED-only). Generalizes the
 *  Supabase hostContext handshake. Mirrors `SecretsCapability` in
 *  `shell/src-tauri/src/pkg/manifest.rs`. */
export const SecretsCapabilitySchema = z
  .object({
    declarations: z.array(NamedSecretSchema).default([]),
  })
  .strict();
export type SecretsCapability = z.infer<typeof SecretsCapabilitySchema>;

/** Scoped Tauri invoke passthrough (ADR-017, TRUSTED-only). Presence gates
 *  `host.invoke`; `commands` is the named-command allowlist matched (glob) by
 *  `permissions_check::check_shell_execute` against the `host.invoke` command.
 *
 *  D-06: the allowlist is `invoke`'s OWN field, NOT `permissions["shell.execute"]`.
 *  Reusing `shell.execute` would trip `requires_trust` → the pkg only ever reaches
 *  user-`Granted`, never `AutoTrusted`, so `is_trusted_for_elevated()` is false and
 *  `host.invoke` would always deny. Keeping the allowlist here lets a signed/builtin
 *  pkg declare invokable commands while leaving `shell.execute` empty → AutoTrusted →
 *  elevated. POLICY: named commands only, never `*` (not a general shell).
 *  Mirrors `InvokeCapability` in `shell/src-tauri/src/pkg/manifest.rs`. */
export const InvokeCapabilitySchema = z
  .object({
    commands: z.array(z.string()).default([]),
  })
  .strict();
export type InvokeCapability = z.infer<typeof InvokeCapabilitySchema>;

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

/** Forward-dependency source for a `requires[]` entry. Mirrors the Rust
 *  `RequireSource` enum (`pkg/manifest.rs`) and the registry `ProvenanceSource`
 *  set. Optional on an entry — absent means the resolver looks the dep up in the
 *  store registry / catalog. */
export const RequireSourceSchema = z.enum(['git', 'npx', 'catalog', 'local']);
export type RequireSource = z.infer<typeof RequireSourceSchema>;

/**
 * One forward-dependency edge (`requires[]` element, ADR-015 §3 / Ọba WP-11).
 * Names a standalone Ọba primitive a pkg `requires`; the resolver (WP-13/14)
 * installs the closure at install/enable. This is a SEPARATE graph from a
 * skill's `SKILL.md` `depends_on` (the G-04 authoring star, `skill-core`-only):
 * a pkg `requires` MAY reference any primitive, and the publish-time lift
 * (WP-12) compiles `depends_on` into this field. `.strict()` mirrors the Rust
 * `deny_unknown_fields` on `RequiresEntry`. Source of truth: the Rust struct in
 * `shell/src-tauri/src/pkg/manifest.rs` — keep in lockstep.
 */
export const RequiresEntrySchema = z
  .object({
    /** Primitive kind: skill | agent | command | hook | mcp. Kept a string so a
     *  future kind doesn't break old manifests. */
    kind: z.string(),
    /** Primitive name (e.g. `skill-core`, `@ikenga/studio-beat-detect`). */
    name: z.string(),
    /** Optional fetch source. */
    source: RequireSourceSchema.optional(),
    /** Optional git tag/branch or version pin. The shape leaves room for an
     *  explicit semver range later without another schema break. */
    ref: z.string().optional(),
  })
  .strict();
export type RequiresEntry = z.infer<typeof RequiresEntrySchema>;

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
  // NOTE (WP-17, ADR-015 decision 4): the `skills`/`commands`/`agents`
  // asset-bundling fields were HARD-RETIRED (lockstep with the Rust
  // `Manifest`). A pkg no longer embeds Claude-config assets; it only
  // `requires` standalone Ọba primitives. The schema is `.strict()`, so a
  // manifest still declaring any of them now FAILS validation (no deprecation
  // window). The shell builtin `com.ikenga.iyke` places its skill/commands by
  // convention from on-disk folders, not via a manifest field.
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

  /** Optional capabilities the host resolves and injects at iframe-mount
   *  time via the AppBridge `hostContext` handshake. Mirrors the Rust
   *  `CapabilitiesBlock` in `shell/src-tauri/src/pkg/manifest.rs`. */
  capabilities: z.object({
    supabase: SupabaseCapabilitySchema.optional(),
    sqlite: SqliteCapabilitySchema.optional(),
    webview: WebviewCapabilitySchema.optional(),
    agentOps: AgentOpsCapabilitySchema.optional(),
    /** host.fetch proxy (ADR-017). Inert unless the pkg is trusted. */
    http: HttpCapabilitySchema.optional(),
    /** Named-secret injection (ADR-017). Inert unless trusted. */
    secrets: SecretsCapabilitySchema.optional(),
    /** host.invoke passthrough (ADR-017). Inert unless trusted. */
    invoke: InvokeCapabilitySchema.optional(),
  }).optional(),

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

  /**
   * Forward dependency declarations (ADR-015 §3 / Ọba WP-11). Each entry names a
   * standalone primitive this pkg `requires`; the Ọba resolver installs the
   * closure at install/enable. A SEPARATE graph from a skill's `depends_on` (the
   * G-04 authoring star). Empty by default so pre-Phase-4 manifests are
   * unaffected. Mirrors `requires: Vec<RequiresEntry>` on the Rust `Manifest`
   * (`pkg/manifest.rs`) — keep in lockstep (`deny_unknown_fields`).
   */
  requires: z.array(RequiresEntrySchema).default([]),

  /** Optional ed25519 signature over the normalized manifest JSON (sort keys,
   *  strip `signature` before signing). Format `"ed25519:<base64>"`. Present
   *  on notarized registry pkgs; verified at install against the publisher key
   *  the signed registry index named. Absent → pkg isn't trusted (no elevated
   *  caps). Mirrors `signature: Option<String>` on the Rust `Manifest`. */
  signature: z.string().optional(),
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
