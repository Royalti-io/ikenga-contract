import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OperatorIdentitySchema } from './host-context.js';

test('OperatorIdentity: id-only parses, displayName optional', () => {
  const o = OperatorIdentitySchema.parse({ id: 'nedjamez' });
  assert.equal(o.id, 'nedjamez');
  assert.equal(o.displayName, undefined);
});

test('OperatorIdentity: full shape parses', () => {
  const o = OperatorIdentitySchema.parse({ id: 'nedjamez', displayName: 'Chinedum' });
  assert.equal(o.id, 'nedjamez');
  assert.equal(o.displayName, 'Chinedum');
});

test('OperatorIdentity: rejects unknown field (.strict)', () => {
  assert.throws(() => OperatorIdentitySchema.parse({ id: 'nedjamez', bogus: true }));
});

test('OperatorIdentity: rejects missing id', () => {
  assert.throws(() => OperatorIdentitySchema.parse({ displayName: 'Chinedum' }));
});
