# Components

One product per row, one manifest for the whole bundle. `components.json` at the repository
root is the single place that says what a component is: its row, its entry, its package, its
tools, its skill, how a change is proven, and what documents it owns. The tests read it; the
README table and the patch rows are checked against it. Adding a component is a manifest entry,
a package, a row, a skill, a document and a fixture set — not six unrelated edits.

## What a component is

| Kind | Meaning | Examples |
|---|---|---|
| `product` | An automation product with its own tools and guidance | `l5x`, `ftview`, `mwi`, `optix` |
| `support` | Cross-product material: a corpus, a house-style profile, a routing skill | `engineering-resources` |
| `surface` | A rendering or client surface with no tool schemas and no skill | `viewers` |

A component is not the same thing as a package. `viewers` is one row over two packages
(`packages/viewer`, `packages/ftview-viewer`) because a package registers exactly one browser
bundle. `engineering-resources` is a row with two tools and a skill, but it is not a product.

## Capability classes

The class decides what "verified" means. It is the field that lets a new product join without
pretending it behaves like an existing one.

| Class | How the product is reached | What proves a change |
|---|---|---|
| `offline-file` | A file the vendor writes: `.L5X`/`.ACD`, an ME export folder, a `.mwt` | a new file, then the vendor engine imports or builds it and the result is read back |
| `live-ide` | A running IDE or gateway the plugin talks to | the change is written to the live system and read back from it |
| `gateway-api` | A network API with credentials | a request is accepted and a follow-up read returns the new state |
| `none` | No product: rendering or static resources | nothing to prove beyond the parse and the render |

`offline-file` and `live-ide` are the two in use today. A network product is `gateway-api`, and
it owes an extra thing the local products never needed: a secrets policy. Tokens come from the
host credential service, never from a tool argument, and every result redacts them. That policy
is written before the first `gateway-api` component ships, not after.

## The manifest fields

| Field | Meaning |
|---|---|
| `id` | The row id, stable across releases. Also the patch row. |
| `kind` | `product`, `support` or `surface`. |
| `capability` | The class above; the workflow skill routes by it. |
| `default` | `on` or `off`: whether a fresh install mounts this row. `on` must stay inside the context budget below. |
| `namespace` | The tool-name prefixes the component owns; `null` when it registers no tools. `{ "prefixes": ["ftview_"], "legacy": false }`, or the L5X-only `{ "prefixes": [], "legacy": true, "note": "…" }`. |
| `row` / `rowName` | The patch row and the package entry it mounts (`@aryacode/dsh-engineering/<id>`). |
| `entry` | The bundle entry file that applies the row, or `null` for a surface mounted from the package root. |
| `package` | The package directory (or directories, for `viewers`). |
| `vendored` | `true` when the package ships prebuilt and is not built from this repository (Optix). |
| `vendor` | `true` when `scripts/assemble.mjs` copies the package into `vendor/` for the bundle entry to import; `false` for a pure client surface. |
| `tools.product` | The product label the generated tool inventory uses; `null` when the component registers no tools. |
| `tools.count` | How many tools the component registers. Checked against the inventory for `inReference: true`. |
| `tools.inReference` | `false` when the tools cannot be generated from source here; the README must then state the gap. |
| `skill` | `name`, `file`, `budget` (characters of body, frontmatter excluded) and `allow` (backticked words in the skill that are not tool names). `null` for a surface. |
| `probe` | The capability probe tool a caller should run before the product's real work. |
| `gate` | The tool whose verdict proves a change (`tool` + `why`). |
| `docs` | Documents this component owns. Every path must exist. |

## Context budget

A row that mounts on a fresh install costs every request: the host sends each registered tool's name,
description and parameter schema. `docs/reference/tools.json` measures that surface per group and per
product, and `components.json` records the ceiling:

| Field | Ceiling |
|---|---|
| `defaultOnTools` | The tools a fresh install mounts. Exact: one more default-on tool fails the suite. |
| `defaultOnSchemaCharacters` | The characters of the generated default-on definitions, plus a small allowance for wording changes. |

A component added with `default: "off"` leaves both ceilings where they are. Make one default-on only
by raising the ceiling in the same change, with the measurement in the changelog. The 9 vendored Optix
definitions are not generated from source here, so the character ceiling covers the 133 generated
definitions while the tool ceiling covers every default-on tool.

## Adding a component

1. **Create the package** under `packages/<id>` with `src/index.ts` (tool factories),
   `src/skill.ts` (registration) and `SKILL.md`. Copy an existing package's `package.json`,
   `tsconfig.json` and test setup; never edit `packages/l5x` to host another product. Every tool the
   package registers takes one of its `namespace` prefixes (`tia_`, `ftview_`, …); a new component
   never adds an unprefixed tool name.
2. **Add the bundle entry** `entries/<id>.js` that applies the package's entries with the
   row's config, and the export `"./<id>"` in the root `package.json` `exports`. Decide the
   component's `default` posture here: `off` unless the change raises the context budget for it.
3. **Add the patch row** in `cordis.patch.yml` with `id: <id>` and
   `name: '@aryacode/dsh-engineering/<id>'`. The patch only inserts; never target another
   bundle's row.
4. **Write the skill** (`SKILL.md`) as a decision tree, not tool documentation: the choice
   table, the safety boundary and the order of operations. Depth goes in `docs/` and is linked.
   Keep the body inside its budget.
5. **Write the capability probe first.** Every product ships one (`studio_sdk_status`,
   `ftview_capabilities`, `mw_ide_status`, `optix_status`); it answers "can this work here?" and
   the tool results stay honest when it cannot.
6. **Name the evidence gate** — the tool whose verdict proves a change. A component whose
   change cannot be proven is `read-only`, and the README says so.
7. **Add the manifest entry** to `components.json` and a row to the README tables.
8. **Add a document** under `docs/` for the product's port decisions or usage, and list it in
   the manifest.
9. **Add fixtures** under `packages/<id>/test/fixtures` from a real export, and tests for the
   probe, the gate and the skill registration.
10. **Run the checks**: `node --import tsx --test test/components.spec.mjs` (manifest, rows,
    skills, budgets, stale tool names, tool counts, documents), `pnpm docs:tools`, and the full
    bundle suite.

## Templates

A new product `<id>` starts from five files. Copy the nearest existing package rather than
inventing a variant; the checks below enforce the shapes.

`packages/<id>/package.json`

```json
{
  "name": "@aryacode/dsh-engineering-<id>",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" },
    "./skill": { "types": "./lib/skill.d.ts", "default": "./lib/skill.js" }
  },
  "engines": { "node": "^22.19.0 || >=24.0.0" },
  "files": ["SKILL.md", "lib/**/*.js", "lib/**/*.d.ts"],
  "scripts": { "build": "tsc -p tsconfig.json", "typecheck": "tsc -p tsconfig.json --noEmit", "test": "vitest run" },
  "dsh": { "component": true },
  "private": true
}
```

`packages/<id>/src/skill.ts`

```ts
export const name = '<id>-skill'
export const inject = ['skills'] as const
export const SKILL = { name: '<skill-name>', description: '…', whenToUse: '…' } as const

export function apply(ctx: SkillContext): void {
  const skills = ctx.get('skills') as SkillRegistry | undefined
  if (skills === undefined || typeof skills.register !== 'function') throw new Error('<id>-skill: the skills service is unavailable')
  const path = fileURLToPath(new URL('../SKILL.md', import.meta.url))
  const content = readFileSync(path, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
  skills.register({ ...SKILL, content, path, source: 'custom', provider: '@aryacode/dsh-engineering-<id>', invocation: { modelInvocable: true, userInvocable: true } })
}
```

`packages/<id>/SKILL.md` starts with the same frontmatter the registration strips:

```md
---
name: <skill-name>
description: One sentence on what this product's guidance covers.
whenToUse: Use when the user asks about <the product's nouns>.
---

# <Product> engineering
```

`entries/<id>.js` — one row mounting the surfaced parts:

```js
import * as tools from '../vendor/<id>/lib/index.js'
import * as skill from '../vendor/<id>/lib/skill.js'

export const name = 'engineering-<id>'
export const inject = ['tools']

export function apply(ctx) {
  ctx.plugin(tools)
  ctx.plugin(skill)
}
```

`components.json` — the manifest entry the checks read:

```json
{
  "id": "<id>",
  "title": "<Product>",
  "kind": "product",
  "capability": "offline-file",
  "default": "off",
  "namespace": { "prefixes": ["<prefix>_"], "legacy": false },
  "row": "<id>",
  "rowName": "@aryacode/dsh-engineering/<id>",
  "entry": "entries/<id>.js",
  "package": "packages/<id>",
  "vendor": true,
  "tools": { "product": "<Product>", "count": 0, "inReference": true },
  "skill": { "name": "<skill-name>", "file": "packages/<id>/SKILL.md", "budget": 8000, "allow": [] },
  "probe": "<id>_status",
  "gate": { "tool": "<id>_verify", "why": "state what this verdict proves" },
  "docs": ["docs/port/<id>.md"]
}
```

Then add the patch row (with `disabled: true` when the component's `default` is `off`), the
`scripts/assemble.mjs` COMPONENTS entry, a README table row and the document the manifest names. The
checks fail on whichever one is missing.

## What the checks enforce

`test/components.spec.mjs` reads this manifest and fails on:

- a manifest id without a patch row, or a patch row without a manifest entry
- a row name that does not match the component's `rowName`
- a missing entry file, package directory or document
- a skill file missing, a body over its budget, or a budget shared by two skills
- a backticked word in a skill body that is neither a tool name nor in that component's `allow`
  list — this is what catches a renamed tool before a model tries to call it
- a tool inventory product that no component claims, a claimed product with no groups, or a
  `tools.count` that disagrees with the inventory
- a README that does not state the total tool count, or a product row whose number is stale
- a vendored component whose tools are absent from the reference without the README saying so
- a component whose `default` and its patch row's `disabled` disagree
- a tool name outside its component's namespace, a shared or ambiguous prefix, or a second component
  claiming the L5X legacy exemption
- a fresh install above the recorded tool or character budget

The per-skill budgets are policy, not physics: a body costs about a token per four characters
each time the skill is invoked. The current product pair (`rockwell-l5x` 7,981 and
`factorytalk-view` 7,975 characters) costs roughly 4k tokens together; a routing skill should
stay near 3k so a three-skill task stays near 6k. Raise a budget only with a measurement.

## Growth policy

The bundle grows one product row at a time, and one install surface stays the default. Split a
product out only when one of these is true:

- **Licensing or IP.** The component cannot ship under this repository's licence or maintainer.
- **A different host line.** It needs a DSH or Cordis version this bundle's peer range cannot ride.
- **A heavy optional payload.** It carries an SDK, runtime or dataset most users will not install.
- **An independent cadence.** It cannot follow this bundle's release train.

Then ship an **add-on bundle**, not a separate product plugin: its own package with its own
`dsh.bundle.patch`, its own rows (ids namespaced for the domain, e.g. `cad-*`), and its own component
manifest and checks. A profile may hold several bundle layers, so the Plugins page still lists every
row, and only the users who need the add-on install it. An add-on inserts its own rows only — it never
targets a core row, because an absent row fails composition. Cross-product joins stay in the core
bundle: a join needs both components present. CAD is the first candidate; the README's "CAD mounts as
an independent plugin" stays true — it would be that add-on bundle.

Release cadence follows the one-version-per-batch rule in [`AGENTS.md`](../../AGENTS.md): the bundle is
only cheaper than separate plugins while each release carries a batch of changes.
