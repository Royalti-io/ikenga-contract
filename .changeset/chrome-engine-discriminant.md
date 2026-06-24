---
"@ikenga/contract": minor
---

Add a `BrowserEngine` discriminant (`"webkit" | "chrome"`) to the browser surface for Managed-mode Chrome. `BrowserOpenInput`, `BrowserOpenResult`, and `BrowserListEntry` gain an `engine` field (defaults to `"webkit"`), and `WebviewCapability` gains an `engines` array (defaults to `["webkit"]`). Purely additive — existing manifests and callers are unchanged. Mirrors the lockstep change in `WebviewCapability` (shell `manifest.rs`).
