# Decision: the knowledge plane is source, not a runtime package

- Status: accepted (this change)
- Supersedes: the plan's assumption that a `packages/knowledge` workspace
  package can be vendored like the product components.

## Context

The plan adds a shared retrieval layer used by the documentation tools of the
L5X, FactoryTalk View, migration, PLC-5 and SLC 500 products. It proposed a
`packages/knowledge` package that each product imports as a workspace
dependency.

The repository's packaging contract makes that shape unshippable:

- `test/docs.spec.mjs` rejects `workspace:`, `file:`, `link:` and `git:`
  dependency specifications anywhere in the workspace, so a product cannot
  declare the package that way.
- `scripts/check-package.mjs` (PKG-07/PKG-08) requires every vendored runtime
  dependency to be a registry dependency with the same range in the root
  manifest, and rejects bare imports from shipped vendor libraries that the root
  package does not declare.
- The tarball's `files` list ships `vendor/`, not `packages/`, and
  `scripts/assemble.mjs` copies only the packages named in its `COMPONENTS`
  list.
- A profile dependency that never publishes to the registry would be installed
  from nowhere, so the resolved shape has to be inside the product payloads
  themselves.

The earlier attempt to ship Optix skills as a separate payload directory is the
precedent for what goes wrong when a runtime path is assumed but not copied: the
0.99.0 tarball answered `optix_list_skills` with an empty list because
`vendor/optix/skills/` was missing.

## Decision

`packages/knowledge/` is a **source library with no `package.json`**. Its
`src/core.ts` and `src/html.ts` are copied by
`scripts/sync-knowledge-lib.mjs` into each consuming product package at
`src/knowledge/`, committed there, and compiled by that package's own `tsc`
build. `--check` compares bytes and fails on a stale copy.

Every product therefore ships its own compiled copy of the retrieval core under
`lib/`, exactly like the rest of its code. No new dependency, no new workspace
package, no registry publication, and the existing `pnpm check:package` gate
keeps working unchanged.

The committed index files live inside each product's payload
(`packages/<product>/knowledge/`), and `scripts/assemble.mjs` copies the
`knowledge` directory into `vendor/<product>/knowledge/`. Runtime resolution is
`new URL('../knowledge/', import.meta.url)` from the built `lib/docs.js`, which
is the same directory in the repo and in the tarball.

## Consequences

- The core has one source of truth but N compiled copies; a stale copy is a
  test failure (`test/knowledge-packaging.spec.mjs`), not a silent drift.
- The package cannot use product-specific types; the contract in
  `packages/knowledge/CONTRACT.md` is structural and generic.
- Adding a sixth consumer means adding it to the sync script's consumer list and
  to its package build order; it does not change the tarball's dependency
  graph.
- The retrieval core is part of the product's MIT-licensed source. Vendor help
  bodies are never copied into the repository: committed indexes carry
  identifiers, titles, sections and relative help paths only, and `read` for an
  installed-help collection parses the local installation at call time. This is
  the licensing posture owner decision D1 records, restated for the smaller
  package.
