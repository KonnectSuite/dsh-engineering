# Architecture

How the engineering bundle composes, what each row owns, and how the packaged artifact is built.
The [README](../README.md) owns the product overview; this page owns the internal contract.

## Repository layout

```
package.json              bundle manifest: dsh.bundle.patch, dsh.client, dependencies, peer range
cordis.patch.yml          the loader layer: one policy override + the inserted rows
lib/index.js              host half: an entry that registers nothing (see "Client faces")
lib/client.js             the bundle's one browser half: ladder + ME display previews (generated)
scripts/build-client.mjs  builds lib/client.js from the two committed face bundles
packages/l5x              host tools (read, references, checks, drafts, studio, controller, live),
                          the rockwell-l5x skill, the PLC trend client face
packages/viewer           ladder viewer: the committed face bundle lib/client.js
packages/ftview           host tools (read, edit, studio), the factorytalk-view skill
packages/ftview-viewer    ME display preview: the committed face bundle lib/client.js
scripts/gen-tool-reference.ts   generated tool reference and inventory
test/                     patch, docs, tool-reference, manifest and client-face tests
```

The three host components are vendored into `vendor/`, so the published package is self-contained:
its only dependency is the Optix component. The two face packages are build inputs, not
dependencies — their built bundles are folded into `lib/client.js`.

## Row model

The patch inserts sixteen rows with stable ids. Ids are the contract: a profile, a patch or the
Plugins page addresses a row by id, so the implementation behind a row can be rebuilt without
resetting the user's enabled state.

| id | package entry | default |
|---|---|---|
| `l5x-read` | `dsh-engineering-l5x` | on |
| `l5x-read-skill` | `dsh-engineering-l5x/skill` | on |
| `l5x-editing` | `dsh-engineering-l5x/editing` | off |
| `l5x-studio` | `dsh-engineering-l5x/studio` | off |
| `l5x-live` | `dsh-engineering-l5x/live` | off |
| `viewers` | `@aryacode/dsh-engineering` (its own client face) | on |
| `ftview-read` | `dsh-engineering-ftview` | on |
| `ftview-read-skill` | `dsh-engineering-ftview/skill` | on |
| `ftview-edit` | `dsh-engineering-ftview/edit` | on |
| `ftview-studio` | `dsh-engineering-ftview/studio` | on |
| `mwi-session` | `dsh-engineering-mwi` | on |
| `mwi-read` | `dsh-engineering-mwi/read` | on |
| `mwi-read-skill` | `dsh-engineering-mwi/skill` | on |
| `mwi-verify` | `dsh-engineering-mwi/verify` | on |
| `mwi-edit` | `dsh-engineering-mwi/edit` | off |
| `optix` | `@aryacode/dsh-tool-ft-optix` | on |

Rows are split by cost, not by product alone. The L5X read surface is eager; drafts, SDK builds and
live reads are opt-in because each adds schemas a read-only profile never uses. FactoryTalk View is
small enough that its read, edit and Studio entries default on. MotionWorks IEC keeps session, read
and verify eager and its seven edit tools opt-in, because those schemas are the largest in the bundle.

Each plugin defines `inject`, so a row that needs a service the profile does not provide fails to
mount instead of running degraded:

| Entry | Injects |
|---|---|
| `dsh-engineering-l5x` | `tools`, `fs` |
| `dsh-engineering-l5x/editing` | `tools`, `l5xProjects` (provided by the read entry) |
| `dsh-engineering-l5x/studio` | `tools`, `l5xProjects` |
| `dsh-engineering-l5x/live` | `tools`, `l5xProjects` |
| `dsh-engineering-l5x/skill` | `skills` |
| `dsh-engineering-ftview` | `tools`, `fs` |
| `dsh-engineering-ftview/edit` | `tools`, `fs`, `ftviewViews` (provided by the read entry) |
| `dsh-engineering-ftview/studio` | `tools`, `fs`, `ftviewViews` |
| `dsh-engineering-ftview/skill` | `skills` |
| `dsh-engineering-mwi` | `tools` |
| `dsh-engineering-mwi/read` | `tools` |
| `dsh-engineering-mwi/verify` | `tools` |
| `dsh-engineering-mwi/edit` | `tools` |
| `dsh-engineering-mwi/skill` | `skills` |
| `@aryacode/dsh-tool-ft-optix` | `tools` |
| `l5x` trend card | `slots`, `locale`, `remote` |
| `viewers` client face | `slots`, `locale`, `documentPreviews`, `remote`, `remote.workspaceFiles` |

The read entries provide their handle services (`l5xProjects`, `ftviewViews`) so a draft reuses the
open export instead of reading it twice. A chat's handles are scoped to that chat.

## Tool-exposure policy

The patch targets the existing `tool-capability-policy` row instead of inserting a second one:

```yaml
- id: tool-capability-policy
  config:
    policyOnly: true
    toolPolicy:
      onDemand: false
      capabilities:
        - skill: rockwell-l5x
          tools: [ ...35 exact L5X tool names... ]
          prefixes: [l5x_]
        - skill: factorytalk-view
          prefixes: [ftview_]
        - skill: motionworks-iec
          prefixes: [mw_]
```

The policy matches a registered tool by exact name or by prefix. The rebuilt L5X tools use
descriptive names (`open_project`, `draft_apply`, …), which is why the capability lists them
exactly; `l5x_` remains linked for any future prefixed tool. The FactoryTalk View and MotionWorks
tools are already prefixed.

`policyOnly: true` means the policy row does not register tools of its own; it only filters the
registry. `onDemand: false` preserves the product-wide eager exposure: a tool that is on is visible
without a discovery call.

The generated inventory (`docs/reference/tools.json`) is the machine-readable list of registered
tools. `test/tool-reference.spec.mjs` fails when a tool is not governed by a capability, when a
capability names an unknown tool, or when the reference is stale.

## Configuration

Every host entry accepts a validated config from the profile or a patch:

| Entry | Options | Defaults |
|---|---|---|
| `l5x-read` | `maxFileBytes` | 64 MiB |
| `l5x-editing` | `maxFileBytes`, `maxDraftOperations` | 64 MiB, 200 |
| `l5x-studio` | `maxFileBytes` | 64 MiB |
| `l5x-live` | `enabled`, `minIntervalMs`, `defaultIntervalMs`, `maxTags`, `maxSamples` | true, 50 ms, 200 ms, 16, 1200 |
| `ftview-read` | `maxFiles` | 2000 |
| `ftview-edit` | `maxDraftOperations` | 100 |
| `ftview-studio` | `searchRoots` | the two Rockwell Programs folders |

Example override in a profile patch:

```yaml
- id: l5x-live
  config:
    maxTags: 8
```

The controller tools take no separate config; approval policy comes from the session, and the
entry's availability comes from the row.

## Client faces

A package registers exactly **one** client bundle, keyed by the package name the Shell resolves from
the mounted row. A second registration under another id is never asked for, and the failure presents
as a plugin that loaded and drew nothing rather than as an error — so `@aryacode/dsh-engineering`
carries both engineering previews in its single `./client` bundle:

- the ladder viewer renders rungs for an L5X routine opened from the workspace;
- the ME display preview draws an exported display instead of its XML.

`scripts/build-client.mjs` produces that bundle from the two committed face bundles in
`packages/viewer/lib` and `packages/ftview-viewer/lib`. Each face body is copied verbatim into its
own closure inside the one registration — both declare their own `React` binding, document-preview
id, stylesheet text and helpers — and the merged plugin exports the union of the two faces'
`inject` lists and an `apply` that runs both. Nothing is re-authored, retransformed or re-hashed: the
FTView face has no source anywhere, so its closure bundle is the only form it exists in.

Two consequences worth stating:

- **One row mounts both previews.** The Shell only scans the client face of packages a mounted row
  resolves to, so the `viewers` row names this package's root, and `lib/index.js` exists to be that
  mount point. Its `apply` registers nothing.
- **The bundle package root is a plugin entry.** `exports["."]` is `lib/index.js`; the patch is
  reached through `dsh.bundle.patch`, not through the package root.

Client faces add no model context, so context cost is unaffected. The tool rows stay independent:
switching `l5x-read` or `ftview-read` off removes schemas and guidance and leaves the previews
mounted.

## Distribution

The bundle is packed as one self-contained tarball; its one dependency is the Optix component from the
registry (`@aryacode/dsh-tool-ft-optix`, a plain version range):

```
dsh-engineering-<version>.tgz
  ├── cordis.patch.yml        the rows and the tool policy
  ├── lib/client.js           both previews, one registration
  ├── lib/index.js            the host half the `viewers` row mounts
  └── vendor/{l5x,ftview,mwi} the vendored components and their assets
```

No `@aryacode/*` package is a dependency, so a profile installs one thing and toggles rows inside it.
The release procedure is in [packaging](port/packaging.md).

## Compatibility

The bundle is pinned to the DSH `0.2.x` line: `@deepseek-ai/dsh-tool-skill` `^0.2.0-rc.2` and
Cordis `~4.0.4` (peer). A profile on another line refuses the bundle at boot rather than composing
it partially.

## Verification

```sh
pnpm test          # patch invariants, docs agreement, tool reference, policy coverage, client face
pnpm build:client  # regenerate lib/client.js from the committed face bundles
pnpm docs:tools    # regenerate docs/reference/tools.md and tools.json
pnpm docs:check    # fail when the generated reference is stale
```

`test/patch.spec.mjs` parses `cordis.patch.yml` and asserts the exact inserted rows, the skill and
prefix wiring, and that eager exposure is preserved. `test/docs.spec.mjs` fails when the README
policy table, row ids or changelog heading drift from the patch or manifest.
`test/client-face.spec.mjs` fails when the committed `lib/client.js` is stale, when its registration
id stops matching the package name, when a face stops materializing, or when `apply` stops mounting
either preview.
