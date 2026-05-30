import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ManifestSchema,
  RequiresEntrySchema,
  RequireSourceSchema,
} from './manifest.js';

// ─── WP-11 — `requires` field (ADR-015 §3) ──────────────────────────────────

const BASE = {
  id: 'com.ikenga.studio',
  name: 'Studio',
  version: '0.1.0',
  ikenga_api: '1',
};

test('RequiresEntry: full shape parses', () => {
  const e = RequiresEntrySchema.parse({
    kind: 'skill',
    name: '@ikenga/studio-beat-detect',
    source: 'npx',
    ref: 'v1.2.0',
  });
  assert.equal(e.kind, 'skill');
  assert.equal(e.source, 'npx');
  assert.equal(e.ref, 'v1.2.0');
});

test('RequiresEntry: source + ref optional', () => {
  const e = RequiresEntrySchema.parse({ kind: 'skill', name: 'skill-core' });
  assert.equal(e.source, undefined);
  assert.equal(e.ref, undefined);
});

test('RequiresEntry: rejects unknown field (.strict mirrors Rust deny_unknown_fields)', () => {
  assert.throws(() =>
    RequiresEntrySchema.parse({ kind: 'skill', name: 'skill-core', bogus: true }),
  );
});

test('RequiresEntry: rejects an out-of-set source', () => {
  assert.throws(() =>
    RequiresEntrySchema.parse({ kind: 'skill', name: 'x', source: 'ftp' }),
  );
});

test('RequireSource: only git|npx|catalog|local', () => {
  for (const s of ['git', 'npx', 'catalog', 'local']) {
    assert.equal(RequireSourceSchema.parse(s), s);
  }
  assert.throws(() => RequireSourceSchema.parse('http'));
});

test('Manifest: requires parses and round-trips', () => {
  const m = ManifestSchema.parse({
    ...BASE,
    requires: [
      { kind: 'skill', name: '@ikenga/studio-archetypes', source: 'npx' },
      { kind: 'skill', name: 'skill-core', source: 'git', ref: 'v1.0.0' },
      { kind: 'skill', name: '@ikenga/studio-doctor' },
    ],
  });
  assert.equal(m.requires.length, 3);
  assert.equal(m.requires[0].name, '@ikenga/studio-archetypes');
  assert.equal(m.requires[2].source, undefined);
});

test('Manifest: requires defaults to [] when absent (pre-Phase-4 manifest)', () => {
  const m = ManifestSchema.parse({ ...BASE, skills: 'skills' });
  assert.deepEqual(m.requires, []);
});
