import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ArtifactManifestSchema } from './artifact.js';

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'artifact-fixtures',
);

test('all fixtures parse against the manifest schema', async () => {
  const files = (await readdir(fixturesDir)).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 3, `expected >=3 fixtures, got ${files.length}`);
  for (const f of files) {
    const json = JSON.parse(await readFile(path.join(fixturesDir, f), 'utf8'));
    const result = ArtifactManifestSchema.safeParse(json);
    assert.ok(
      result.success,
      `${f} failed to parse: ${
        result.success ? '' : JSON.stringify(result.error.issues, null, 2)
      }`,
    );
  }
});

test('rejects manifest with missing required fields', () => {
  const result = ArtifactManifestSchema.safeParse({ format: 'ikenga-artifact' });
  assert.equal(result.success, false);
});

test('rejects non-kebab-case id', () => {
  const result = ArtifactManifestSchema.safeParse({
    format: 'ikenga-artifact',
    formatVersion: '0.1',
    id: 'NotKebab',
    name: 'X',
    version: '0.1.0',
    dataSources: {},
    fallback: { mode: 'mock', dataTag: 'x' },
  });
  assert.equal(result.success, false);
});
