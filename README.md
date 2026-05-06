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

## Status

`v0.1.0` — first real schemas. RPC method catalogue, engine interface, and capability scopes all defined; expect minor additions before `1.0.0`. The shell + Studio carve will validate this surface before `1.0`.
