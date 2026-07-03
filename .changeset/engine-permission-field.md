---
"@ikenga/contract": minor
---

PermissionsSchema gains `engine` (string[] of engine scopes, e.g. "invoke") —
previously undeclarable, so the shell's engine:invoke gate on
host.sendToActiveSession could never pass for any pkg. Mirrors the shell
manifest.rs Permissions.engine field (lockstep).
