# @ikenga/contract

[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/Royalti-io/ikenga-contract/actions)
[![Version](https://img.shields.io/badge/version-v0.2.0-blue.svg)](https://github.com/Royalti-io/ikenga-contract/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Discussions](https://img.shields.io/badge/community-discussions-5865F2.svg)](https://github.com/Royalti-io/ikenga-contract/discussions)

> The single source of truth for how the Ikenga shell, pkgs, and engines talk to each
> other.

## What it is

`@ikenga/contract` is the shared TypeScript package that defines the wire between the
[Ikenga shell](https://github.com/Royalti-io/ikenga), its packages, and its engine
adapters: the manifest schema, the RPC envelope, the Engine interface, and the capability
scope catalogue. It's intentionally small and stable — bumping its major version is an
event coordinated across the shell and every published pkg.

## Install

```bash
pnpm add @ikenga/contract
```

In the workspace, this resolves as `workspace:*`.

## What's in here

| Module | Exports |
|--------|---------|
| `@ikenga/contract/manifest` | `ikenga-pkg.toml` schema (Zod) — `ManifestSchema`, `Manifest` type |
| `@ikenga/contract/rpc` | Shell ↔ pkg postMessage RPC envelope, request/response types |
| `@ikenga/contract/engine` | `Engine` interface, `Session`, `EngineEvent` types |
| `@ikenga/contract/scopes` | Capability scope catalogue (`tasks:read`, `engine:invoke`, …) |
| `@ikenga/contract/artifact` | Artifact manifest schema (Zod) — `ArtifactManifestSchema`, `ArtifactManifest` type, refresh / data-source / fallback sub-schemas |

## Artifact manifest

The artifact manifest is the JSON block embedded in
`<script type="application/json" id="ikenga-manifest">…</script>` (single-file artifacts) or
in `manifest.json` (folder mode). It's a separate concept from the pkg manifest — pkgs are
heavyweight Tauri-side mini-apps; artifacts are portable HTML docs that render anywhere and
light up with live data inside the shell.

- Source of truth: `src/artifact.ts` (Zod).
- Generated JSON Schema: `schemas/artifact/v0.json` — regenerate with `pnpm generate:schemas` after schema edits.
- Published at: `https://royalti-io.github.io/ikenga-contract/schemas/artifact/v0.json` (`$id` stamped at generation time).
- Fixtures (the three v0 example artifacts) live in `src/artifact-fixtures/` and are gated by `pnpm test`.

## Versioning

Strict semver. Pkgs declare `"contract": "^1"` and the kernel checks compatibility at
install time.

## Source of truth

The `Manifest` schema **mirrors** the Rust struct in
[`Royalti-io/ikenga`](https://github.com/Royalti-io/ikenga) at
`src-tauri/src/pkg/manifest.rs`. The Rust kernel parses pkg `manifest.json` files; this
package is a TS-side validator and types-only mirror for tooling (CLI, registry build). To
change the manifest, change the Rust struct first and update this schema in lockstep.

## Status

`v0.2.0` — manifest realigned to the real Rust schema (was a speculative parallel in
v0.1.0). RPC method catalogue, engine interface, and capability scopes are still in place
but unused by the kernel today; treat them as forward-looking.

## Links

- [ikenga.dev](https://ikenga.dev) — site + docs
- [`ikenga`](https://github.com/Royalti-io/ikenga) — the desktop shell (owns the Rust source of truth)
- [`ikenga-pkgs`](https://github.com/Royalti-io/ikenga-pkgs) — first-party packages

## License

Apache-2.0 — see [`LICENSE`](LICENSE).

## Contributing & community

Issues and PRs welcome. Start a thread in
[Discussions](https://github.com/Royalti-io/ikenga-contract/discussions).
<!-- VERIFY: link CONTRIBUTING.md / CODE_OF_CONDUCT.md once the org .github defaults or per-repo copies exist. -->
