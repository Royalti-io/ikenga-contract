// Ikenga registry schema — the static JSON catalog served by
// `Royalti-io/ikenga-registry` over GitHub Pages.
//
// Shape: a small root `index.json` lists every pkg with its latest version
// and a pointer to a per-pkg detail file (`pkgs/<short-name>.json`).
// The detail file holds the full per-version metadata (manifest, tarball
// URL, integrity, dep tree). Consumers (the shell, the `ikenga` CLI)
// fetch the root index on boot/refresh, then lazy-load detail files on
// demand.
//
// Source of truth for `manifest` inside a `PkgVersion` is `ManifestSchema`
// in this same package. Registry consumers can trust manifests because the
// publisher (the `ikenga-pkgs` release workflow) reads the pkg's own
// `manifest.json` at publish time.

import { z } from 'zod';
import { ManifestSchema } from './manifest.js';

export const REGISTRY_SCHEMA_VERSION = 1 as const;

// ---------- Per-pkg detail (pkgs/<short-name>.json) ----------

/**
 * Dependency on another @ikenga/pkg-* in the registry. External npm deps
 * (non-`@ikenga/pkg-*`) are bundled into the published tarball and resolved
 * at publish time, so they don't appear here.
 */
export const PkgDepSchema = z.object({
  /** Full npm name, e.g. `@ikenga/pkg-engine-claude-code`. */
  name: z.string(),
  /** Semver range as declared in the pkg's package.json. */
  range: z.string(),
});
export type PkgDep = z.infer<typeof PkgDepSchema>;

/**
 * Hosted preview screenshot for a registry pkg. The publish workflow uploads
 * each `manifest.screenshots[].path` to a CDN and emits the absolute URL
 * here, so the shell can render a preview without downloading the pkg.
 */
export const HostedScreenshotSchema = z.object({
  url: z.string().url(),
  caption: z.string().optional(),
});
export type HostedScreenshot = z.infer<typeof HostedScreenshotSchema>;

export const PkgVersionSchema = z.object({
  /** Semver, e.g. `0.1.0`. */
  version: z.string(),
  /** ISO-8601 publish time, as reported by npm. */
  publishedAt: z.string(),
  /** npm tarball URL — what the shell/CLI downloads to install the pkg. */
  tarball: z.string().url(),
  /** SRI-style integrity (sha512-...) as returned by npm. */
  integrity: z.string(),
  /** Tarball size in bytes (npm `dist.unpackedSize` is unpacked; this is packed). */
  size: z.number().int().nonnegative().optional(),
  /** The pkg's own manifest.json contents at this version. */
  manifest: ManifestSchema,
  /** Cross-pkg deps within `@ikenga/pkg-*`. External deps ride in the tarball. */
  deps: z.array(PkgDepSchema).default([]),
  /**
   * Absolute URLs for the screenshots declared in the manifest. The publish
   * workflow uploads `manifest.screenshots[].path` files to a CDN and emits
   * the resulting URL here; consumers should prefer these over the relative
   * `manifest.screenshots[].path` values (which are only meaningful after
   * install). Same order as `manifest.screenshots`; captions are mirrored.
   */
  screenshots: z.array(HostedScreenshotSchema).default([]),
});
export type PkgVersion = z.infer<typeof PkgVersionSchema>;

export const PkgDetailSchema = z.object({
  $schemaVersion: z.literal(REGISTRY_SCHEMA_VERSION),
  /** Full npm name, e.g. `@ikenga/pkg-engine-claude-code`. */
  name: z.string(),
  /** ISO-8601 — last time any version was published. */
  updatedAt: z.string(),
  /** Newest-first. The first element is `latest`. */
  versions: z.array(PkgVersionSchema).min(1),
});
export type PkgDetail = z.infer<typeof PkgDetailSchema>;

// ---------- Root index (index.json) ----------

export const RegistryEntrySchema = z.object({
  /** Full npm name. */
  name: z.string(),
  /** Latest semver. */
  latest: z.string(),
  /**
   * Relative path from `index.json` to the per-pkg detail file.
   * Convention: `pkgs/<short-name>.json` where short-name is the npm name
   * minus the `@ikenga/` scope and `pkg-` prefix (e.g.
   * `@ikenga/pkg-engine-claude-code` → `engine-claude-code`).
   */
  detail: z.string(),
  /** Short description, mirrored from the manifest's `name`/`description`. */
  description: z.string().optional(),
  /** Manifest `kind` hint ("engine" | "skill" | "embedded" | "windowed"). */
  kind: z.string().optional(),
  /**
   * Hero screenshot URL for the catalog row thumbnail. Set to the first
   * uploaded screenshot of the latest version. Omitted for pkgs without UI.
   * Lets the shell render a thumb without fetching the per-pkg detail file.
   */
  screenshot: z.string().url().optional(),
  /**
   * Catalog visibility. `"hidden"` keeps the pkg installable by exact name
   * (CLI `add`/`update`, registry install, update detection) but omits it
   * from the default browse/catalog surfaces — used for dev/test fixtures
   * and scaffolds (e.g. `pkg-hello`, `pkg-engine-noop`, the cursor-agent
   * scaffold). Absent ⇒ treated as `"public"`. Set by the publish pipeline's
   * curation step (`ikenga-pkgs/scripts/update-registry-index.mjs`).
   */
  visibility: z.enum(['public', 'hidden']).optional(),
});
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;

export const RegistryIndexSchema = z.object({
  $schemaVersion: z.literal(REGISTRY_SCHEMA_VERSION),
  /** ISO-8601 — last time any entry was added/updated. */
  updatedAt: z.string(),
  pkgs: z.array(RegistryEntrySchema),
});
export type RegistryIndex = z.infer<typeof RegistryIndexSchema>;

// ---------- Helpers ----------

/**
 * Canonical short-name used in detail-file paths.
 * `@ikenga/pkg-engine-claude-code` → `engine-claude-code`
 * `@ikenga/mcp-iyke`               → `mcp-iyke`
 */
export function pkgShortName(npmName: string): string {
  return npmName.replace(/^@ikenga\//, '').replace(/^pkg-/, '');
}

/** Default detail-file path for a pkg name, relative to the registry root. */
export function pkgDetailPath(npmName: string): string {
  return `pkgs/${pkgShortName(npmName)}.json`;
}
