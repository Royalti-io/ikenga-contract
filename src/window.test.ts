import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	WINDOW_CONTRACT_VERSION,
	WindowDescriptorSchema,
	WindowEventEnvelopeSchema,
} from './window.js';

// Canonical wire fixtures — the Rust round-trip test
// (src-tauri/src/window/descriptor.rs + events.rs) asserts the SAME JSON.
// If these drift, the lockstep contract is broken.

const DESCRIPTOR_FIXTURE = {
	label: 'detached-1',
	kind: 'single-surface',
	surface_set: ['chat'],
	project_id: null,
	layout_key: 'detached-1',
};

const ENVELOPE_FIXTURE = {
	v: 1,
	topic: 'window://opened',
	source_label: 'core',
	target: { kind: 'window', label: 'detached-1' },
	payload: { label: 'detached-1' },
};

test('WindowDescriptor parses the canonical fixture and round-trips', () => {
	const parsed = WindowDescriptorSchema.parse(DESCRIPTOR_FIXTURE);
	assert.deepEqual(parsed, DESCRIPTOR_FIXTURE);
	// re-parse the serialized form (round-trip)
	assert.deepEqual(
		WindowDescriptorSchema.parse(JSON.parse(JSON.stringify(parsed))),
		DESCRIPTOR_FIXTURE,
	);
});

test('WindowDescriptor rejects unknown keys (deny_unknown_fields parity)', () => {
	assert.throws(() =>
		WindowDescriptorSchema.parse({ ...DESCRIPTOR_FIXTURE, rogue: true }),
	);
});

test('WindowDescriptor applies defaults for surface_set/project_id', () => {
	const parsed = WindowDescriptorSchema.parse({
		label: 'main',
		kind: 'primary',
		layout_key: 'main',
	});
	assert.deepEqual(parsed.surface_set, []);
	assert.equal(parsed.project_id, null);
});

test('WindowEventEnvelope parses the canonical fixture and round-trips', () => {
	const parsed = WindowEventEnvelopeSchema.parse(ENVELOPE_FIXTURE);
	assert.equal(parsed.v, WINDOW_CONTRACT_VERSION);
	assert.deepEqual(
		WindowEventEnvelopeSchema.parse(JSON.parse(JSON.stringify(parsed))),
		ENVELOPE_FIXTURE,
	);
});

test('WindowEventTarget broadcast variant parses', () => {
	const parsed = WindowEventEnvelopeSchema.parse({
		...ENVELOPE_FIXTURE,
		target: { kind: 'broadcast' },
	});
	assert.equal(parsed.target.kind, 'broadcast');
});
