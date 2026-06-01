---
"@ikenga/contract": patch
---

Adopt Changesets for versioning + release. Contributors now run `npx changeset`
with each change to declare the bump (patch/minor/major); the version and
CHANGELOG are derived from those entries and published by CI on merge of the
"Version Packages" PR, replacing the previous tag-triggered publish flow.
