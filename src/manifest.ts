import { z } from 'zod';

// ---------- Pkg type ----------

export const PkgTypeSchema = z.enum(['ui', 'mcp', 'cli', 'engine']);
export type PkgType = z.infer<typeof PkgTypeSchema>;

// ---------- Isolation policy (UI pkgs only) ----------
//
// Pkgs *request* an isolation; the kernel decides at install time based on
// publisher trust + pkg type. First-party signed pkgs may be granted
// "mounted" for performance; everyone else is "iframe".

export const IsolationSchema = z.enum(['iframe', 'mounted']);
export type Isolation = z.infer<typeof IsolationSchema>;

// ---------- Update channel ----------

export const UpdateChannelSchema = z.enum(['stable', 'beta', 'dev']);
export type UpdateChannel = z.infer<typeof UpdateChannelSchema>;

// ---------- Author / publisher ----------

export const AuthorSchema = z.object({
  name: z.string(),
  key: z.string().regex(/^[a-z0-9-]+$/),
  url: z.string().url().optional(),
});

// ---------- Sidecar binary spec ----------

export const SidecarSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  path: z.string(),
  platforms: z.array(z.enum(['darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64', 'win32-x64'])).optional(),
});
export type Sidecar = z.infer<typeof SidecarSchema>;

// ---------- MCP server spec ----------

export const PkgMcpServerSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
});
export type PkgMcpServer = z.infer<typeof PkgMcpServerSchema>;

// ---------- Manifest ----------

export const ManifestSchema = z.object({
  // Identity
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'lowercase alphanum with dashes'),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/, 'semver'),
  type: PkgTypeSchema,
  author: AuthorSchema.optional(),

  // Compatibility
  shell_min: z.string().regex(/^\d+\.\d+\.\d+$/),
  contract: z.string().default('^1'),

  // UI surface (UI pkgs only)
  isolation: IsolationSchema.optional(),
  entry: z.string().optional(),
  display_name: z.string().optional(),
  icon: z.string().optional(),

  // Engine adapter (engine pkgs only)
  engine_module: z.string().optional(),

  // Capabilities + integrations
  scopes: z.array(z.string()).default([]),
  sidecars: z.array(SidecarSchema).default([]),
  mcp_servers: z.array(z.union([z.string(), PkgMcpServerSchema])).default([]),

  // Distribution
  update_channel: UpdateChannelSchema.default('stable'),
  sources: z.array(z.string()).default([]),

  // Optional pkg-private migrations dir (run on install/update)
  migrations: z.string().optional(),
})
  .refine(
    (m) => m.type !== 'ui' || !!m.entry,
    { message: 'UI pkgs must declare an "entry"', path: ['entry'] }
  )
  .refine(
    (m) => m.type !== 'engine' || !!m.engine_module,
    { message: 'Engine pkgs must declare an "engine_module"', path: ['engine_module'] }
  )
  .refine(
    (m) => m.type !== 'mcp' || m.mcp_servers.length > 0,
    { message: 'MCP pkgs must declare at least one "mcp_servers" entry', path: ['mcp_servers'] }
  );

export type Manifest = z.infer<typeof ManifestSchema>;

// ---------- Lock entry (kernel-side per-install record) ----------

export const InstalledPkgSchema = z.object({
  manifest: ManifestSchema,
  installed_at: z.string().datetime(),
  source: z.string(),
  signature: z.string().optional(),
  pinned_version: z.string().optional(),
  resolved_isolation: IsolationSchema.optional(),
});
export type InstalledPkg = z.infer<typeof InstalledPkgSchema>;
