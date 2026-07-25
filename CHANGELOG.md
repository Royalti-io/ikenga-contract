# @ikenga/contract

## 0.14.1

### Patch Changes

- d25b94a: `SettingsFieldSchema` accepts an optional `env` string, so a manifest that names
  an environment variable on a `settings` secret validates instead of being
  rejected. This is the TypeScript mirror of the shell's `manifest.rs`
  `SettingsField` change (F-9): the shell resolves the secret from its Stronghold
  vault and injects it into the pkg's sidecar and MCP process environment under
  the declared name. Without this field on the Zod side, contract consumers
  validating the same manifest the shell accepts would fail.

## 0.14.0

### Minor Changes

- f9e1b4f: Add `OperatorIdentity` hostContext extension (`operator` field on `IkengaHostContextExtensions`) — optional; absence means unknown operator and consumers must fail safe (e.g. `ux_mode: 'confirm'`).

## 0.13.0

### Minor Changes

- 17375fd: Publish the skill-action frontmatter contract: a new `./action-frontmatter`
  export with Zod schemas for `ActionFrontmatter` and its sub-schemas
  (`DomainEnum`, `UxModeEnum`, `RunBinding`, `Trigger`, `CapabilityEnum`,
  `SetupSpec`). This is the source-of-truth shape for an Atelier skill _action_'s
  YAML frontmatter (the block between the leading `---` fences of an
  `actions/*.md` file). Mirrors the Rust loader in `royalti-io/ikenga`
  (`src-tauri/src/pkg/skill_actions.rs`) — same lockstep convention as
  manifest.ts ↔ manifest.rs. Conformance-tested against every installed Atelier
  action file. Additive; no existing export changes.
- 4d7bc7d: PermissionsSchema gains `engine` (string[] of engine scopes, e.g. "invoke") —
  previously undeclarable, so the shell's engine:invoke gate on
  host.sendToActiveSession could never pass for any pkg. Mirrors the shell
  manifest.rs Permissions.engine field (lockstep).

## 0.12.0

### Minor Changes

- 0d67fd0: Add optional social/media fields to `DraftItem` (`channelId`, `firstComment`, `media`) plus `SocialMedia` and `ThreadPost` types, in lockstep with the send-worker's media-capable Buffer adapter (royalti-co social-outbound-unification). All fields are optional, so non-Buffer channels and existing consumers are unaffected.
- fff5fec: Add the multi-window `G-WINDOW-MODEL` contract: a new `./window` export with Zod
  schemas for `WindowDescriptor` (label / kind / surface_set / project_id /
  layout_key) and the cross-window event envelope (`WindowEventEnvelope`,
  `WindowEventTarget`, `WINDOW_TOPICS`, `WINDOW_TARGETED_CHANNELS`). Mirrors the
  Rust structs in `royalti-io/ikenga` (`src-tauri/src/window/`) — round-trip tested
  against shared canonical fixtures on both sides. Additive; no existing export
  changes.

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
