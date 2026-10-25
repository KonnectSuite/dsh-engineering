# Handoff — collapsing the engineering bundle to one package

**Status:** phase 4 published (`@aryacode/dsh-engineering@0.3.0` is live) · phase 2 (single client
bundle) is the only work left · branch `refactor/one-package` is **not merged** to `main`

Read this before touching the repository. It records what was decided and why, so the next session
does not rediscover the constraints.

---

## 1. Objective

The user's requirement, in their words:

> I wanted one plugin I install, I get all these engineering skills/tools that I can toggle on and off
> depending on which ones I need. Plugin grows as more engineering features gets added. I don't want
> 10 different engineering plugins.

Everything below is measured against that. "One plugin" means: **zero** `@aryacode/dsh-engineering-*`
packages in `dependencies`. A bundle plus component dependencies is not the goal.

## 2. Current state

| Phase | State |
|---|---|
| 1 — vendor the server components into one package | ✅ done |
| 2 — merge both client faces into one bundle | ❌ **remaining** |
| 3 — tests | ✅ 16/16 (`pnpm test`) |
| assemble + pack | ✅ 281 entries, 661 kB, assets verified |
| 4 — publish | ✅ `0.3.0` live on npm |

Published manifest (verified from the registry):

```
@aryacode/dsh-engineering@0.3.0    281 files   2.1 MB unpacked
dependencies:
  @deepseek-ai/dsh-tool-ft-optix            = <github release tarball>
  @aryacode/dsh-engineering-l5x-viewer      = 0.1.2   ← must go
  @aryacode/dsh-engineering-ftview-viewer   = 0.1.2   ← must go
```

`dsh-engineering-l5x`, `-ftview` and `-mwi` are **vendored** into `vendor/` and are no longer
dependencies. Inside the package each keeps its whole tree (`vendor/<name>/lib`, `SKILL.md`,
`studio-bridge/`, `bridge/`, `code/`).

## 3. Why the two viewers are still separate packages

A client bundle registers itself with the shell under a key equal to **its own package name**:

```js
window.__ModuleLoader__.register({ id: '@aryacode/dsh-engineering-l5x-viewer', factory })
```

`packages/l5x/tsdown.client.config.ts` says this explicitly:

> The bundle id is the package name, which is the profile channel's contract: a mismatch registers
> under a key the shell never asks for, presenting as a plugin that loaded and drew nothing rather
> than as an error.

One package therefore gets **one** client bundle. Two viewer packages today, two factories, two ids.

### The FTView viewer has no source

Established this session, do not re-investigate:

- `packages/ftview-viewer/src/index.ts` is the entire source tree — two lines, `export function apply(): void {}`
- `lib/client.js` (36,309 B) is a **committed build artifact**, added by commit `9fb6cfa`
  ("Fold the FTView display preview into the bundle"); no `src/client/` ever existed
- the origin repo is `KonnectSuite/dsh-tool-factorytalk-view` (private, **archived**), whose
  `client.js` is 36,301 B — 8 bytes fewer, consistent with a different embedded package id
- the AryaAI checkout at `C:\Users\KNPhu\.arya\github\KonnectSuite\AryaAI` has no matching package
  (`packages/client/` holds `ui-sidebar-documentpreview`, unrelated)
- the user has said **no** to digging through that repo's history

So the FTView face will not be re-authored from source. It must be **wrapped**.

## 4. The remaining task

### 4.1 Inspect the factory

```pwsh
# it is a closure: ({ … }) that ends with a register/factory call
Get-Content packages/ftview-viewer/lib/client.js -TotalCount 40
Get-Content packages/ftview-viewer/lib/client.js -Tail 20
```

Identify the factory function it registers and what services it expects from `ctx`. Its leading
comment says it is presentation only: it decodes the export the document preview already read,
renders graphics at exported geometry, and falls back to raw XML. Its inject list is recorded in
`packages/ftview-viewer/package.json` → `dsh.client.inject`:

```
@deepseek-ai/dsh-client-locale
@deepseek-ai/dsh-client-ui-sidebar-documentpreview
@deepseek-ai/dsh-client-ui-slots
```

The ladder viewer's inject list (`packages/viewer/package.json`) is longer — the merged entry must
export the **union** of both.

### 4.2 Write the shim

`packages/dsh-engineering/src/client/ftview-factory.ts` (or `.js`) exporting the vendored factory as
a callable `(ctx) => void`. Mechanical wrapping only — do not re-implement behaviour.

### 4.3 Write the merged client entry

```ts
// packages/dsh-engineering/src/client/index.ts
import { apply as ladder } from '../../../viewer/src/client/index.ts'

export const inject = [
  /* union of both dsh.client.inject lists */
]

export function apply(ctx: Context): void {
  ladder(ctx)
  ftview(ctx)
}
```

### 4.4 Add the client build config

Copy `packages/l5x/tsdown.client.config.ts` and change `ID` to `@aryacode/dsh-engineering`. Keep its
`MODULE_TABLE` externals list intact — anything the shell's frozen module table answers must stay an
external `require(...)`; anything else must be inlined or the factory throws at materialization.

Wire it into the bundle's `scripts` (`build:client`) and add `lib/client.js` to `files`.

### 4.5 Manifest changes

```jsonc
// packages/dsh-engineering/package.json
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": { "platform": "web", "inject": [ /* union */ ] }
},
"exports": { "./client": "./lib/client.js", /* existing subpaths unchanged */ }
```

Remove both `@aryacode/dsh-engineering-*-viewer` entries from `dependencies`.

The two viewer **rows** in `cordis.patch.yml` stay exactly as they are — they still name
`@aryacode/dsh-engineering-l5x-viewer` and `-ftview-viewer` for the *host* half. Only the browser
half is being merged. Re-read §5.6 before assuming otherwise.

### 4.6 Verify — this is the step that matters

1. `pnpm test` → 16/16
2. `pnpm assemble && pnpm pack` → confirm `lib/client.js` is in the tarball
3. **Install and look at the app**: the ladder preview *and* the FTView display preview must both
   render. A missing face presents as a plugin that loaded and drew nothing — no error anywhere.
4. Only then: publish `0.3.1`, confirm `dependencies` has **no** `@aryacode/` entries
5. Then deprecate `-l5x`, `-ftview`, `-mwi`, `-l5x-viewer`, `-ftview-viewer`

## 5. Constraints and traps learned the hard way

### 5.1 `workspace:` must never reach the registry

`npm publish` **cannot** rewrite `workspace:*`; it fails. `pnpm publish` rewrites it. This is why
`@aryacode/dsh-engineering` was missing from npm for months while its five components were published:
only the leaves could be published.

Check after any publish:

```
npm view @aryacode/dsh-engineering@<v> dependencies   # must show versions, never workspace:
```

### 5.2 Staged publishing

The npm account uses **staged publishing**. `npm publish` can exit 0 while the version is only
*staged* — `npm view … versions` will not list it. Approval is UI-only
(npmjs.com → Staged Packages); this npm has no `npm stage` command.

Consequence: never treat a publish exit code as evidence. Read the registry.

Publishing over a staged version fails with
`409 Cannot publish over previously staged version`.

### 5.3 A zero exit code is not an outcome

This bit twice in one session: a packaging run exited 0 and produced an installer that never launched;
a publish exited 0 and produced nothing installable. Always verify the artefact, not the status.

### 5.4 BOM breaks JSON loaders

PowerShell `Set-Content -Encoding UTF8` writes a **BOM**; `JSON.parse` throws on it. A plugin loader
that catches parse errors reports only a generic warning, so the symptom is silence — a file that
exists, is valid-looking, and is ignored.

Write JSON as:

```pwsh
[IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding($false)))
```

### 5.5 Vendored trees must keep their relative layout

Flattening components into a shared `lib/` breaks:
- `SKILL.md` lookups (a skill module resolves `../SKILL.md` from its own package root)
- `studio-bridge/**` (.NET sources + csproj) for L5X
- `bridge/**` and `code/**` (COM bridge, Python saved-model engine) for MotionWorks IEC

`scripts/assemble.mjs` copies whole trees for this reason. `vendor/` is gitignored.

### 5.6 Client bundle registration is per package

See §3. Do not assume two faces can share a package without a merged factory.

### 5.7 The Optix row

`cordis.patch.yml` previously named `@aryacode/dsh-tool-ft-optix`, but the dependency is
`@deepseek-ai/dsh-tool-ft-optix` (a GitHub release tarball). It is fixed — rows must name packages
that actually exist, or the row silently fails to mount.

### 5.8 `onDemand` stays `false`

Bounded on-demand discovery was measured against eager exposure and rejected: discovery cost more
turns than the schema characters it saved. The context win comes from per-product switches and from
splitting surfaces into rows.

## 6. Repository reference

```
packages/dsh-engineering/          ← the published package (no source of its own yet)
  cordis.patch.yml                   policy block + 17 rows
  package.json                       exports, files, private components
  scripts/assemble.mjs               vendors built components into vendor/
  vendor/                            gitignored build output
packages/l5x/                      ← vendored; source of 35 tools
  src/{index,skill,editing,live,studio}.ts
  tsdown.client.config.ts            the client-bundle config to copy
  studio-bridge/
packages/ftview/                   ← vendored; 14 tools
packages/mwi/                      ← vendored; 24 tools, bridge/ + code/
packages/viewer/                   ← ladder viewer: HAS source (6 files in src/client/)
packages/ftview-viewer/            ← FTView preview: NO source, only lib/client.js
```

Build order for a release:

```pwsh
pnpm install
pnpm --filter @aryacode/dsh-engineering-l5x build
pnpm --filter @aryacode/dsh-engineering-ftview build
pnpm --filter @aryacode/dsh-engineering-mwi build
pnpm test          # 16 checks
pnpm assemble      # vendors the three trees
pnpm pack          # inspect: SKILL.md, studio-bridge, bridge, code all present
```

## 7. Verification checklist before publishing anything

- [ ] `pnpm test` → 16 pass, 0 fail
- [ ] `pnpm pack` tarball contains `vendor/*/SKILL.md`, `vendor/l5x/studio-bridge/*.csproj`,
      `vendor/mwi/code/engine/**`
- [ ] `lib/client.js` present and registers under `@aryacode/dsh-engineering`
- [ ] `dependencies` has no `@aryacode/` entries
- [ ] **Both client faces render in the running app** — not just "no error"
- [ ] After approval: `npm view … versions` lists the new version and `dependencies` shows real ranges

## 8. Beyond this task

State of the wider product, in case the next session is picked up cold:

- **AryaCode 0.1.2** is published and installs: unsigned, `~/.aryacode` isolated from AryaAI,
  market + Better Sidebar seeded on first run, auto-update verified end to end
  (release `nightly` on `KonnectSuite/AryaCode`; feed at
  `konnectsuite.github.io/dsh-desk/c97bddeafd20806d179b3053ca4b38d0/feeds/win-x64/nightly.yml`)
- **Market** catalogue is 15 entries, all linking to GitHub rather than npm
- **Arya pet** ships as a custom pet for `@michengai/dsh-codex-pet`; artwork preserved at
  `KonnectSuite/arya-pet`
- **Untouched original goal**: presets and the token budget (the ~60k preload). Still the reason the
  project started.

## 9. Open decisions for the user

1. Merge `refactor/one-package` → `main` (npm currently does not match `main`)
2. Unarchive `KonnectSuite/dsh-tool-factorytalk-view` — its output ships in the bundle but the repo is
   read-only, so the FTView face cannot be fixed at origin
3. `@deepseek-ai/dsh-tool-ft-optix` is fetched from a GitHub release tarball rather than the registry:
   it cannot be updated by semver and breaks if that asset moves
4. Deprecate the stale `0.0.0-stage` versions that sit on all six packages
