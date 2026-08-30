import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HttpCapabilitySchema,
  IKENGA_API_VERSION,
  InvokeCapabilitySchema,
  ManifestSchema,
  NamedSecretSchema,
  RequiresEntrySchema,
  RequireSourceSchema,
  SecretsCapabilitySchema,
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

test('RequiresEntry: kind bundle is accepted (WP-18 G-BUNDLE)', () => {
  // WP-18 locked design decision 4: `RequiresEntrySchema.kind` is `z.string()`
  // (a free string, not a closed enum), so a `requires` entry may reference a
  // bundle — `{kind:"bundle", name}` parses and carries the kind through. This
  // is the contract-side half of the G-BUNDLE "requires kind:bundle parses" DoD.
  const e = RequiresEntrySchema.parse({ kind: 'bundle', name: 'studio-archetypes' });
  assert.equal(e.kind, 'bundle');
  assert.equal(e.name, 'studio-archetypes');
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
  const m = ManifestSchema.parse({ ...BASE });
  assert.deepEqual(m.requires, []);
});

// ─── WP-01 — trusted-cap tier (ADR-017): http / secrets / invoke + signature ─

test('IKENGA_API_VERSION is 4 (WP-01 Manifest v4)', () => {
  assert.equal(IKENGA_API_VERSION, 4);
});

test('HttpCapability: auth_header defaults to Authorization; auth_secret optional', () => {
  const h = HttpCapabilitySchema.parse({});
  assert.equal(h.auth_header, 'Authorization');
  assert.equal(h.auth_secret, undefined);
});

test('HttpCapability: .strict rejects unknown field (mirrors Rust deny_unknown_fields)', () => {
  assert.throws(() => HttpCapabilitySchema.parse({ bogus: true }));
});

test('NamedSecret: full shape parses; required defaults false', () => {
  const s = NamedSecretSchema.parse({ name: 'twenty', vault_key: 'TWENTY_API_KEY' });
  assert.equal(s.required, false);
  const r = NamedSecretSchema.parse({
    name: 'k',
    vault_key: 'K',
    required: true,
    format: 'bearer',
  });
  assert.equal(r.required, true);
  assert.equal(r.format, 'bearer');
});

test('NamedSecret: .strict rejects unknown field', () => {
  assert.throws(() =>
    NamedSecretSchema.parse({ name: 'k', vault_key: 'K', bogus: true }),
  );
});

test('SecretsCapability: declarations default to []', () => {
  const s = SecretsCapabilitySchema.parse({});
  assert.deepEqual(s.declarations, []);
});

test('InvokeCapability: empty object parses; commands defaults to [] (presence gate)', () => {
  assert.deepEqual(InvokeCapabilitySchema.parse({}), { commands: [] });
});

test('InvokeCapability (D-06): commands allowlist parses + survives', () => {
  const i = InvokeCapabilitySchema.parse({ commands: ['pa_actions_commit', 'pa_actions_reject'] });
  assert.deepEqual(i.commands, ['pa_actions_commit', 'pa_actions_reject']);
});

test('InvokeCapability: .strict rejects unknown field (mirrors Rust deny_unknown_fields)', () => {
  assert.throws(() => InvokeCapabilitySchema.parse({ commands: [], bogus: true }));
});

test('Manifest: fully-populated trusted-cap manifest round-trips (G-MANIFEST DoD)', () => {
  // The contract-side half of the round-trip parse-fixture: a manifest carrying
  // ALL FOUR new fields — top-level `signature`, `capabilities.http` (with
  // auth_secret + custom header), `capabilities.secrets` (with a declaration),
  // and the presence-gate `capabilities.invoke` — parses and the values survive.
  const m = ManifestSchema.parse({
    ...BASE,
    ikenga_api: '3',
    signature: 'ed25519:Zm9vYmFyYmF6',
    permissions: { net: ['https://api.twenty.com/'], 'vault.keys': ['TWENTY_API_KEY'] },
    capabilities: {
      http: { auth_secret: 'twenty', auth_header: 'X-Api-Key' },
      secrets: {
        declarations: [
          { name: 'twenty', vault_key: 'TWENTY_API_KEY', required: true, format: 'bearer' },
        ],
      },
      invoke: { commands: ['pa_actions_commit'] },
    },
  });
  assert.equal(m.signature, 'ed25519:Zm9vYmFyYmF6');
  assert.equal(m.capabilities?.http?.auth_secret, 'twenty');
  assert.equal(m.capabilities?.http?.auth_header, 'X-Api-Key');
  assert.equal(m.capabilities?.secrets?.declarations.length, 1);
  assert.equal(m.capabilities?.secrets?.declarations[0].vault_key, 'TWENTY_API_KEY');
  assert.equal(m.capabilities?.secrets?.declarations[0].required, true);
  assert.ok(m.capabilities?.invoke !== undefined);
  // D-06: the invoke command allowlist survives the round-trip.
  assert.deepEqual(m.capabilities?.invoke?.commands, ['pa_actions_commit']);
});

test('Manifest: api=1 manifest without new fields parses (back-compat)', () => {
  const m = ManifestSchema.parse({ ...BASE });
  assert.equal(m.signature, undefined);
  assert.equal(m.capabilities, undefined);
});

test('Manifest: webview capability and partition route parses', () => {
  const m = ManifestSchema.parse({
    ...BASE,
    ui: {
      routes: [
        { path: '/test', kind: 'webview', source: 'https://example.com', partition: 'test-part' }
      ]
    },
    capabilities: {
      webview: {
        child_webviews: true,
        allowed_origins: ['https://example.com']
      }
    }
  });
  assert.equal(m.ui.routes[0].kind, 'webview');
  assert.equal(m.ui.routes[0].partition, 'test-part');
  assert.deepEqual(m.capabilities?.webview?.allowed_origins, ['https://example.com']);
});

test('Manifest: retired bundling fields are no longer part of the type (WP-17)', () => {
  // ADR-015 decision 4: `skills`/`commands`/`agents` were hard-retired from the
  // schema (lockstep with the Rust `deny_unknown_fields` Manifest, which REJECTS
  // them — the authoritative loader). ManifestSchema is non-strict, so a stray
  // legacy key is stripped rather than rejected here; assert it does not survive
  // onto the parsed object.
  const m = ManifestSchema.parse({ ...BASE, skills: 'skills', commands: 'commands' }) as Record<
    string,
    unknown
  >;
  assert.equal(m.skills, undefined);
  assert.equal(m.commands, undefined);
});

test('Manifest: allowed_origins absent stays absent (not coerced to [])', () => {
  // G-28 — absent must be distinguishable from an explicit deny-all lockdown.
  // A `.default([])` here would silently turn every pre-v4 manifest into one.
  const m = ManifestSchema.parse({
    id: 'com.test.webview',
    name: 'T',
    version: '1.0.0',
    ikenga_api: '4',
    author: { name: 'T' },
    ui: { routes: [{ path: '/', kind: 'webview', source: 'https://example.com' }] },
    capabilities: { webview: { child_webviews: true, partitions: ['default'] } },
  });
  assert.equal(m.capabilities?.webview?.allowed_origins, undefined);
});

test('Manifest: allowed_origins empty array survives as an explicit lockdown', () => {
  const m = ManifestSchema.parse({
    id: 'com.test.webview',
    name: 'T',
    version: '1.0.0',
    ikenga_api: '4',
    author: { name: 'T' },
    ui: { routes: [{ path: '/', kind: 'webview', source: 'https://example.com' }] },
    capabilities: { webview: { child_webviews: true, partitions: ['default'], allowed_origins: [] } },
  });
  assert.deepEqual(m.capabilities?.webview?.allowed_origins, []);
});
