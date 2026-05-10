# @ikenga/contract

The single source of truth for how the **Ikenga shell**, **pkgs**, and **engines** talk to each other.

This package is intentionally small and stable. Bumping its major version is an event coordinated across the shell + every published pkg.

## What's in here

| Module | Exports |
|--------|---------|
| `@ikenga/contract/manifest` | `ikenga-pkg.toml` schema (zod) — `ManifestSchema`, `Manifest` type |
| `@ikenga/contract/rpc` | Shell ↔ pkg postMessage RPC envelope, request/response types |
| `@ikenga/contract/engine` | `Engine` interface, `Session`, `EngineEvent` types |
| `@ikenga/contract/scopes` | Capability scope catalogue (`tasks:read`, `engine:invoke`, …) |
| `@ikenga/contract/artifact` | Ikenga artifact manifest schema (zod) — `ArtifactManifestSchema`, `ArtifactManifest` type, refresh / data-source / fallback sub-schemas |

## Artifact manifest

The artifact manifest is the JSON block embedded in `<script type="application/json" id="ikenga-manifest">…</script>` (single-file artifacts) or in `manifest.json` (folder mode). It's a separate concept from the pkg manifest — pkgs are heavyweight Tauri-side mini-apps; artifacts are portable HTML docs that render anywhere and light up with live data inside the Ikenga shell.

- Source of truth: `src/artifact.ts` (Zod).
- Generated JSON Schema: `schemas/artifact/v0.json` — regenerate with `pnpm generate:schemas` after schema edits.
- Published at: `https://royalti-io.github.io/ikenga-contract/schemas/artifact/v0.json` (`$id` is stamped at generation time).
- Fixtures (the three v0 example artifacts) live in `src/artifact-fixtures/` and are gated by `pnpm test`.

## Versioning

Strict semver. Pkgs declare `"contract": "^1"` and the kernel checks compatibility at install time.

## Source of truth

The `Manifest` schema **mirrors** the Rust struct in `royalti-io/ikenga` at `src-tauri/src/pkg/manifest.rs`. The Rust kernel parses pkg `manifest.json` files; this package is a TS-side validator and types-only mirror for tooling (CLI, registry build).

If you need to change the manifest, change the Rust struct first and update this schema in lockstep.

## Status

`v0.2.0` — manifest realigned to the real Rust schema (was a speculative parallel in v0.1.0). RPC method catalogue, engine interface, and capability scopes still in place but unused by the kernel today; treat them as forward-looking.
