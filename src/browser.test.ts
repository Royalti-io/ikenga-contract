import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BROWSER_PANE_ID_PATTERN,
  BROWSER_REF_PATTERN,
  BROWSER_WAIT_FOR_KINDS,
  BrowserClickInputSchema,
  BrowserEvalInputSchema,
  BrowserFillInputSchema,
  BrowserGotoInputSchema,
  BrowserListResultSchema,
  BrowserOpenInputSchema,
  BrowserOpenResultSchema,
  BrowserPaneIdSchema,
  BrowserPressKeyInputSchema,
  BrowserReadTextInputSchema,
  BrowserRefSchema,
  BrowserScreenshotInputSchema,
  BrowserSelectInputSchema,
  BrowserSessionSchema,
  BrowserSessionCreateInputSchema,
  BrowserSessionDeleteInputSchema,
  BrowserSessionListResultSchema,
  BrowserSnapshotSchema,
  BrowserWaitForInputSchema,
  BrowserWaitForResultSchema,
} from './browser.js';

// ---------- Brand patterns ----------

test('BrowserPaneId accepts b1, b42; rejects b0, b, B1, banana', () => {
  for (const ok of ['b1', 'b42', 'b9999']) {
    assert.equal(BROWSER_PANE_ID_PATTERN.test(ok), true, `expected ${ok} ok`);
    assert.equal(BrowserPaneIdSchema.safeParse(ok).success, true);
  }
  for (const bad of ['b0', 'b', 'B1', 'banana', 'b01', 'b 1', '']) {
    assert.equal(BROWSER_PANE_ID_PATTERN.test(bad), false, `expected ${bad} bad`);
    assert.equal(BrowserPaneIdSchema.safeParse(bad).success, false);
  }
});

test('BrowserRef accepts e0, e12; rejects E0, e, eX', () => {
  for (const ok of ['e0', 'e1', 'e123']) {
    assert.equal(BROWSER_REF_PATTERN.test(ok), true);
    assert.equal(BrowserRefSchema.safeParse(ok).success, true);
  }
  for (const bad of ['E0', 'e', 'eX', 'e 1', '0', '']) {
    assert.equal(BrowserRefSchema.safeParse(bad).success, false);
  }
});

// ---------- open / list / nav ----------

test('BrowserOpenInput: url required + must be URL; partition optional', () => {
  assert.equal(
    BrowserOpenInputSchema.safeParse({ url: 'https://example.com' }).success,
    true,
  );
  assert.equal(
    BrowserOpenInputSchema.safeParse({ url: 'not-a-url' }).success,
    false,
  );
  assert.equal(BrowserOpenInputSchema.safeParse({}).success, false);
  assert.equal(
    BrowserOpenInputSchema.safeParse({
      url: 'https://example.com',
      partition: 'work',
      rect: { x: 0, y: 0, w: 800, h: 600 },
    }).success,
    true,
  );
});

test('BrowserOpenInput: rect dimensions must be positive', () => {
  const bad = BrowserOpenInputSchema.safeParse({
    url: 'https://example.com',
    rect: { x: 0, y: 0, w: 0, h: 600 },
  });
  assert.equal(bad.success, false);
});

test('BrowserOpenResult round-trips', () => {
  const parsed = BrowserOpenResultSchema.parse({
    id: 'b1',
    url: 'https://example.com',
    partition: 'default',
  });
  assert.equal(parsed.id, 'b1');
  assert.equal(parsed.partition, 'default');
});

test('BrowserListResult parses an empty list', () => {
  const parsed = BrowserListResultSchema.parse({ panes: [] });
  assert.deepEqual(parsed.panes, []);
});

test('BrowserListResult parses populated panes', () => {
  const parsed = BrowserListResultSchema.parse({
    panes: [
      { id: 'b1', url: 'https://example.com', partition: 'default', focused: true },
      { id: 'b2', url: 'https://other.test', partition: 'work', focused: false },
    ],
  });
  assert.equal(parsed.panes.length, 2);
  assert.equal(parsed.panes[0]!.focused, true);
});

test('BrowserGotoInput: url must validate', () => {
  assert.equal(
    BrowserGotoInputSchema.safeParse({ id: 'b1', url: 'https://example.com/x' }).success,
    true,
  );
  assert.equal(
    BrowserGotoInputSchema.safeParse({ id: 'b1', url: 'not-a-url' }).success,
    false,
  );
});

// ---------- snapshot ----------

test('BrowserSnapshot accepts a realistic minimal payload', () => {
  const parsed = BrowserSnapshotSchema.parse({
    id: 'b1',
    url: 'https://example.com/',
    title: 'Example Domain',
    text: 'document\n  heading "Example Domain" [ref=e1]',
    nodes: [
      { ref: 'e0', role: 'document', children: ['e1'] },
      { ref: 'e1', role: 'heading', name: 'Example Domain' },
    ],
    snapshotId: 0,
  });
  assert.equal(parsed.nodes.length, 2);
  assert.equal(parsed.snapshotId, 0);
});

test('BrowserSnapshot rejects bad ref shapes inside nodes', () => {
  const bad = BrowserSnapshotSchema.safeParse({
    id: 'b1',
    url: 'https://example.com/',
    title: 'x',
    text: 'x',
    nodes: [{ ref: 'BAD', role: 'document' }],
    snapshotId: 0,
  });
  assert.equal(bad.success, false);
});

// ---------- interaction ----------

test('BrowserClickInput accepts ref-only, selector-only, text-only forms', () => {
  for (const variant of [
    { id: 'b1', ref: 'e2' },
    { id: 'b1', selector: 'button.primary' },
    { id: 'b1', text: 'Sign in' },
  ]) {
    assert.equal(BrowserClickInputSchema.safeParse(variant).success, true);
  }
});

test('BrowserFillInput requires text', () => {
  assert.equal(
    BrowserFillInputSchema.safeParse({ id: 'b1', ref: 'e3', text: 'hello' }).success,
    true,
  );
  assert.equal(
    BrowserFillInputSchema.safeParse({ id: 'b1', ref: 'e3' }).success,
    false,
  );
});

test('BrowserSelectInput requires value', () => {
  assert.equal(
    BrowserSelectInputSchema.safeParse({ id: 'b1', ref: 'e3', value: 'usd' }).success,
    true,
  );
  assert.equal(
    BrowserSelectInputSchema.safeParse({ id: 'b1', ref: 'e3' }).success,
    false,
  );
});

test('BrowserPressKeyInput requires combo', () => {
  assert.equal(
    BrowserPressKeyInputSchema.safeParse({ id: 'b1', combo: 'Enter' }).success,
    true,
  );
  assert.equal(BrowserPressKeyInputSchema.safeParse({ id: 'b1' }).success, false);
});

// ---------- wait_for ----------

test('BrowserWaitForInput enforces kind enum', () => {
  for (const kind of BROWSER_WAIT_FOR_KINDS) {
    assert.equal(
      BrowserWaitForInputSchema.safeParse({ id: 'b1', kind, value: 'x' }).success,
      true,
    );
  }
  assert.equal(
    BrowserWaitForInputSchema.safeParse({ id: 'b1', kind: 'bogus' }).success,
    false,
  );
});

test('BrowserWaitForInput clamps timeout_ms range', () => {
  assert.equal(
    BrowserWaitForInputSchema.safeParse({
      id: 'b1',
      kind: 'idle',
      timeout_ms: 50,
    }).success,
    false,
  );
  assert.equal(
    BrowserWaitForInputSchema.safeParse({
      id: 'b1',
      kind: 'idle',
      timeout_ms: 60_001,
    }).success,
    false,
  );
  assert.equal(
    BrowserWaitForInputSchema.safeParse({
      id: 'b1',
      kind: 'idle',
      timeout_ms: 5000,
    }).success,
    true,
  );
});

test('BrowserWaitForResult shape', () => {
  const parsed = BrowserWaitForResultSchema.parse({
    satisfied: true,
    elapsed_ms: 123,
  });
  assert.equal(parsed.satisfied, true);
  assert.equal(parsed.elapsed_ms, 123);
});

// ---------- misc ----------

test('BrowserReadTextInput requires both id and ref', () => {
  assert.equal(
    BrowserReadTextInputSchema.safeParse({ id: 'b1', ref: 'e1' }).success,
    true,
  );
  assert.equal(BrowserReadTextInputSchema.safeParse({ id: 'b1' }).success, false);
  assert.equal(BrowserReadTextInputSchema.safeParse({ ref: 'e1' }).success, false);
});

test('BrowserScreenshotInput accepts optional out_path', () => {
  assert.equal(BrowserScreenshotInputSchema.safeParse({ id: 'b1' }).success, true);
  assert.equal(
    BrowserScreenshotInputSchema.safeParse({ id: 'b1', out_path: '/tmp/x.png' })
      .success,
    true,
  );
});

test('BrowserEvalInput requires script string', () => {
  assert.equal(
    BrowserEvalInputSchema.safeParse({ id: 'b1', script: '1+1' }).success,
    true,
  );
  assert.equal(BrowserEvalInputSchema.safeParse({ id: 'b1' }).success, false);
});

test('BrowserSession accepts unix-ms timestamps; last_used_at is optional', () => {
  const ok = BrowserSessionSchema.safeParse({
    pkg_id: 'com.ikenga.mcp-browser',
    name: 'spotify-main',
    partition: 'spotify',
    created_at: 1_778_000_000_000,
  });
  assert.equal(ok.success, true);

  const ok2 = BrowserSessionSchema.safeParse({
    pkg_id: 'com.ikenga.mcp-browser',
    name: 'spotify-main',
    partition: 'spotify',
    created_at: 1_778_000_000_000,
    last_used_at: 1_778_000_100_000,
  });
  assert.equal(ok2.success, true);

  const ok3 = BrowserSessionSchema.safeParse({
    pkg_id: 'com.ikenga.mcp-browser',
    name: 'spotify-main',
    partition: 'spotify',
    created_at: 1_778_000_000_000,
    last_used_at: null,
  });
  assert.equal(ok3.success, true);

  const bad = BrowserSessionSchema.safeParse({
    pkg_id: 'com.ikenga.mcp-browser',
    name: 'spotify-main',
    partition: 'spotify',
    created_at: 'yesterday',
  });
  assert.equal(bad.success, false);
});

test('BrowserSessionCreateInput: name required, partition optional', () => {
  assert.equal(
    BrowserSessionCreateInputSchema.safeParse({ name: 'spotify' }).success,
    true,
  );
  assert.equal(
    BrowserSessionCreateInputSchema.safeParse({
      name: 'spotify',
      partition: 'spotify-prod',
    }).success,
    true,
  );
  assert.equal(BrowserSessionCreateInputSchema.safeParse({}).success, false);
  assert.equal(
    BrowserSessionCreateInputSchema.safeParse({ name: '' }).success,
    false,
  );
  assert.equal(
    BrowserSessionDeleteInputSchema.safeParse({ name: 'spotify' }).success,
    true,
  );
  assert.equal(
    BrowserSessionListResultSchema.safeParse({ sessions: [] }).success,
    true,
  );
});

test('BrowserOpenInput rejects setting both partition and session', () => {
  assert.equal(
    BrowserOpenInputSchema.safeParse({
      url: 'https://example.com',
      partition: 'p1',
      session: 's1',
    }).success,
    false,
  );
  assert.equal(
    BrowserOpenInputSchema.safeParse({
      url: 'https://example.com',
      session: 's1',
    }).success,
    true,
  );
});
