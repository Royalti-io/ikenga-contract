import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  codexTomlToMd,
  mdToCodexToml,
  mdToGeminiCommandToml,
} from './subagent-transcoder.js';

// Tiny TOML parser shared between tests — independent of the transcoder's
// internal parser so round-trip checks have something to compare against.
// Only handles the keys ADR §5 lists, which is what the transcoder emits.
function parseSimpleToml(toml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = toml.split('\n');
  let i = 0;
  let table: Record<string, unknown> = out;
  while (i < lines.length) {
    const raw = lines[i] ?? '';
    const t = raw.trim();
    if (t === '' || t.startsWith('#')) { i++; continue; }
    const tableMatch = /^\[([^\]]+)\]$/.exec(t);
    if (tableMatch) {
      const name = (tableMatch[1] ?? '').trim();
      const sub: Record<string, unknown> = {};
      out[name] = sub;
      table = sub;
      i++;
      continue;
    }
    const eq = raw.indexOf('=');
    const key = raw.slice(0, eq).trim();
    const restRaw = raw.slice(eq + 1);
    const rest = restRaw.trim();
    if (rest.startsWith('"""')) {
      const afterOpen = rest.slice(3);
      if (afterOpen.endsWith('"""') && afterOpen.length >= 3) {
        table[key] = unescape(afterOpen.slice(0, -3));
        i++;
        continue;
      }
      const buf: string[] = [];
      if (afterOpen !== '') buf.push(afterOpen);
      i++;
      while (i < lines.length) {
        const ln = lines[i] ?? '';
        if (ln.endsWith('"""')) {
          const trailing = ln.slice(0, -3);
          if (trailing === '' && buf.length > 0) {
            table[key] = unescape(buf.join('\n') + '\n');
          } else {
            buf.push(trailing);
            table[key] = unescape(buf.join('\n'));
          }
          i++;
          break;
        }
        buf.push(ln);
        i++;
      }
      continue;
    }
    if (rest.startsWith('"') && rest.endsWith('"')) {
      table[key] = JSON.parse(rest);
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim();
      if (inner === '') {
        table[key] = [];
      } else {
        table[key] = inner.split(',').map((p) => {
          const v = p.trim();
          if (v.startsWith('"') && v.endsWith('"')) return JSON.parse(v);
          if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
          return v;
        });
      }
    } else if (rest === 'true') table[key] = true;
    else if (rest === 'false') table[key] = false;
    else if (/^-?\d+(\.\d+)?$/.test(rest)) table[key] = Number(rest);
    else table[key] = rest;
    i++;
  }
  return out;
}

function unescape(s: string): string {
  return s.replace(/"\\""\\""/g, '"""');
}

function deepEqualKeys(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.join(',') !== bk.join(',')) return false;
  for (const k of ak) {
    const va = a[k];
    const vb = b[k];
    if (Array.isArray(va) && Array.isArray(vb)) {
      if (va.length !== vb.length) return false;
      for (let i = 0; i < va.length; i++) {
        if (JSON.stringify(va[i]) !== JSON.stringify(vb[i])) return false;
      }
      continue;
    }
    if (typeof va === 'object' && va !== null && typeof vb === 'object' && vb !== null) {
      if (!deepEqualKeys(va as Record<string, unknown>, vb as Record<string, unknown>)) return false;
      continue;
    }
    if (va !== vb) return false;
  }
  return true;
}

// ---------------- TOML → MD → TOML round-trip ----------------

test('TOML → MD → TOML round-trip preserves canonical keys', () => {
  const original = [
    'name = "my-agent"',
    'description = "Does the thing"',
    'tools = ["bash", "read"]',
    'model = "claude-sonnet-4"',
    'system_prompt = """',
    'You are a helpful agent.',
    'Be terse.',
    '"""',
  ].join('\n') + '\n';
  const md = codexTomlToMd(original);
  const reemitted = mdToCodexToml(md);
  const a = parseSimpleToml(original);
  const b = parseSimpleToml(reemitted);
  assert.ok(deepEqualKeys(a, b), `mismatch:\n${JSON.stringify(a)}\nvs\n${JSON.stringify(b)}`);
});

// ---------------- MD → TOML → MD round-trip with every ADR §5 key ----------------

test('MD → TOML → MD round-trip preserves every ADR §5 key', () => {
  const md = [
    '---',
    'name: kitchen-sink',
    'description: Every key in ADR §5',
    'tools: [bash, read, write]',
    'model: claude-opus-4-7',
    'developer_instructions: Internal notes for Codex',
    'sandbox_mode: workspace-write',
    'temperature: 0.7',
    'max_turns: 20',
    'timeout_mins: 5',
    '---',
    '',
    'You are an agent that does everything.',
    '',
    'Be concise.',
  ].join('\n');
  const toml = mdToCodexToml(md);
  const back = codexTomlToMd(toml);
  // Re-parse the returned MD's frontmatter into TOML again so we can
  // diff structurally — frontmatter ordering is allowed to drift.
  const reToml = mdToCodexToml(back);
  const a = parseSimpleToml(toml);
  const b = parseSimpleToml(reToml);
  for (const k of [
    'name', 'description', 'tools', 'model',
    'developer_instructions', 'sandbox_mode',
    'temperature', 'max_turns', 'timeout_mins',
    'system_prompt',
  ]) {
    assert.ok(k in a, `lost key ${k} in first emit`);
    assert.ok(k in b, `lost key ${k} in re-emit`);
    assert.equal(JSON.stringify(a[k]), JSON.stringify(b[k]), `key ${k} drifted`);
  }
});

// ---------------- Gemini command round-trip ----------------

test('mdToGeminiCommandToml round-trips body byte-equal modulo trailing newline', () => {
  const body = 'Summarize the diff in 3 bullets.\nThen suggest tests.';
  const md = [
    '---',
    'name: summarize-diff',
    'description: Slash command for PR summaries',
    '---',
    '',
    body,
  ].join('\n');
  const toml = mdToGeminiCommandToml(md);
  const parsed = parseSimpleToml(toml);
  assert.equal(parsed.name, 'summarize-diff');
  assert.equal(parsed.description, 'Slash command for PR summaries');
  assert.equal(parsed.prompt, body);
});

// ---------------- Empty frontmatter ----------------

test('mdToCodexToml handles empty frontmatter (no `---` block)', () => {
  const md = 'Just a body, no frontmatter.';
  const toml = mdToCodexToml(md);
  const parsed = parseSimpleToml(toml);
  assert.equal(parsed.system_prompt, 'Just a body, no frontmatter.');
});

// ---------------- Multi-line description ----------------

test('mdToCodexToml handles multi-line YAML body becoming system_prompt', () => {
  const md = [
    '---',
    'name: multi',
    'description: short',
    '---',
    '',
    'Line one.',
    'Line two.',
    'Line three.',
  ].join('\n');
  const toml = mdToCodexToml(md);
  const parsed = parseSimpleToml(toml);
  assert.equal(parsed.name, 'multi');
  assert.equal(parsed.description, 'short');
  assert.equal(parsed.system_prompt, 'Line one.\nLine two.\nLine three.');
});

// ---------------- Inline list values ----------------

test('inline list value (tools: [bash, read]) round-trips', () => {
  const md = [
    '---',
    'name: t',
    'description: d',
    'tools: [bash, read, write]',
    '---',
    '',
    'body',
  ].join('\n');
  const toml = mdToCodexToml(md);
  const parsed = parseSimpleToml(toml);
  assert.deepEqual(parsed.tools, ['bash', 'read', 'write']);
});

// ---------------- Block-style list values ----------------

test('block-style YAML list (`- a` lines) parses identically to inline', () => {
  const md = [
    '---',
    'name: t',
    'description: d',
    'tools:',
    '  - bash',
    '  - read',
    '---',
    '',
    'body',
  ].join('\n');
  const toml = mdToCodexToml(md);
  const parsed = parseSimpleToml(toml);
  assert.deepEqual(parsed.tools, ['bash', 'read']);
});

// ---------------- Markdown body containing triple quotes ----------------

test('body containing triple quotes survives MD → TOML → MD', () => {
  const body = 'Use """fenced""" blocks for code in the response.';
  const md = [
    '---',
    'name: q',
    'description: d',
    '---',
    '',
    body,
  ].join('\n');
  const toml = mdToCodexToml(md);
  const parsed = parseSimpleToml(toml);
  assert.equal(parsed.system_prompt, body);
  // And full round-trip
  const back = codexTomlToMd(toml);
  const toml2 = mdToCodexToml(back);
  const parsed2 = parseSimpleToml(toml2);
  assert.equal(parsed2.system_prompt, body);
});

// ---------------- Codex extras preserved ----------------

test('Codex extras (developer_instructions, sandbox_mode) survive round-trip', () => {
  const original = [
    'name = "codex-only"',
    'description = "uses extras"',
    'sandbox_mode = "read-only"',
    'developer_instructions = """',
    'Use the existing helper module.',
    'Do not network.',
    '"""',
    'system_prompt = """',
    'You are Codex.',
    '"""',
  ].join('\n') + '\n';
  const md = codexTomlToMd(original);
  const reemitted = mdToCodexToml(md);
  const a = parseSimpleToml(original);
  const b = parseSimpleToml(reemitted);
  assert.equal(a.sandbox_mode, b.sandbox_mode);
  assert.equal(a.developer_instructions, b.developer_instructions);
  assert.equal(a.system_prompt, b.system_prompt);
});

// ---------------- Unterminated frontmatter rejected ----------------

test('unterminated YAML frontmatter throws', () => {
  const md = '---\nname: bad\n';
  assert.throws(() => mdToCodexToml(md), /unterminated/);
});
