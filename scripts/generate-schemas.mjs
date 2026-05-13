#!/usr/bin/env node
// Generates JSON Schema files from Zod sources of truth.
// Run via: pnpm generate:schemas

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ArtifactManifestSchema } from '../dist/artifact.js';
import { RegistryIndexSchema, PkgDetailSchema } from '../dist/registry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function emit(relPath, schema, name, idUrl) {
  const out = path.join(root, 'schemas', relPath);
  await mkdir(path.dirname(out), { recursive: true });
  const json = zodToJsonSchema(schema, { name, $refStrategy: 'none' });
  json.$id = idUrl;
  await writeFile(out, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log('Wrote', path.relative(root, out));
}

await emit(
  'artifact/v0.json',
  ArtifactManifestSchema,
  'IkengaArtifactManifest',
  'https://royalti-io.github.io/ikenga-contract/schemas/artifact/v0.json',
);

await emit(
  'registry/index-v1.json',
  RegistryIndexSchema,
  'IkengaRegistryIndex',
  'https://royalti-io.github.io/ikenga-contract/schemas/registry/index-v1.json',
);

await emit(
  'registry/pkg-detail-v1.json',
  PkgDetailSchema,
  'IkengaRegistryPkgDetail',
  'https://royalti-io.github.io/ikenga-contract/schemas/registry/pkg-detail-v1.json',
);
