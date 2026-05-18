/**
 * Portability surface for engine pkgs — ADR-012.
 *
 * Engine pkgs implement this in parallel to the runtime adapter
 * (`AcpEngine` in `./acp.ts`). The kernel's `engine_assets` registry calls
 * these methods at pkg install / uninstall time, fanning the operation out
 * to every installed `EngineAdapter` so a user's pkg investment (skills,
 * commands, agents, MCP servers) survives an engine swap.
 *
 * No manifest schema changes — pkgs continue to declare `skills`,
 * `commands`, `agents` as folder paths and `mcp[]` as inline entries.
 * This file is a runtime interface; it has no Zod schema and no
 * compile-time dependency on the manifest schema beyond reusing
 * `McpServer` for the spec passed to `registerMcpServer`.
 */

import type { McpServer } from '../manifest.js';

/**
 * Result of an install / register operation. Per ADR §2 the kernel's pkg
 * manager UI surfaces these so the user can see exactly what each engine
 * adapter wrote.
 */
export interface InstallReport {
  /** Absolute paths the adapter wrote or symlinked. */
  wrote: string[];
  /** Targets that were already correct — idempotent no-op. */
  skipped: string[];
  /** Non-fatal notes (e.g. "commands not supported on Codex; skipped"). */
  warnings: string[];
}

/**
 * Dry-run output for `EngineAdapter.plan()`. Shape mirrors `InstallReport`
 * plus the `(engineId, pkgId)` tuple so the pkg manager UI can render a
 * per-engine breakdown ("this pkg will install assets into 3 engines").
 */
export interface InstallPlan extends InstallReport {
  /** Engine the plan was computed against — matches `EngineAdapter.id`. */
  engineId: string;
  /** Pkg the plan was computed for — matches the manifest `id` field. */
  pkgId: string;
}

/**
 * Minimal pkg manifest slice the adapter needs to compute a plan. Carved
 * narrow on purpose: `plan()` runs before install, so it shouldn't load
 * disk content the adapter wouldn't otherwise touch. Folder paths are
 * relative to the pkg root (same convention as the on-disk manifest).
 */
export interface ManifestSnapshot {
  /** Pkg id (e.g. `com.ikenga.studio`). */
  id: string;
  /** Pkg slug used to namespace materialized dirs (id with `.` → `-`). */
  slug: string;
  /** Relative folder for `skills/<name>/SKILL.md` files, if any. */
  skills?: string;
  /** Relative folder for `commands/<name>.md` files, if any. */
  commands?: string;
  /** Relative folder for `agents/<name>.md` files, if any. */
  agents?: string;
  /** Inline MCP server specs from the manifest's `mcp[]` block. */
  mcp: McpServer[];
}

/**
 * Portability adapter exported by every engine pkg alongside its runtime
 * `AcpEngine`. The kernel resolves both at load time (ADR §2).
 *
 * Folder-level methods. Each `install*` call is the adapter's chance to
 * symlink, copy, or walk-and-transcode the whole folder — the choice
 * depends on what the engine accepts natively. Idempotent by contract:
 * re-running with unchanged inputs is a no-op.
 *
 * `registerMcpServer` writes a single entry into the engine's external
 * settings file (`~/.claude/settings.json`, `~/.gemini/settings.json`,
 * `~/.codex/config.toml`). Entries are keyed `ikenga.<pkg-slug>.<name>`
 * per ADR §7 so they never collide with user-authored entries.
 *
 * Inverses tear down only what this pkg owned — user content in the same
 * dir / settings file is left untouched.
 */
export interface EngineAdapter {
  /** Engine identifier — matches `engine.agentId` in the pkg manifest. */
  readonly id: string;

  /**
   * Materialize the pkg's skills folder into the engine's recognized
   * location. Idempotent.
   */
  installSkills(folder: string, pkgId: string, pkgSlug: string): Promise<InstallReport>;

  /**
   * Materialize the pkg's commands folder. Engines without a first-class
   * commands primitive (Codex) may emit warnings and skip per-file
   * instead of erroring — see ADR §5.
   */
  installCommands(folder: string, pkgId: string, pkgSlug: string): Promise<InstallReport>;

  /** Materialize the pkg's agents folder. Codex transcodes MD→TOML. */
  installAgents(folder: string, pkgId: string, pkgSlug: string): Promise<InstallReport>;

  /**
   * Register one MCP server in the engine's external settings file.
   * Idempotent on the `(pkgSlug, server name)` key.
   */
  registerMcpServer(spec: McpServer, pkgId: string, pkgSlug: string): Promise<InstallReport>;

  /** Inverse of `installSkills`. Removes only entries this pkg owned. */
  uninstallSkills(pkgId: string, pkgSlug: string): Promise<void>;
  /** Inverse of `installCommands`. */
  uninstallCommands(pkgId: string, pkgSlug: string): Promise<void>;
  /** Inverse of `installAgents`. */
  uninstallAgents(pkgId: string, pkgSlug: string): Promise<void>;
  /** Inverse of `registerMcpServer`. */
  unregisterMcpServer(serverName: string, pkgId: string, pkgSlug: string): Promise<void>;

  /**
   * Dry-run used by the pkg manager UI. Returns the same shape as a real
   * install would produce, without touching the filesystem.
   */
  plan(pkgId: string, pkgSlug: string, manifestSnapshot: ManifestSnapshot): Promise<InstallPlan>;
}
