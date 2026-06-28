---
"@ikenga/contract": minor
---

Add the multi-window `G-WINDOW-MODEL` contract: a new `./window` export with Zod
schemas for `WindowDescriptor` (label / kind / surface_set / project_id /
layout_key) and the cross-window event envelope (`WindowEventEnvelope`,
`WindowEventTarget`, `WINDOW_TOPICS`, `WINDOW_TARGETED_CHANNELS`). Mirrors the
Rust structs in `royalti-io/ikenga` (`src-tauri/src/window/`) — round-trip tested
against shared canonical fixtures on both sides. Additive; no existing export
changes.
