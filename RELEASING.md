# Releasing @ikenga/contract

> Contributing in general? See the org-wide [CONTRIBUTING guide](https://github.com/Royalti-io/.github/blob/main/CONTRIBUTING.md) and [ikenga.dev/docs/contributing](https://ikenga.dev/docs/contributing). This file covers **releases** only.

## Releases — Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) for
versioning and publishing. **Every PR that changes published behaviour must
include a changeset.**

```bash
npx changeset          # pick patch / minor / major + write a summary
git add .changeset
```

- **patch** — bug fixes, internal-only changes
- **minor** — new backward-compatible features (new exports, new schema fields)
- **major** — breaking changes (removed/renamed exports, incompatible schema)

On merge to `main`, CI opens a **"chore: version packages"** PR that applies the
accumulated changesets (bumps the version + updates `CHANGELOG.md`). Merging
that PR publishes the new version to npm with provenance and creates a GitHub
Release. Don't hand-edit `version` in `package.json` or push `v*` tags manually
— Changesets owns that now.
