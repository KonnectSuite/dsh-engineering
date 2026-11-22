# Component scaffold

A copyable skeleton for a new component in `@aryacode/dsh-engineering`. It is
**not mounted**: no row, no entry, no manifest entry, no vendor payload. It is a
starting point, not a live component, and nothing under this directory is
loaded by the bundle until you wire it (steps below).

Copy the directory, rename the placeholders, then follow the checklist. The
authoritative long-form checklist with templates also lives in
[`docs/reference/components.md`](../../docs/reference/components.md); this page
is the short version you can follow while editing.

## What to rename after copying

| Place | Placeholder | Rename to |
|---|---|---|
| `package.json` | `@aryacode/dsh-engineering-scaffold` | `@aryacode/dsh-engineering-<id>` |
| `package.json` | version `0.1.0` | the first version you actually ship |
| `src/index.ts` | `engineering-scaffold-example` | `engineering-<id>` (the entry `name`) |
| `src/index.ts` | `example_capabilities` | `<prefix>_capabilities` (the probe) |
| `src/index.ts` | `scaffold` comments | the component id |
| `SKILL.md` | `scaffold-example` | `<id>` skill name |
| `test/smoke.spec.mjs` | `engineering-scaffold-example` | the copied entry name |

## Wiring checklist

Everything below is a file in the repository; the scaffold does not add any of
them for you.

1. **Copy and rename.** `git mv packages/_scaffold packages/<id>`, then the table above. Do not leave the directory named `_scaffold` for a live component.
2. **Entry** — add `entries/<id>.js`. Import the built vendor entry and its skill
   registration, export `name` (`engineering-<id>`), `inject` (`['tools']`,
   plus `'fs'` when the component reads files), `Config` when the row has
   switches, and `apply(ctx)` that mounts the parts. The pattern is in
   [`docs/reference/components.md`](../../docs/reference/components.md) and in
   an existing `entries/*.js`.
3. **Root `package.json`** — add `"./<id>": "./entries/<id>.js"` to `exports`.
   A product row also appears in `files` only through its vendor copy; the root
   `files` list already ships `vendor/**`.
4. **Patch row** — add the row to `cordis.patch.yml` under the existing insert
   block, with `disabled: true` when the row ships off. The patch only inserts;
   never target another bundle's rows. Add the row id to the list in
   `test/patch.spec.mjs` when that list is maintained by hand.
5. **Manifest** — add the component to `components.json`: `id`, `title`, `kind`,
   `capability`, `default`, `stability`, `since`, `requires`, `verified`,
   `stabilityNote`, `namespace`, `row`, `rowName`, `entry`, `package`,
   `tools {product, count, inReference}`, `skill {name, file, budget}`, `probe`,
   `gate {tool, why}`, `docs`, and `vendor` when it is vendored. `pnpm docs:tools`
   and the full suite check this entry against the patch, the package and the
   tools.
6. **Assembler** — add the package name to `COMPONENTS` in
   `scripts/assemble.mjs` when the component is vendored, and extend the payload
   copy in that script if the package ships directories other than the standard
   tree (`knowledge/`, templates, schemas). The assembler refuses a `lib/` older
   than its `src/`.
7. **Tool reference** — export the package's tool list from its `src/tools/`
   modules, import it in `scripts/gen-tool-reference.ts`, add a `GROUPS` entry
   (group, product, blurb), extend the `product` union if this is a new product
   name, and add the tools to the collection the generator reads. Then run
   `pnpm docs:tools`; `pnpm docs:check` fails on drift.
8. **Skill** — give `SKILL.md` real front matter (`name`, `description`,
   `whenToUse`) and register the skill from `src/skill.ts` with the content,
   path and budget the manifest claims. Keep the budget within the manifest
   value; `test/components.spec.mjs` checks bodies, budgets and namespaces.
9. **Docs and locales** — add the row to the README component table and the
   switch table, add a `docs/products/<id>.md` page (or extend an existing one
   when the component joins a product), and add any user-visible strings to
   `locale/en.json` and `locale/zh.json` together.
10. **Tests** — add the package's own `test/*.spec.mjs` or vitest suites, add a
    root spec when the row needs one, and add that root spec to the `BUNDLE`
    list in `scripts/test.mjs` (that script fails the run when a `test/*.spec.mjs`
    is not in its list). Then run `pnpm -r build`, `pnpm docs:tools`,
    `pnpm check:package` and `pnpm test`.

## Rules of thumb

- A row is live only when the patch row, the entry, the manifest entry and the
  vendor payload agree. Until then the scaffold is dead code for the bundle.
- One component, one reason to be split. Do not carve a package out on a whim;
  the growth policy in `docs/reference/components.md` says when a split is
  justified.
- Never ship vendor bytes and never point a `requires` entry at software the
  target machine does not run. Mark not-runnable evidence as not-runnable; the
  release note and `stabilityNote` must say so.
