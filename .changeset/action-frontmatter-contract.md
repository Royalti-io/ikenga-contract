---
"@ikenga/contract": minor
---

Publish the skill-action frontmatter contract: a new `./action-frontmatter`
export with Zod schemas for `ActionFrontmatter` and its sub-schemas
(`DomainEnum`, `UxModeEnum`, `RunBinding`, `Trigger`, `CapabilityEnum`,
`SetupSpec`). This is the source-of-truth shape for an Atelier skill *action*'s
YAML frontmatter (the block between the leading `---` fences of an
`actions/*.md` file). Mirrors the Rust loader in `royalti-io/ikenga`
(`src-tauri/src/pkg/skill_actions.rs`) — same lockstep convention as
manifest.ts ↔ manifest.rs. Conformance-tested against every installed Atelier
action file. Additive; no existing export changes.
