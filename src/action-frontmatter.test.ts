import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import YAML from 'yaml';

import {
  ActionFrontmatter,
  CapabilityEnum,
  DomainEnum,
  RunBinding,
  SetupSpec,
  Trigger,
  UxModeEnum,
} from './action-frontmatter.js';

// ─── unit: sub-schemas ──────────────────────────────────────────────────────

test('DomainEnum: the eight domains + skill-core', () => {
  for (const d of [
    'tasks',
    'mail',
    'outbound',
    'sales',
    'finance',
    'content',
    'research',
    'strategy',
    'skill-core',
  ]) {
    assert.equal(DomainEnum.parse(d), d);
  }
  assert.throws(() => DomainEnum.parse('marketing'));
});

test('UxModeEnum: exactly the five modes', () => {
  for (const m of ['confirm', 'silent', 'form', 'streaming', 'approve']) {
    assert.equal(UxModeEnum.parse(m), m);
  }
  assert.throws(() => UxModeEnum.parse('modal'));
});

test('RunBinding: chat_prompt requires a non-empty prompt', () => {
  const r = RunBinding.parse({ kind: 'chat_prompt', prompt: '# do the thing' });
  assert.equal(r.kind, 'chat_prompt');
  assert.throws(() => RunBinding.parse({ kind: 'chat_prompt', prompt: '' }));
});

test('RunBinding: sidecar defaults args to []', () => {
  const r = RunBinding.parse({ kind: 'sidecar', sidecar_id: 'pa-x' });
  assert.deepEqual(r.kind === 'sidecar' ? r.args : null, []);
});

test('Trigger: schedule needs a cron; unknown kind rejected', () => {
  const t = Trigger.parse({ kind: 'schedule', cron: '30 */4 * * *', label: 'x' });
  assert.equal(t.kind, 'schedule');
  assert.throws(() => Trigger.parse({ kind: 'timer', every: '5m' }));
});

test('CapabilityEnum: closed set', () => {
  for (const c of ['sqlite', 'mcp', 'sidecar', 'network', 'fs', 'secrets', 'chat']) {
    assert.equal(CapabilityEnum.parse(c), c);
  }
  assert.throws(() => CapabilityEnum.parse('gpu'));
});

test('SetupSpec: template_version must be a positive int', () => {
  const s = SetupSpec.parse({ mode: 'interview', template_version: 1 });
  assert.equal(s.template_version, 1);
  assert.throws(() => SetupSpec.parse({ mode: 'interview', template_version: 0 }));
});

// ─── unit: ActionFrontmatter refinements ────────────────────────────────────

test('ActionFrontmatter: name must be kebab-case', () => {
  const base = {
    name: 'draft-reply',
    description: 'x',
    domain: 'mail',
    ux_mode: 'approve',
    run: { kind: 'chat_prompt', prompt: 'x' },
  };
  assert.equal(ActionFrontmatter.parse(base).name, 'draft-reply');
  assert.throws(() => ActionFrontmatter.parse({ ...base, name: 'DraftReply' }));
});

test('ActionFrontmatter: .strict rejects unknown top-level keys', () => {
  assert.throws(() =>
    ActionFrontmatter.parse({
      name: 'x',
      description: 'x',
      domain: 'mail',
      ux_mode: 'approve',
      run: { kind: 'chat_prompt', prompt: 'x' },
      bogus: true,
    }),
  );
});

test('ActionFrontmatter: setup block only valid on the setup action', () => {
  // Non-setup action carrying a setup block → rejected.
  assert.throws(() =>
    ActionFrontmatter.parse({
      name: 'sweep',
      description: 'x',
      domain: 'tasks',
      ux_mode: 'approve',
      run: { kind: 'chat_prompt', prompt: 'x' },
      setup: { mode: 'interview', template_version: 1 },
    }),
  );
  // setup action missing its setup block → rejected.
  assert.throws(() =>
    ActionFrontmatter.parse({
      name: 'setup',
      description: 'x',
      domain: 'skill-core',
      ux_mode: 'streaming',
      run: { kind: 'chat_prompt', prompt: 'x' },
    }),
  );
  // setup action with its setup block → ok.
  const ok = ActionFrontmatter.parse({
    name: 'setup',
    description: 'x',
    domain: 'skill-core',
    ux_mode: 'streaming',
    run: { kind: 'chat_prompt', prompt: 'x' },
    setup: { mode: 'ai_infer', template_version: 1, infer_sources: ['README.md'] },
  });
  assert.equal(ok.setup?.mode, 'ai_infer');
});

test('ActionFrontmatter: depends_on refuses non-skill-core targets', () => {
  assert.throws(() =>
    ActionFrontmatter.parse({
      name: 'x',
      description: 'x',
      domain: 'mail',
      ux_mode: 'approve',
      run: { kind: 'chat_prompt', prompt: 'x' },
      depends_on: ['mail'],
    }),
  );
});

// ─── conformance: parse every real installed action file ────────────────────

/** Extract the YAML frontmatter block between the leading `---` fences.
 *  Mirrors the Rust `extract_frontmatter` in skill_actions.rs. Returns null
 *  when the file does not open with a `---` fence (prose-only skill docs). */
function extractFrontmatter(body: string): string | null {
  const src = body.replace(/^﻿/, '');
  const lines = src.split('\n');
  if (lines[0]?.trim() !== '---') return null;
  const close = lines.slice(1).findIndex((l) => l.replace(/\r$/, '').trim() === '---');
  if (close === -1) return null;
  return lines.slice(1, 1 + close).join('\n');
}

function collectActionFiles(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  // contract/src → ikenga-pkgs/packages/skills (sibling repos under the workspace).
  const skillsRoot = join(here, '..', '..', 'ikenga-pkgs', 'packages', 'skills');
  if (!existsSync(skillsRoot)) return [];
  const out: string[] = [];
  for (const domain of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!domain.isDirectory()) continue;
    const skillsDir = join(skillsRoot, domain.name, 'skills');
    if (!existsSync(skillsDir)) continue;
    for (const skill of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!skill.isDirectory()) continue;
      const actionsDir = join(skillsDir, skill.name, 'actions');
      if (!existsSync(actionsDir)) continue;
      for (const f of readdirSync(actionsDir)) {
        if (f.endsWith('.md') && f.toLowerCase() !== 'readme.md') {
          out.push(join(actionsDir, f));
        }
      }
    }
  }
  return out.sort();
}

test('conformance: every real action file with frontmatter parses against ActionFrontmatter', () => {
  const files = collectActionFiles();
  assert.ok(
    files.length > 0,
    'expected to find real action .md files under ikenga-pkgs/packages/skills',
  );

  let parsed = 0;
  const failures: string[] = [];
  for (const file of files) {
    const fm = extractFrontmatter(readFileSync(file, 'utf8'));
    if (fm === null) continue; // prose-only skill doc (groundwork/contribute) — not a structured action
    const doc = YAML.parse(fm);
    const res = ActionFrontmatter.safeParse(doc);
    if (!res.success) {
      failures.push(`${file}\n  ${JSON.stringify(res.error.issues, null, 2)}`);
    } else {
      parsed += 1;
    }
  }

  assert.equal(
    failures.length,
    0,
    `real action files failed the schema:\n${failures.join('\n')}`,
  );
  // Well above the "at least 3" bar — the full Atelier surface is ~32 structured actions.
  assert.ok(parsed >= 3, `expected >= 3 structured action files, parsed ${parsed}`);
});
