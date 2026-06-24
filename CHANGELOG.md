# @ikenga/contract

## 0.11.0

### Minor Changes

- 63f35d7: Add a `BrowserEngine` discriminant (`"webkit" | "chrome"`) to the browser surface for Managed-mode Chrome. `BrowserOpenInput`, `BrowserOpenResult`, and `BrowserListEntry` gain an `engine` field (defaults to `"webkit"`), and `WebviewCapability` gains an `engines` array (defaults to `["webkit"]`). Purely additive — existing manifests and callers are unchanged. Mirrors the lockstep change in `WebviewCapability` (shell `manifest.rs`).

## 0.10.0

### Minor Changes

- 6c7aa08: Adds three major capability areas since v0.9.1. (1) **Trusted-capability manifest tier (ADR-017):** new `HttpCapabilitySchema`, `SecretsCapabilitySchema` (with `NamedSecretSchema`), and `InvokeCapabilitySchema` (with a named-command `commands` allowlist per D-06) let signed/builtin pkgs declare host-mediated HTTP proxying, Stronghold-resolved secret injection, and scoped Tauri-command passthrough; a top-level optional `signature` field is added to the manifest and `IKENGA_API_VERSION` is bumped to 3 (api=1/2 manifests parse unchanged). (2) **Approve-gate draft contract (`./pa-actions`):** new export path with `DraftItem`, `ApproveGateMeta`, `PausedDraft`, `SendResult` types, the `fromDraftItem` view-model derivation function, and `draftPreview` helper; extended in WP-02 with `recipientsList`, `bodyFormat`, `replyTo`, `scheduledChip` on `DraftItem` and a `'failed'` status on `PausedDraft` for post-send-worker error surfacing. (3) **Canvas a11y (`./canvas`):** opt-in `keyboardPan` and `ariaLabel` props on `CanvasProps`, arrow-key pan + +/- zoom in `use-pan-zoom`, and `role="img"` + roving tabindex on placed widgets in the `Canvas` primitive — all additive and backwards-compatible with existing consumers.

## 0.9.1

### Patch Changes

- ba10200: Adopt Changesets for versioning + release. Contributors now run `npx changeset`
  with each change to declare the bump (patch/minor/major); the version and
  CHANGELOG are derived from those entries and published by CI on merge of the
  "Version Packages" PR, replacing the previous tag-triggered publish flow.
