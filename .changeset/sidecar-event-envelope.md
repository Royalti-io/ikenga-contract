---
'@ikenga/contract': minor
---

Add the `repo.changed` push contract at `@ikenga/contract/app-bridge`
(`REPO_CHANGED_METHOD`, `RepoChangedParams` + `RepoChangedParamsSchema`,
`RepoChangedEnvelope` + `RepoChangedEnvelopeSchema`, `readRepoChangedParams`,
`isRepoChangedNotification`, `HOST_NOTIFICATION_MAX_PER_SEC`).

This types the notification a pkg's **long-lived MCP server** emits via
`server.sendLoggingMessage` so its iframe learns a git repo moved on disk
without polling. The shell's existing relay carries it: the Rust supervisor
matches `notifications/message`, rate-caps per pkg, and emits the
`pkg-mcp-notification` Tauri event (`shell/src-tauri/src/pkg/lifecycle.rs`),
which `pkg-iframe-host.tsx` Step 3b forwards verbatim onto the iframe's
AppBridge wire. No new shell plumbing.

Note there is no sidecar push path: `manifest.sidecars[]` entries are not
supervised and `host.pkgSidecarCall` spawns a fresh one-shot process per call.
The rate cap is a **tumbling** one-second window, so a burst straddling two
windows can deliver up to 2x the cap in one arbitrary second.

New file, additive only.
