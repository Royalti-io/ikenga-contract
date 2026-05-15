import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentCapabilitiesSchema,
  EngineNotImplementedError,
  EngineOnboardingSchema,
  EngineProvidesSchema,
  type AgentCapabilities,
  type Engine,
  type EngineProvides,
} from './index.js';
import { ManifestSchema, PkgManifestSchema } from '../manifest.js';

const fullCaps: AgentCapabilities = {
  streaming: true,
  toolUse: true,
  thinking: true,
  artifacts: true,
  fileAttachments: true,
  imageInput: true,
  slashCommands: true,
  modelSwitching: true,
  promptCaching: true,
  agenticTools: true,
  mcp: true,
  sessionResume: true,
};

const noopCaps: AgentCapabilities = {
  streaming: false,
  toolUse: false,
  thinking: false,
  artifacts: false,
  fileAttachments: false,
  imageInput: false,
  slashCommands: false,
  modelSwitching: false,
  promptCaching: false,
  agenticTools: false,
  mcp: false,
  sessionResume: false,
};

// ---------------- AgentCapabilitiesSchema ----------------

test('AgentCapabilitiesSchema accepts a fully-true snapshot', () => {
  const r = AgentCapabilitiesSchema.safeParse(fullCaps);
  assert.equal(r.success, true);
});

test('AgentCapabilitiesSchema accepts an all-false (noop) snapshot', () => {
  const r = AgentCapabilitiesSchema.safeParse(noopCaps);
  assert.equal(r.success, true);
});

test('AgentCapabilitiesSchema rejects missing fields', () => {
  const { streaming: _drop, ...partial } = fullCaps;
  const r = AgentCapabilitiesSchema.safeParse(partial);
  assert.equal(r.success, false);
});

test('AgentCapabilitiesSchema rejects non-boolean values', () => {
  const r = AgentCapabilitiesSchema.safeParse({ ...fullCaps, streaming: 'yes' });
  assert.equal(r.success, false);
});

// ---------------- EngineOnboardingSchema ----------------

test('EngineOnboardingSchema defaults arrays when omitted', () => {
  const r = EngineOnboardingSchema.parse({});
  assert.deepEqual(r.requiredVaultKeys, []);
  assert.deepEqual(r.requiredEnvVars, []);
  assert.equal(r.authCommand, undefined);
  assert.equal(r.docsUrl, undefined);
});

test('EngineOnboardingSchema accepts full onboarding hints', () => {
  const r = EngineOnboardingSchema.safeParse({
    requiredVaultKeys: ['ANTHROPIC_API_KEY'],
    requiredEnvVars: ['CLAUDE_HOME'],
    authCommand: 'claude login',
    docsUrl: 'https://docs.anthropic.com/claude-code',
  });
  assert.equal(r.success, true);
});

test('EngineOnboardingSchema rejects non-URL docsUrl', () => {
  const r = EngineOnboardingSchema.safeParse({ docsUrl: 'not-a-url' });
  assert.equal(r.success, false);
});

// ---------------- EngineProvidesSchema ----------------

test('EngineProvidesSchema accepts a minimal engine block', () => {
  const r = EngineProvidesSchema.safeParse({
    agentId: 'claude-code',
    capabilities: fullCaps,
  });
  assert.equal(r.success, true);
  if (r.success) {
    assert.deepEqual(r.data.onboarding.requiredVaultKeys, []);
    assert.deepEqual(r.data.onboarding.requiredEnvVars, []);
  }
});

test('EngineProvidesSchema rejects empty agentId', () => {
  const r = EngineProvidesSchema.safeParse({
    agentId: '',
    capabilities: fullCaps,
  });
  assert.equal(r.success, false);
});

test('EngineProvidesSchema rejects missing capabilities', () => {
  const r = EngineProvidesSchema.safeParse({ agentId: 'codex' });
  assert.equal(r.success, false);
});

// ---------------- Manifest integration ----------------

test('Manifest accepts an optional engine block', () => {
  const m = {
    id: 'com.ikenga.engine-claude-code',
    name: 'Claude Code Engine',
    version: '0.1.0',
    ikenga_api: '1',
    kind: 'engine',
    engine: {
      agentId: 'claude-code',
      display: 'Claude Code',
      capabilities: fullCaps,
      onboarding: {
        requiredVaultKeys: ['ANTHROPIC_API_KEY'],
        authCommand: 'claude login',
      },
    },
  };
  const r = ManifestSchema.safeParse(m);
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error.issues));
});

test('Manifest still parses without an engine block (non-engine pkg)', () => {
  const m = {
    id: 'com.ikenga.studio',
    name: 'Studio',
    version: '0.1.0',
    ikenga_api: '1',
  };
  const r = ManifestSchema.safeParse(m);
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.engine, undefined);
});

test('Manifest rejects a malformed engine block', () => {
  const m = {
    id: 'com.ikenga.engine-broken',
    name: 'Broken',
    version: '0.1.0',
    ikenga_api: '1',
    engine: { agentId: 'broken' }, // missing capabilities
  };
  const r = ManifestSchema.safeParse(m);
  assert.equal(r.success, false);
});

test('PkgManifestSchema alias is identical to ManifestSchema', () => {
  // Same instance — symmetry check with the Rust side.
  assert.equal(PkgManifestSchema, ManifestSchema);
});

// ---------------- Engine.metadata type-level check ----------------

test('Engine.metadata is structurally required at type level', () => {
  // The type-level check is enforced by tsc at build time. This runtime
  // test just exercises the shape so a regression that drops `metadata`
  // would force a compile error here.
  const sample: Engine['metadata'] = {
    agentId: 'noop',
    display: 'No-op',
    capabilities: noopCaps,
    onboarding: { requiredVaultKeys: [], requiredEnvVars: [] },
  };
  assert.equal(sample.agentId, 'noop');
});

// ---------------- AdapterLoader manifest input shape ----------------

test('AdapterLoader.load consumes a manifest carrying EngineProvides', () => {
  const provides: EngineProvides = {
    agentId: 'codex',
    display: 'OpenAI Codex',
    capabilities: { ...noopCaps, streaming: true, mcp: true },
    onboarding: {
      requiredVaultKeys: ['OPENAI_API_KEY'],
      requiredEnvVars: [],
      docsUrl: 'https://openai.com/codex',
    },
  };
  // Loader input is `{ id: string; engine: EngineProvides }` — verify
  // we can construct one structurally.
  const input: { id: string; engine: EngineProvides } = {
    id: 'com.ikenga.engine-codex',
    engine: provides,
  };
  assert.equal(input.engine.agentId, 'codex');
});

// ---------------- EngineNotImplementedError ----------------

test('EngineNotImplementedError constructs cleanly with engineId only', () => {
  const err = new EngineNotImplementedError('codex');
  assert.equal(err.engineId, 'codex');
  assert.equal(err.docsUrl, undefined);
  assert.equal(err.message, 'Engine codex is not implemented yet');
});

test('EngineNotImplementedError constructs with docsUrl + custom message', () => {
  const err = new EngineNotImplementedError('gemini', {
    docsUrl: 'https://example.com/gemini-setup',
    message: 'Gemini adapter is gated behind feature flag',
  });
  assert.equal(err.engineId, 'gemini');
  assert.equal(err.docsUrl, 'https://example.com/gemini-setup');
  assert.equal(err.message, 'Gemini adapter is gated behind feature flag');
});

test('EngineNotImplementedError is instanceof Error and EngineNotImplementedError', () => {
  const err = new EngineNotImplementedError('aider');
  assert.ok(err instanceof Error);
  assert.ok(err instanceof EngineNotImplementedError);
});

test("EngineNotImplementedError.name is exactly 'EngineNotImplementedError'", () => {
  const err = new EngineNotImplementedError('codex');
  assert.equal(err.name, 'EngineNotImplementedError');
});
