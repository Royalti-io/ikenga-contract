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

## Versioning

Strict semver. Pkgs declare `"contract": "^1"` and the kernel checks compatibility at install time.

## Source of truth

The `Manifest` schema **mirrors** the Rust struct in `royalti-io/ikenga` at `src-tauri/src/pkg/manifest.rs`. The Rust kernel parses pkg `manifest.json` files; this package is a TS-side validator and types-only mirror for tooling (CLI, registry build).

If you need to change the manifest, change the Rust struct first and update this schema in lockstep.

## Status

`v0.2.0` — manifest realigned to the real Rust schema (was a speculative parallel in v0.1.0). RPC method catalogue, engine interface, and capability scopes still in place but unused by the kernel today; treat them as forward-looking.
