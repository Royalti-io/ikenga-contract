---
'@ikenga/contract': minor
---

Mirror `permissions.notify` in the manifest schema

The shell gained a `host.notify` verb gated on `permissions.notify` containing
`"send"` (ikenga WP-26). The Rust `Permissions` struct has no
`deny_unknown_fields`, so the shell accepts the field regardless — but a pkg
author validating a manifest against this Zod schema got no authoring support
for a permission the shell honours. That is the drift that produces a manifest
which validates in one place and not the other.

Shipped in `be2c837`, which merged without a changeset and so would never have
been versioned.
