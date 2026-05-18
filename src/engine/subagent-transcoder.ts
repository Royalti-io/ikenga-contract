/**
 * Subagent format transcoder — ADR-012 §5.
 *
 * Translates between the canonical Markdown + YAML-frontmatter shape used
 * by Claude Code and Gemini CLI and the TOML shape used by Codex CLI.
 * Zero external dependencies: hand-rolled mini-parsers for YAML
 * frontmatter and the TOML keys ADR §5 lists.
 *
 * Supported keys (top-level):
 *   - Canonical (round-trips): name, description, tools, model, system_prompt
 *   - Codex extras (preserved when present): developer_instructions,
 *     sandbox_mode, mcp_servers, skills
 *   - Claude/Gemini extras (preserved in YAML, ignored by Codex):
 *     temperature, max_turns, timeout_mins
 *
 * Nested table support is limited to `[mcp_servers]` — that's the only
 * realistic surface for subagents. Arrays of tables, inline tables, and
 * comments are not parsed; the transcoder operates on files we generate
 * or files following ADR §5's spec.
 */

// ---------- Public API ----------

export function mdToCodexToml(md: string): string {
  const { frontmatter, body } = parseFrontmatter(md);
  const fm = { ...frontmatter };
  // Body becomes system_prompt unless the frontmatter already has one
  // (in which case body wins — same convention as Gemini/Claude tooling).
  if (body.length > 0) fm.system_prompt = body;
  return emitToml(fm);
}

export function codexTomlToMd(toml: string): string {
  const data = parseToml(toml);
  const body = typeof data.system_prompt === 'string' ? data.system_prompt : '';
  const fmOnly: Record<string, unknown> = { ...data };
  delete fmOnly.system_prompt;
  return emitFrontmatter(fmOnly) + body;
}

export function mdToGeminiCommandToml(md: string): string {
  // Gemini commands are slash commands, not subagents: the body is `prompt`
  // (not `system_prompt`) and frontmatter keys live at the top level.
  const { frontmatter, body } = parseFrontmatter(md);
  const fm: Record<string, unknown> = { ...frontmatter };
  if (body.length > 0) fm.prompt = body;
  return emitToml(fm);
}

// ---------- YAML frontmatter (read) ----------

interface Frontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
}

const FRONT_DELIM = /^---\s*$/;

function parseFrontmatter(md: string): Frontmatter {
  const lines = md.split('\n');
  if (lines.length === 0 || !FRONT_DELIM.test(lines[0] ?? '')) {
    return { frontmatter: {}, body: md };
  }
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FRONT_DELIM.test(lines[i] ?? '')) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    throw new Error('subagent transcoder: unterminated YAML frontmatter (missing closing `---`)');
  }
  const yamlLines = lines.slice(1, closeIdx);
  const bodyLines = lines.slice(closeIdx + 1);
  // Strip exactly one leading blank line between `---` and body, if present.
  if (bodyLines.length > 0 && bodyLines[0] === '') bodyLines.shift();
  return {
    frontmatter: parseYamlBlock(yamlLines),
    body: bodyLines.join('\n'),
  };
}

function parseYamlBlock(lines: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i] ?? '';
    if (raw.trim() === '') { i++; continue; }
    if (/^\s/.test(raw)) {
      throw new Error(`subagent transcoder: unexpected indented line in YAML frontmatter: ${JSON.stringify(raw)}`);
    }
    const colon = raw.indexOf(':');
    if (colon < 0) {
      throw new Error(`subagent transcoder: malformed YAML line (no \`:\`): ${JSON.stringify(raw)}`);
    }
    const key = raw.slice(0, colon).trim();
    const rest = raw.slice(colon + 1).trim();
    if (rest === '') {
      // Block-style list: subsequent `  - item` lines.
      const list: string[] = [];
      i++;
      while (i < lines.length && /^\s+-\s/.test(lines[i] ?? '')) {
        const item = (lines[i] ?? '').replace(/^\s+-\s+/, '');
        list.push(parseScalar(item) as string);
        i++;
      }
      out[key] = list;
      continue;
    }
    out[key] = parseScalar(rest);
    i++;
  }
  return out;
}

function parseScalar(s: string): unknown {
  const t = s.trim();
  if (t.startsWith('[') && t.endsWith(']')) {
    // Inline list: `[a, b, "c, d"]` — supports quoted items with commas.
    const inner = t.slice(1, -1);
    return splitInlineList(inner).map((p) => parseScalar(p));
  }
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    // Double-quoted: honor JSON escape sequences (\n, \t, \\, \").
    try {
      return JSON.parse(t);
    } catch {
      return t.slice(1, -1);
    }
  }
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
    // Single-quoted YAML strings are literal.
    return t.slice(1, -1);
  }
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === '~' || t === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

function splitInlineList(inner: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inQuote: string | null = null;
  for (const ch of inner) {
    if (inQuote) {
      buf += ch;
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inQuote = ch; buf += ch; continue; }
    if (ch === ',') { out.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim() !== '') out.push(buf.trim());
  return out;
}

// ---------- YAML frontmatter (write) ----------

function emitFrontmatter(fm: Record<string, unknown>): string {
  const keys = Object.keys(fm);
  if (keys.length === 0) return '---\n---\n';
  const parts: string[] = ['---'];
  for (const k of keys) {
    const v = fm[k];
    if (Array.isArray(v)) {
      // Always emit lists in inline form for stability — round-trip with
      // block-style lists still works because the reader accepts both.
      parts.push(`${k}: [${v.map((it) => emitYamlScalar(it)).join(', ')}]`);
    } else if (v !== undefined && v !== null) {
      parts.push(`${k}: ${emitYamlScalar(v)}`);
    } else if (v === null) {
      parts.push(`${k}: null`);
    }
  }
  parts.push('---');
  parts.push('');
  return parts.join('\n');
}

function emitYamlScalar(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v === null || v === undefined) return 'null';
  const s = String(v);
  // Quote when content has YAML-significant chars or leading/trailing space.
  if (/[:#\[\]{},&*?|<>=!%@`]/.test(s) || /^\s|\s$/.test(s) || s === '') {
    return JSON.stringify(s);
  }
  return s;
}

// ---------- TOML (write) ----------

function emitToml(data: Record<string, unknown>): string {
  const lines: string[] = [];
  const nested: Array<[string, Record<string, unknown>]> = [];
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (isPlainObject(v)) {
      nested.push([k, v]);
      continue;
    }
    lines.push(`${k} = ${emitTomlValue(v, k)}`);
  }
  for (const [name, table] of nested) {
    lines.push('');
    lines.push(`[${name}]`);
    for (const tk of Object.keys(table)) {
      lines.push(`${tk} = ${emitTomlValue((table as Record<string, unknown>)[tk], tk)}`);
    }
  }
  return lines.join('\n') + '\n';
}

function emitTomlValue(v: unknown, key: string): string {
  if (typeof v === 'string') {
    // Triple-quoted for the prompt-bearing keys + anything multi-line.
    if (key === 'system_prompt' || key === 'prompt' || key === 'developer_instructions' || v.includes('\n')) {
      // Triple-quoted multi-line string per TOML spec: the immediately
      // following newline after the opening `"""` is stripped, so we
      // preserve the body byte-for-byte by placing closing `"""` directly
      // after the body (no separator newline).
      const escaped = v.replace(/"""/g, '"\\""\\""');
      return `"""\n${escaped}"""`;
    }
    return JSON.stringify(v);
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v === null || v === undefined) return '""';
  if (Array.isArray(v)) {
    return `[${v.map((it) => emitTomlValue(it, key)).join(', ')}]`;
  }
  // Fallback — should not be hit because objects are routed to nested tables.
  return JSON.stringify(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ---------- TOML (read) ----------

function parseToml(toml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = toml.split('\n');
  let i = 0;
  let currentTable: Record<string, unknown> = out;
  while (i < lines.length) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) { i++; continue; }
    const tableMatch = /^\[([^\]]+)\]$/.exec(trimmed);
    if (tableMatch) {
      const name = (tableMatch[1] ?? '').trim();
      const tbl: Record<string, unknown> = {};
      out[name] = tbl;
      currentTable = tbl;
      i++;
      continue;
    }
    const eq = raw.indexOf('=');
    if (eq < 0) {
      throw new Error(`subagent transcoder: malformed TOML line: ${JSON.stringify(raw)}`);
    }
    const key = raw.slice(0, eq).trim();
    const restRaw = raw.slice(eq + 1);
    const rest = restRaw.trim();
    if (rest.startsWith('"""')) {
      // Multi-line triple-quoted string. ADR §5 emits these with the
      // opening `"""` on its own line; we accept both shapes.
      const { value, consumed } = parseTripleQuoted(lines, i, eq);
      currentTable[key] = value;
      i += consumed;
      continue;
    }
    currentTable[key] = parseTomlScalar(rest);
    i++;
  }
  return out;
}

function parseTripleQuoted(lines: string[], startIdx: number, eqPos: number): { value: string; consumed: number } {
  const first = lines[startIdx] ?? '';
  // Strip the `key = """` prefix from the first line.
  const afterOpen = first.slice(eqPos + 1).trim().slice(3);
  let consumed = 1;
  // Closing on the same line: `key = """text"""`
  if (afterOpen.endsWith('"""') && afterOpen.length >= 3) {
    return { value: unescapeTriple(afterOpen.slice(0, -3)), consumed };
  }
  // Per TOML spec, the newline immediately following the opening `"""`
  // is stripped. We then collect content until the closing `"""` and
  // include the body byte-for-byte (no synthetic trailing `\n`).
  const buf: string[] = [];
  if (afterOpen !== '') buf.push(afterOpen);
  for (let j = startIdx + 1; j < lines.length; j++) {
    const ln = lines[j] ?? '';
    consumed++;
    if (ln.endsWith('"""')) {
      const trailing = ln.slice(0, -3);
      // Closing on its own line — the `\n` before `"""` is part of the
      // body; otherwise the trailing chunk is the body's last line.
      if (trailing === '' && buf.length > 0) {
        return { value: unescapeTriple(buf.join('\n') + '\n'), consumed };
      }
      buf.push(trailing);
      return { value: unescapeTriple(buf.join('\n')), consumed };
    }
    buf.push(ln);
  }
  throw new Error('subagent transcoder: unterminated TOML triple-quoted string');
}

function unescapeTriple(s: string): string {
  // Inverse of the `"""` → `"\""\""` escape applied during emit.
  return s.replace(/"\\""\\""/g, '"""');
}

function parseTomlScalar(s: string): unknown {
  if (s.startsWith('"') && s.endsWith('"')) {
    return JSON.parse(s);
  }
  if (s.startsWith('[') && s.endsWith(']')) {
    return splitInlineList(s.slice(1, -1)).map((p) => parseTomlScalar(p));
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}
