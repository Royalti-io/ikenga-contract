#!/usr/bin/env tsx
/**
 * validate-store.ts — WP-05 schema-validator (G-05 / G-17)
 *
 * Validates that a pkg manifest's `capabilities.sqlite.db` and
 * `permissions["sqlite.tables"]` entries are consistent with the
 * `tables.json` schema manifest emitted by `write_tables_manifest` (WP-02).
 *
 * Usage:
 *   tsx validate-store.ts <tables.json> [<manifest.json> ...]
 *
 * Exit codes:
 *   0  — all manifests pass
 *   1  — one or more validation failures (details on stderr)
 *   2  — usage / IO error
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

// ── types ────────────────────────────────────────────────────────────────────

interface ColumnInfo {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
}

interface TableInfo {
  strict: boolean;
  columns: ColumnInfo[];
}

type TablesManifest = Record<string, TableInfo>;

interface ManifestLike {
  id?: string;
  ikenga_api?: string;
  capabilities?: {
    sqlite?: { db?: string };
  };
  permissions?: {
    'sqlite.tables'?: string[];
    'supabase.tables'?: string[];
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function loadJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (e) {
    process.stderr.write(`[validate-store] cannot read ${path}: ${e}\n`);
    process.exit(2);
  }
}

/**
 * Glob-style wildcard match (only `*` supported — sufficient for table name
 * patterns like `pa_tasks*` or `*`).
 */
function matchesPattern(table: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (!pattern.includes('*')) return table === pattern;
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  return regex.test(table);
}

function resolvePatterns(
  patterns: string[],
  knownTables: string[],
): { matched: string[]; unknown: string[] } {
  const matched: string[] = [];
  const unknown: string[] = [];
  for (const pat of patterns) {
    const hits = knownTables.filter((t) => matchesPattern(t, pat));
    if (hits.length === 0) {
      unknown.push(pat);
    } else {
      matched.push(...hits.filter((t) => !matched.includes(t)));
    }
  }
  return { matched, unknown };
}

// ── main ─────────────────────────────────────────────────────────────────────

const [, , tablesJsonPath, ...manifestPaths] = process.argv;

if (!tablesJsonPath) {
  process.stderr.write(
    'Usage: validate-store.ts <tables.json> [<manifest.json> ...]\n',
  );
  process.exit(2);
}

const tables = loadJson<TablesManifest>(tablesJsonPath);
const knownTables = Object.keys(tables);

if (manifestPaths.length === 0) {
  process.stdout.write(
    `[validate-store] loaded ${knownTables.length} tables from ${tablesJsonPath}. No manifests to validate.\n`,
  );
  process.exit(0);
}

let failures = 0;

for (const mPath of manifestPaths) {
  const manifest = loadJson<ManifestLike>(mPath);
  const id = manifest.id ?? '(unknown)';
  const api = Number.parseInt(manifest.ikenga_api ?? '0', 10);
  const errors: string[] = [];

  // --- capabilities.sqlite.db must be "ikenga.local" ---
  const sqliteCap = manifest.capabilities?.sqlite;
  if (sqliteCap !== undefined) {
    const db = sqliteCap.db ?? 'ikenga.local';
    if (db !== 'ikenga.local') {
      errors.push(
        `  capabilities.sqlite.db = "${db}": only "ikenga.local" is supported`,
      );
    }
  }

  // --- permissions["sqlite.tables"] must reference known tables ---
  const sqliteTables = manifest.permissions?.['sqlite.tables'] ?? [];
  if (sqliteTables.length > 0) {
    const { unknown } = resolvePatterns(sqliteTables, knownTables);
    for (const u of unknown) {
      errors.push(
        `  permissions["sqlite.tables"] pattern "${u}" matches no tables in ${tablesJsonPath}`,
      );
    }
  }

  // --- api=1 compat: warn if supabase.tables still used in api>=2 manifest ---
  const supabaseTables = manifest.permissions?.['supabase.tables'] ?? [];
  if (supabaseTables.length > 0 && api >= 2) {
    process.stderr.write(
      `[validate-store] WARN ${id}: permissions["supabase.tables"] is deprecated for ikenga_api >= 2; use "sqlite.tables" instead\n`,
    );
  }

  // --- sqlite capability declared but no sqlite.tables permission ---
  if (sqliteCap !== undefined && sqliteTables.length === 0) {
    process.stderr.write(
      `[validate-store] WARN ${id}: capabilities.sqlite declared but permissions["sqlite.tables"] is empty — pkg may fail permission checks at runtime\n`,
    );
  }

  if (errors.length > 0) {
    process.stderr.write(`[validate-store] FAIL ${id} (${mPath}):\n`);
    for (const e of errors) process.stderr.write(`${e}\n`);
    failures++;
  } else {
    process.stdout.write(`[validate-store] OK   ${id} (${mPath})\n`);
  }
}

if (failures > 0) {
  process.stderr.write(
    `\n[validate-store] ${failures} manifest(s) failed validation\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `[validate-store] all ${manifestPaths.length} manifest(s) passed\n`,
);
