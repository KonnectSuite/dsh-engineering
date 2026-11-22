# Adding a component from the scaffold

`packages/_scaffold/` is a copyable skeleton for a new component in this
bundle. It is deliberately **not mounted**: it has no `components.json` entry,
no `cordis.patch.yml` row, no `entries/` file and no vendor payload, so the
bundle ignores it. `scripts/test.mjs` only runs `test/*.spec.mjs` files listed
in its `BUNDLE`, and the scaffold's smoke test lives under its own package, so
the repository suite is unchanged by its presence.

## What the skeleton is

```
packages/_scaffold/
  README.md          the copy-and-wire checklist (start here)
  package.json       @aryacode/dsh-engineering-scaffold, private, no dsh block
  tsconfig.json      the repository's compiler options, dependency-free
  src/index.ts       a dependency-free plugin shape with a placeholder probe
  SKILL.md           template skill front matter and body
  test/smoke.spec.mjs  placeholder checks; the built-lib check is skipped until build
```

The skeleton compiles with no dependencies because `src/index.ts` declares the
small host shape locally and does not import a package that does not exist yet.
A copied component replaces those local types with the host imports it actually
uses, adds `devDependencies` (`typescript`, and `@types/node` once it touches
Node APIs), and builds with `tsc -p tsconfig.json`.

## Copying it

1. `git mv packages/_scaffold packages/<id>`; do not ship a live component in a
   directory called `_scaffold`.
2. Rename the placeholders listed in `packages/_scaffold/README.md` (package
   name, entry name, probe tool, skill name).
3. Follow the checklist in that README: entry file, root `exports`, patch row,
   `components.json` entry, `scripts/assemble.mjs` `COMPONENTS` and payload,
   `scripts/gen-tool-reference.ts` import/`GROUPS`/product union, README and
   product docs, `locale/*.json`, tests and the `BUNDLE` list.
4. Run `pnpm -r build`, `pnpm docs:tools`, `pnpm check:package` and `pnpm test`.

## Checking the skeleton in place

The scaffold typechecks without a package install, using the TypeScript
compiler already in the workspace:

```sh
node packages/resources/node_modules/typescript/bin/tsc -p packages/_scaffold/tsconfig.json --noEmit
```

After `pnpm install` / copying, the package's own scripts are `build`,
`typecheck` and `test`. The smoke test skips the built-lib assertion until
`lib/index.js` exists, so an unbuilt skeleton never reports a false failure.

## Where the long-form checklist lives

`docs/reference/components.md` owns the component contract: the ten wiring
steps, the templates for `package.json`, `src/skill.ts`, `SKILL.md`,
`entries/<id>.js` and the manifest entry, the checks `test/components.spec.mjs`
enforces, and the growth policy for when a new package is justified. The
scaffold README is the edit-time short version; that page is the contract.

A row becomes live only when the patch row, the entry, the manifest entry and
the vendor payload agree. Until then the scaffold is dead code and must not be
advertised anywhere.
