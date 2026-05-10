#!/usr/bin/env node
// Generates JSON Schema files from Zod sources of truth.
// Run via: pnpm generate:schemas

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ArtifactManifestSchema } from '../dist/artifact.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'schemas', 'artifact', 'v0.json');

await mkdir(path.dirname(out), { recursive: true });

const json = zodToJsonSchema(ArtifactManifestSchema, {
  name: 'IkengaArtifactManifest',
  $refStrategy: 'none',
});
// Stamp the canonical published URL so consumers can copy from the file.
json.$id = 'https://royalti-io.github.io/ikenga-contract/schemas/artifact/v0.json';

await writeFile(out, JSON.stringify(json, null, 2) + '\n', 'utf8');
console.log('Wrote', path.relative(root, out));
