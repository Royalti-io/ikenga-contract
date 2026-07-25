---
'@ikenga/contract': patch
---

`SettingsFieldSchema` accepts an optional `env` string, so a manifest that names
an environment variable on a `settings` secret validates instead of being
rejected. This is the TypeScript mirror of the shell's `manifest.rs`
`SettingsField` change (F-9): the shell resolves the secret from its Stronghold
vault and injects it into the pkg's sidecar and MCP process environment under
the declared name. Without this field on the Zod side, contract consumers
validating the same manifest the shell accepts would fail.
