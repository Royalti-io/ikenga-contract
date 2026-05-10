// Ikenga artifact manifest schema (v0.1).
//
// The artifact format is the small, agent-authorable single-file (or folder)
// HTML doc that renders standalone in any browser AND lights up with live
// data inside the Ikenga shell. This Zod schema is the source of truth for
// the manifest block embedded in `<script type="application/json"
// id="ikenga-manifest">…</script>` (single-file mode) or in
// `manifest.json` (folder mode).
//
// JSON Schema is generated from this file via `pnpm generate:schemas`
// into `schemas/artifact/v0.json` and published at:
//   https://royalti-io.github.io/ikenga-contract/schemas/artifact/v0.json
//
// NOTE: this is **unrelated** to the pkg manifest in `./manifest.ts`. They
// describe different things (pkgs are Tauri-side mini-apps; artifacts are
// portable HTML docs). Don't conflate them.

import { z } from 'zod';

// ---------- Refresh modes ----------

export const RefreshSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('manual') }),
  z.object({
    mode: z.literal('interval'),
    /** Duration string: `<number><unit>` where unit ∈ s|m|h|d. e.g. "30s", "15m", "1h", "1d". */
    every: z.string().regex(/^\d+\s*(s|m|h|d)$/),
    /** When true, also refresh whenever the artifact's pane regains focus. */
    onFocus: z.boolean().optional(),
  }),
  /** File / realtime sources only — bridge subscribes via fs_watch or equivalent. */
  z.object({ mode: z.literal('watch') }),
]);

// ---------- Data sources ----------

const SourceSupabase = z.object({
  type: z.literal('supabase'),
  table: z.string(),
  select: z.string().optional(),
  /** PostgREST-style filters: `[column, operator, value][]`. */
  filter: z.array(z.tuple([z.string(), z.string(), z.unknown()])).optional(),
  refresh: RefreshSchema,
});

const SourceSql = z.object({
  type: z.literal('sql'),
  /** Logical DB name (e.g. `ikenga.local`). Resolved by the host. */
  db: z.string(),
  query: z.string(),
  params: z.array(z.unknown()).optional(),
  refresh: RefreshSchema,
});

const SourceFetch = z.object({
  type: z.literal('fetch'),
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  headers: z.record(z.string()).optional(),
  refresh: RefreshSchema,
});

const SourceMcp = z.object({
  type: z.literal('mcp'),
  server: z.string(),
  tool: z.string(),
  args: z.record(z.unknown()).optional(),
  refresh: RefreshSchema,
});

const SourceFile = z.object({
  type: z.literal('file'),
  path: z.string(),
  refresh: RefreshSchema,
});

export const DataSourceSchema = z.discriminatedUnion('type', [
  SourceSupabase,
  SourceSql,
  SourceFetch,
  SourceMcp,
  SourceFile,
]);

// ---------- Fallback ----------

export const FallbackSchema = z
  .object({
    mode: z.literal('mock'),
    /** Single-file mode: id of the inline `<script type="application/json">` tag carrying mock data. */
    dataTag: z.string().optional(),
    /** Folder mode: relative path to a JSON file with mock data. */
    data: z.string().optional(),
    banner: z.string().optional(),
  })
  .refine((v) => !!v.dataTag || !!v.data, {
    message: "fallback must specify either 'dataTag' (single-file) or 'data' (folder mode)",
  });

// ---------- Misc top-level blocks ----------

export const PinSchema = z.object({
  suggested: z.boolean().default(false),
  /** Free-form section name. Host fuzzy-matches against existing sections at pin time. */
  section: z.string().optional(),
  label: z.string().optional(),
  icon: z.object({ lucide: z.string() }).partial().optional(),
});

export const NotesSchema = z.object({
  enabled: z.boolean().default(true),
});

export const RequiresSchema = z.object({
  ikenga: z.string().optional(),
  bridge: z.string().optional(),
});

export const IconSchema = z.object({
  lucide: z.string().optional(),
}).partial();

/**
 * Escape-hatch capabilities block. Default behaviour is to auto-derive
 * capabilities from `dataSources`, so most artifacts omit this entirely.
 * Use only when narrowing below the derived set, expressing capabilities
 * sources can't (e.g. arbitrary FS reads), or driving raw `bridge.fetch` /
 * `bridge.mcp` calls that aren't bound to a declared source.
 */
export const CapabilitiesSchema = z.object({
  network: z.object({ allow: z.array(z.string()) }).optional(),
  supabase: z
    .object({
      project: z.string().optional(),
      tables: z.array(z.string()).optional(),
      rls: z.enum(['user', 'service']).optional(),
    })
    .optional(),
  sqlite: z
    .object({
      db: z.string(),
      queries: z.array(z.string()).optional(),
    })
    .optional(),
  mcp: z
    .array(
      z.object({
        server: z.string(),
        tools: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  fs: z
    .object({
      read: z.array(z.string()).optional(),
      write: z.array(z.string()).optional(),
    })
    .optional(),
});

// ---------- Top-level manifest ----------

export const ArtifactManifestSchema = z.object({
  $schema: z.string().url().optional(),
  format: z.literal('ikenga-artifact'),
  /** Major.minor of the artifact format spec, e.g. "0.1". */
  formatVersion: z.string(),

  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, { message: 'id must be kebab-case' }),
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),

  /** Folder mode only — relative path to the entry HTML. Single-file artifacts omit this. */
  entry: z.string().optional(),
  icon: IconSchema.optional(),

  dataSources: z.record(DataSourceSchema),
  fallback: FallbackSchema,

  pin: PinSchema.optional(),
  notes: NotesSchema.optional(),
  requires: RequiresSchema.optional(),

  capabilities: CapabilitiesSchema.optional(),
});

export type ArtifactManifest = z.infer<typeof ArtifactManifestSchema>;
export type DataSource = z.infer<typeof DataSourceSchema>;
export type Refresh = z.infer<typeof RefreshSchema>;
export type Fallback = z.infer<typeof FallbackSchema>;
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

/** Format-spec version this package's schema targets. Bumped together with the JSON Schema file. */
export const ARTIFACT_FORMAT_VERSION = '0.1' as const;
