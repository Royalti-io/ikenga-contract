---
'@ikenga/contract': minor
---

Add the `host-sidecar-event` AppBridge push envelope (`HOST_SIDECAR_EVENT_TYPE`,
`HostSidecarEventParams`, `HostSidecarEventNotification`,
`isHostSidecarEventNotification`, `HOST_SIDECAR_EVENT_MAX_PER_SEC`). This is
the TypeScript type for the shell's new forwarder (`pkg-iframe-host.tsx`),
which relays a pkg's long-lived sidecar stdout lines
(`pkg://sidecar/{pkgId}/{name}/message`) onto the iframe's AppBridge
notification wire, scoped by pkg id and rate-capped to mirror the existing
`pkg-mcp-notification` relay budget. New file, additive only.
