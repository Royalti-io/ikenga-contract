import { z } from 'zod';

export const PkgTypeSchema = z.enum(['ui', 'mcp', 'cli', 'engine']);
export type PkgType = z.infer<typeof PkgTypeSchema>;

export const IsolationSchema = z.enum(['iframe', 'mounted']);
export type Isolation = z.infer<typeof IsolationSchema>;

export const ManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.string(),
  type: PkgTypeSchema,
  isolation: IsolationSchema.optional(),
  entry: z.string().optional(),
  sidecars: z.array(z.string()).default([]),
  mcp_servers: z.array(z.string()).default([]),
  scopes: z.array(z.string()).default([]),
  shell_min: z.string(),
  contract: z.string().default('^1'),
  update_channel: z.enum(['stable', 'beta', 'dev']).default('stable'),
  sources: z.array(z.string()).default([]),
});

export type Manifest = z.infer<typeof ManifestSchema>;
