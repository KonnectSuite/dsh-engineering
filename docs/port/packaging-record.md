# Packaging and release

> **Distribution status.** AryaCode installs plugins from the registry. Since 0.4.0
> `@aryacode/dsh-engineering` is **one self-contained package**: the three host components are
> vendored into `vendor/`, both previews ship as its own `lib/client.js`, and its only dependency is
> the Optix component from the registry, as a plain version range. A profile installs one package and
> toggles rows inside it. Publish with **`pnpm publish`** — `npm publish` cannot rewrite `workspace:*`
> specs and fails — then verify the published `dependencies` carry real versions, never `workspace:*`
> and never a URL.
>
> The sections below describe the installer-pinned multi-tarball layout that AryaCode replaced; they
> remain as the record of how the bundle was packed before it moved to the registry.

## Current release

```sh
pnpm install
pnpm --filter @aryacode/dsh-engineering-l5x build
pnpm --filter @aryacode/dsh-engineering-ftview build
pnpm --filter @aryacode/dsh-engineering-mwi build
node node_modules/typescript/bin/tsc -p packages/ecad/tsconfig.json   # ECAD engine, tools and DWG bridge
pnpm test                     # patch, docs, tool reference, dependencies, client face
pnpm build:client             # lib/client.js from the committed face bundles (three faces)
pnpm assemble                 # vendor/ from the four component trees plus the ECAD wasm asset
pnpm pack                     # one tarball: cordis.patch.yml, entries/, lib/, vendor/, locale/

pnpm publish --no-git-checks --access public     # npm is the artefact host
npm view @aryacode/dsh-engineering@<version> dependencies   # real version specs, never workspace:*

# npm lags a publish by minutes. Wait until the packument serves the version and the tarball
# downloads, then verify from this repository:
node scripts/verify-release.mjs --wait 600

# and record the version the registry now serves, from the dsh-arya-market clone:
node ../dsh-arya-market/scripts/release-plugin.mjs --skip-build --skip-tests

git tag -a v<version> -m "Engineering bundle <version>"      # provenance, in this repo
git push origin main --tags
```

`prepack` runs `build:client` and `assemble`, so a packed tarball cannot carry a stale client bundle
or a missing vendor tree. Inspect the tarball before publishing: `lib/client.js`, `entries/*.js`,
`vendor/optix/lib/index.js`, `vendor/optix/skills/*.md`, `vendor/l5x/cip-worker.mjs`,
`vendor/l5x/studio-bridge/*.csproj`, `vendor/mwi/code/engine/**` and `vendor/ecad/assets/acadrust.wasm`
must all be present. The packaged
smoke calls a real ECAD tool from the tarball (see the release body) so the bundled engine, DOM
shim and DWG converter are exercised from the published bytes, not from the repository build.

**0.101.0 release record (2026-11-18).** Built from the Batch F/G/H series (`b73ea6b` the render check that
looks at the screen an operator sees, `4c26c17` the four new screen patterns and the measured density,
`da1cc05` the NetLogic fixture and the sampler that had been reading the wrong pixels twice) plus the
`Release 0.101.0` bump (`dfc9048`), tagged `v0.101.0`. Release evidence: `pnpm docs:tools` wrote 158 tools and
changed nothing on disk — the Optix tools are not in the generated reference, which is what its own test
asserts; `pnpm test` **77 files passed** (33,618 ms); `pnpm -r build` clean; `pnpm assemble` → 8 components
into `vendor/`; `pnpm pack` → 4 828 998 bytes carrying `lib/client.js`, `entries/`, `vendor/optix/lib/index.js`,
**11** `vendor/optix/skills/*.md`, `vendor/l5x/cip-worker.mjs`, `vendor/l5x/studio-bridge/`,
`vendor/mwi/code/engine/`, `vendor/ecad/assets/acadrust.wasm`, `cordis.patch.yml` and `locale/` (921 files);
`pnpm publish --no-git-checks --access public` → `✅ Published package @aryacode/dsh-engineering@0.101.0`.
Seven 30-second polls of the packument answered `latest=0.100.0, 0.101.0 absent` and the eighth, about four
minutes after the publish, answered `latest=0.101.0` with `time["0.101.0"] 2026-11-18T08:09:21.296Z`; the
tarball then downloaded on its first attempt. The publish was **not** retried. Registry copy: 4 828 998 bytes,
`fileCount 921`, `unpackedSize 20 107 077`, npm `shasum c5e31782ec2e24e244eb759e66f87f8266afb916` (the
downloaded file's sha1 matches it) and `sha256 4569d727d22546cbbcec4a375418d76b33432a2ab53823807ce255bcfdeb5afe`
— this time identical to this machine's own `pnpm pack` digest, where 0.100.0's record notes the two packers
usually produce different bytes. `node scripts/verify-release.mjs --wait 120` →
`ok @aryacode/dsh-engineering@0.101.0 → …/dsh-engineering-0.101.0.tgz`.
**Packaged smoke from the published bytes** (`node tmp/smoke-0101.mjs`, which mounts
`tmp/registry-0101/package/vendor/optix/lib/index.js` extracted from the downloaded registry tarball, against a
live Studio bridge on `AryaSMTLineDemo` with the emulator serving `http://127.0.0.1:8081/`): **30 tools**
registered — the 27 core ones plus the three preview-gated ones, including **`optix_render_check`, which ships
in published bytes for the first time**; the published `kit.js` `PATTERNS` carries `station`, `table`,
`faceplate`, `split`; `netlogic.js` `TEMPLATES` carries `fixture` and `NETLOGIC_RULES` carries `OPTIX-NL-15`;
`optix_render_check` measured **178 elements, 7 findings, 0 unchecked** on the served LineStatus, its capture
clipped to `window_box 1280x800` out of a 1920x1080 browser viewport, `measured.paint_read "captured pixels"`,
and the seven findings are the same seven the repository run reported — the `--:--` `VIEW-RENDER-01`, four
`VIEW-RENDER-02` cards at 496x247 filling 3–6 %, the cyan-on-cyan `"Ready"` `VIEW-RENDER-05`, and the rail tab
`"Line Status" #ffffff on #0fafff 2.44:1` judged from the band around the text box; `optix_script action=review
name=LineProbeFixture build=false` → 45 lines, 1 800 bytes, `sha256 fb9898236e42aa4d1ef101dff582ae6b80b33c4952dd666a983610c91f22829b`,
`export_methods ["RunFixture"]`, `verdict clean`, counts 0/0/0, `checked OPTIX-NL-03 … OPTIX-NL-15`;
`optix_list_skills` → **11 topics** (0.100.0 shipped 10; `render-checks` is the new one) and the shipped
`runtime-csharp` playbook carries the fixture section and no longer names `Ctrl+Shift+B`. The same run showed
why the wording fix matters: the **installed 0.100.0** copy still answers `nothing in this plugin can save the
project` in its `needs_save.next` while its own `optix_emulator` answer proves a save landed (`save_verdict`:
the newest write under `Nodes/` at `2026-11-18T06:40:04.902Z` is newer than the last pending bridge change at
`2026-11-18T06:38:02.645Z`). Gaps this release ships still open, recorded in `packages/optix/skills/gaps-and-refusals.md`
and `optix-proof/smt/STATUS.md` §36: the confirm dialog is a type with no proven open/close route; `import_tags`
is proven only to the station lookup; a fixture is proven reviewable and compilable but not yet *exercisable*,
because a save does not load the class; the rail tab's 2.44:1, the `--:--` and the cyan-on-cyan `"Ready"` remain
findings the kit cannot fix; and `optix_ui action:"screen"` has no batch ceiling where `optix_screen` refuses
above 700.

**0.100.0 release record (2026-11-17).** Built from the Optix verification series (`3aa8b91` layout
containers and NodeId pointers, `fa5f4ca` the checking tools on a container screen, `abbf0a2` the layout
track, `67c5b56` the pointer playbooks, `badcab3` container margins, `089c6f2` the alarm route and the
Stretch rule, `c65f898` the logging chain and the shadowing-name gate, `6e0ab90` the gap register and the
test-runner guard) plus the `Release 0.100.0` bump (`6a9b4f7`), tagged `v0.100.0`. Release evidence:
`pnpm docs:check` clean (`gen-tool-reference: reference is up to date.`, `docs/print.css` up to date);
`pnpm test` **76 files passed** (31,461 ms — the run is five files larger than 0.99.0's because
`scripts/test.mjs` had been skipping five Optix specs, and it now fails on that drift by name);
`pnpm -r build` + `pnpm assemble` → 8 components into `vendor/`; `pnpm publish --no-git-checks --access public` →
`✅ Published package @aryacode/dsh-engineering@0.100.0`. The first `verify-release.mjs --wait 120` answered
`registry latest is 0.99.0, this repository is 0.100.0` and `npm view …@0.100.0` answered E404; the packument
gained `dist-tags.latest 0.100.0` and `time["0.100.0"] 2026-11-17T20:38:23.446Z` about seven minutes after the
publish, and the tarball URL kept answering 404 for four more 30-second polls before it downloaded. The publish
was **not** retried. Registry copy: 4 795 983 bytes, `fileCount 919`, `unpackedSize 19 995 598`, npm
`shasum 8d5d60db0282a8201a3c070209f2e03d0962ad38` (the downloaded file's sha1 matches it) and
`sha256 07011ed0c4c8da8df6499c17aec58279e3513a1f60dd2b44ba8f97dbc2688b8d`; this machine's own `pnpm pack`
digest differs (`18cee4f3a4970a7a5b06787c127736c1b9c50549281332320599ca9b5853d6cf`), as expected.
**Packaged smoke from the published bytes** (`node tmp/smoke-0100.mjs`, which mounts
`tmp/pack-0100/package/vendor/optix/lib/index.js` extracted from the downloaded tarball, against a live Studio
bridge on `AryaSMTLineDemo`): 27 tools registered; `optix_list_skills` → **10 topics** (`alarms …
verify-and-release`) where 0.99.0's tarball carried **zero** `vendor/optix/skills/` files and the same call
returned an empty list; `optix_get_skill name=gaps-and-refusals` → 11 187 bytes, title "What the tools refuse,
and what to do instead", naming `unsupported_array_write`, `not_an_object`, `proxy_only_property` and
`Table.RecordLimit`; `optix_build action=status` → `state built, proven true, artifact 248 832 bytes,
type_collisions null`; `optix_edit create_widget name=Trend widget_type=Screen` → `status refused, applied 0`
with *"…it would shadow FTOptix.UI.Trend in every NetLogic in the project…"* and nothing reaching the bridge,
while the same op as `TrendProbe` validated `ok`. Gaps shipped with it, recorded in
`packages/optix/skills/gaps-and-refusals.md`: `vendor/<name>/package.json` does not exist so
`brandPackageVersion()` prints no version in an Arya-branded footer; `Table.RecordLimit` has no tool route;
`import_tags` end to end is still unproven; `CHANGELOG.md` carries mojibake introduced by `ab5fe6011`
(2026-10-28) that no decoder in this repo can undo.

**0.94.3 release record (2026-11-14).** Built from the engagement-order policy
(`feat(policy): a new build starts from the brief and the standards, not the host`, `5a083a5`) plus two doc
commits (`dffd13f`, `db55630`) and the `Release 0.94.3` bump (`12e544b`), tagged `v0.94.3`. Release evidence:
`pnpm docs:check` clean (`gen-tool-reference: reference is up to date.`, `docs/print.css` up to date); `pnpm test`
**53 files passed** (29,132 ms, including the new `test/skill-engagement.spec.mjs` 7, and `test/resources.spec.mjs`
12 / `test/optix-template.spec.mjs` 7 / `test/components.spec.mjs` 14); corpus **59 pages**, digest
`200396dc4ae1`; `pnpm -r build` + `pnpm assemble` → 8 components into `vendor/`; `pnpm publish --no-git-checks` →
`✅ Published package @aryacode/dsh-engineering@0.94.3`. The first `verify-release.mjs --wait 300` answered
`registry latest is 0.94.2, this repository is 0.94.3` — the CDN edge again, not a failure — and the rerun
answered `ok @aryacode/dsh-engineering@0.94.3`; the publish was **not** retried. The market
`release-plugin.mjs` recorded the registry copy (`sha256 4bb4611ab4af…`, live catalogue `releases[0]` and npm
`latest` both `0.94.3`) rather than this machine's pack (`108e79147378…`), per the immutability rule. Known gap
shipped with it, recorded in `HANDOFF.md`: in the packaged app `engineering_reference` / `engineering_profile` do
not reach an agent (the skill's resource block reports the provider unavailable in the agent's scope), so the
standards-first step of `CRAFT-ORD-01` is instructable but not yet readable.

**0.94.2 release record (2026-11-14).** Built from five feature commits plus the `Release 0.94.2` bump
(`99f9e26`), tagged `v0.94.2`: the OPC UA information-model lane (`optix_model`, `1340987`), NetLogic
authoring (`optix_script`, `cf4680f`), the NetLogic practice review and safe templates (`3acd674`), the
product-neutral HMI/SCADA baseline with its precedence rules (`fc2faf8`) and Rockwell's published process
style guide as the vendor layer (`7d83334`). Release evidence: `pnpm docs:check` clean; `pnpm test`
**52 files passed** (25,342 ms, including the extended `test/optix-model.spec.mjs` 9, `test/optix-netlogic.spec.mjs`
19 and `test/resources.spec.mjs` 11); corpus **58 pages**, digest `318352db85d4`; `pnpm -r build` +
`pnpm assemble` → 8 components into `vendor/`; `pnpm publish --no-git-checks` →
`✅ Published package @aryacode/dsh-engineering@0.94.2`. The first `verify-release.mjs --wait 300` answered
`registry latest is 0.94.1, this repository is 0.94.2` — the CDN edge, not a failure — and the rerun
answered `ok @aryacode/dsh-engineering@0.94.2`; the publish was **not** retried, which is why there was no
`409 previously staged`. The market `release-plugin.mjs` recorded the registry copy
(`sha256 ac9ea4f93fe2…`) rather than this machine's pack (`51d7a2f49d5d…`), per the immutability rule;
the live catalogue `releases[0]` and npm `latest` both read `0.94.2`.

**0.94.1 release record (2026-11-14).** Built from `fix(optix): ask for the screen box and keep a
new project out of the workspace root` (`f3005c4`) plus the `Release 0.94.1` bump (`e769a10`), tagged
`v0.94.1`. Two defects an operator hit on the first real scaffold: `optix_template` copied a 1920x1080
starter without asking the display size, and it unpacked the copy straight into the workspace folder, so
Studio opened `...\Optix Demo\AryaNewHMIProject_IPC.optix` and warned `423 - The current project name
'AryaNewHMIProject_IPC' does not match the project folder name 'Optix Demo'`. `width`/`height` are now
required with `destination` and refused when missing, and the copy lands in `<destination>/<name>` unless
the destination already carries the project name. Release evidence: the packed tool refused a scaffold with
no canvas and then produced `workspace-installed/PanelApp/PanelApp.optix` (58 files, 800x480, bridge 1.0.9)
from the installed bundle; `test/optix-scaffold.spec.mjs` grew to 6 tests; `pnpm test` 50 files passed
(37,324 ms); `pnpm docs:tools` 158 tools; `pnpm -r build` + `pnpm assemble` clean; `pnpm publish`
→ `0.94.1`; `scripts/verify-release.mjs --wait 300` answered ok for the registry tarball the moment the
edge caught up (no `409 previously staged` this time, because the publish was not retried); the market
`release-plugin.mjs` recorded the registry bytes (`sha256 e708f5c541dc…`) rather than this machine's pack
(`a4fde89272cf…`), which is the documented immutability rule, and the catalogue and `latest` both read
`0.94.1`.

**0.94.0 release record (2026-11-14).** Built from `feat(optix): scaffold a project, arm one that has
no bridge, and keep the IDE in the engineer's hands` (`6a2abb2`) plus the `Release 0.94.0` bump
(`11a3a35`), tagged `v0.94.0`. Root suite **50 files green** (`pnpm test`, 23,431 ms), `pnpm -r build` +
`assemble` (eight components) deterministic, published `2026-11-14T18:09:25Z`: 4.0 MB, 787 files, npm
serves it as `latest` and the catalogue records the registry copy (`sha256 cfefa597640d…`, this
machine's repack `0d64715cd519…` — the prepack rebuild means two packs of the same tree never match,
so the registry copy is what the catalogue carries). Release evidence calls the tools that changed:
`optix_template` scaffolded `…\Projects\LineDemo` (34 files, bridge 1.0.9, 1920×1080), the engineer
opened/built/`StartBridge`-ed it, then `optix_edit`/`optix_screen` created four tags, a `PanelLoader`
and two screens (126 and 106 ops, `optix_design_check` 0 findings each, `optix_production_check`
`review` with only the two `PROD-04` built-in-user warnings), `optix_emulator` started the runtime and
the rendered app switched panels on a click
(`docs/port/optix-live-proof/15-linedemo-overview-runtime.png`, `16-linedemo-controls-runtime.png`).
One measured wrinkle for the next release: `npm view` served `0.93.0` for about ninety seconds after
the publish finished, and a second `npm publish` during that window answers `409 … previously staged
version` — that message means "already published, the edge has not caught up", not "waiting for
approval"; `scripts/verify-release.mjs --wait` is the way to confirm, and the market script skips the
publish once it sees the registry copy.
**0.93.0 release record (2026-11-13).** Built from `feat(ecad): make the row a review-and-view row,
not a CAD editor` (`bf16673`), tagged `v0.93.0`. Root suite 19 specs green (166 tests) and the ECAD
package 21 specs green (182 pass, 4 skipped — the AryaCAD fixture skips rather than fakes, because the
application is GPL-3.0 and this bundle MIT), `pnpm docs:check` clean (**158 tools**, down from 174:
the ECAD row registers twelve, not sixteen), and `pnpm -r build` + `assemble` (eight components)
deterministic. **Two ECAD specs were deliberately not run:** `dwg.spec.mjs` and `corpus.spec.mjs` push
the whole 34-sheet print corpus through the `acadrust` converter, which aborts intermittently with
`memory access out of bounds` — the retry wrapper at `packages/ecad/src/dwg/index.ts` documents it, and
the batch died on it twice — so the DWG round trip is unverified for this release. The published
tarball is 3.9 MB / 774 files, sha256
`db6c1da91afb96ecfcfe19641c492160e1097dfbb3a036648407c347e3658d35`. The market script's own repack
again did not match (`5990d2af37d4…`) for the same manifest-normalisation reason, and it records the
registry copy. The registry held the version staged for **nine minutes** — `npm view` answered for the
exact version only after 540 s, against 0.92.0's five and a half — so a waiting release is normal, not
a failure. One thing this release ships unverified: the live AryaCAD MCP bridge. The overlay, an
`ecad_capabilities` answer of `mounted`, and one edit round-tripped through `ocs_save_verified` into
`ecad_compare` have not been run against a real instance; `docs/port/ecad.md` says so plainly.

**0.92.0 release record (2026-11-12).** Built from `Release 0.92.0` (`917d948`), tagged `v0.92.0`.
Root suite 47 specs green — four new Optix specs (`optix-chain` 20 tests, `optix-arm` 7,
`optix-template` and `optix-emulator` 7) — `pnpm docs:check` clean (174 tools), and `assemble`
(eight components) deterministic. The Optix row grew from 9 tools to 12, so the recorded default-on
ceiling is 150 tools. Published with `pnpm publish --no-git-checks --access public`, whose `prepack`
rebuilds the three faces and the vendor tree, so the tarball cannot carry a stale client bundle. The
published tarball is 4.0 MB / 772 files, sha256
`82e59f39ee8bceced9d592f7ad256cad0c28f68cf5b4a641888d930210ff50ad`. The packaged-bytes smoke
extracted that tarball and called the new Optix code **from the published bytes**: the runtime
discovery found the real `FTOptixRuntime.exe` under the Studio install, `emulatorStatus` reported the
project's web engine serving `200`, and a chain probe returned `next: ""` with the browser launchable
and Tesseract plus its `eng.traineddata` present — the whole preview chain satisfied on a machine with
no help from the repository build. Two release mechanics notes: the registry again held the version
staged (about five and a half minutes before `npm view` answered `latest = 0.92.0`), and this time the
market script's own repack did **not** match the registry bytes (`3a854c2a7060…` against
`82e59f39ee8b…`) because `pnpm publish` normalises the manifest inside the tarball; the script records
the registry copy, which is the copy the catalogue must point at. The registry now serves 0.92.0 as
`latest`; the market `catalog` branch records the same tarball and sha256, and `arya-release-status`
reports the plugin in sync across repo, npm and catalogue.

**0.91.0 release record (2026-11-12).** Built from `Release 0.91.0` (`9356b3d`), tagged `v0.91.0`.
Root suite 43 specs green (the default-on schema ceiling moved to 127,423 with the measured 122,522
characters), l5x vitest 573 passed — new `copy-format` 7 tests and `io-alias-tags` 4 tests — and
`pnpm --filter @aryacode/dsh-engineering-l5x typecheck` plus `pnpm docs:check` (162 tools) clean;
`pnpm -r build` + `assemble` (eight components) deterministic. The published tarball is 4.0 MB /
14.5 MB unpacked / 766 files, sha256 `71a9b6c26b2ca56e0467d61dd7ca9d21f8a947e5903ba55d1146d7f26c766bad`.
The registry held the version in a staged state for about five minutes after `npm publish` printed
"being processed": `npm view` still answered `latest = 0.90.0`, so the first `release-plugin` run found
nothing published and its own publish attempt was refused with `E409 … Cannot publish over previously
staged version`. Run the market step only once the registry serves the version. The registry now serves
0.91.0 as `latest`; the market `catalog` branch records the same tarball and sha256, and
`arya-release-status` reports the plugin in sync across repo, npm and catalogue.

**0.90.0 release record (2026-11-09).** Built from `Release 0.90.0` (`ff812c8`), tagged `v0.90.0`.
Root suite 43 specs green (the tool reference now names 162 tools, and `components.json` carries eight
components), plc5 vitest 17 passed / 1 skipped (census, container, `rslogix5` and the eight tool
definitions); `pnpm -r build` + `assemble` (eight components) deterministic. The published tarball is
3.8 MB / 14.4 MB unpacked / 766 files, sha256 `b34f5a17450c0d3e07ff195ffeaef1ea92c67950924baddedcda8bdf7044a0de`;
the packaged-bytes smoke extracted the published tarball and mounted its `vendor/plc5` row: the eight
`plc5_*` tools registered, `plc5_capabilities` answered honestly on this host (`com_server: false`, the
"RSLogix 5 is not usable on this machine" summary), `plc5_open` on a missing path refused with
`FILE_MISSING` and the "Pass an existing .RSP project path" fix, and the packaged `rslogix-5` skill
exported its body and path. The registry serves 0.90.0 as `latest`; the market `catalog` branch records
the same tarball and sha256.

**0.89.0 release record (2026-11-08).** Built from `Release 0.89.0` (`5ba019a`), tagged `v0.89.0`.
Root suite 43 specs green, ftview vitest 319/319 (new: alarm drafts 10 tests, component package 5
tests); `pnpm -r build` + `assemble` (seven components) deterministic. The published tarball is
3.8 MB / 14.3 MB unpacked / 750 files, sha256 `723d8564c0a6b134b12c5f75557e1eb7a2cdb5ff0f04cbe7062115359ab76e2e`;
the packaged-bytes smoke extracted the published tarball, installed its runtime dependencies, and ran
the alarm drafting flow end-to-end (`ftview_draft_alarm_add` staged, `ftview_validate` reported
`Alarms/Alarms.xml` with the `ALARM_PLACEHOLDER_LABEL` finding riding along, `ftview_apply` wrote the
wizard-numbered T2/M2 rows and the backup-first alarm import steps into `IMPORT.md`) and
`ftview_component_package` on a real export folder (list file with `<category>/<component>` rows,
copies, and the `SEAddComponent CC019_Main ME / "…" overwrite` command returned; `Main:2` refused with
`COMPONENT_PACKAGE_FAILED` and the forbidden-characters fix). The registry serves 0.89.0 as `latest`;
the market `catalog` branch records the same tarball and sha256.

**0.88.0 release record (2026-11-08).** Built from `Release 0.88.0` (`55a273a`), tagged `v0.88.0`.
Root suite 43 specs green, migration vitest 67/67 (9 new tests: candidates, wizard-defaults audit,
`.SLC` accept, bounded payload, `wizard_artifact` open item), l5x vitest 562/562; `pnpm -r build` +
`assemble` (seven components) deterministic. The published tarball is 3.9 MB / 13.6 MB unpacked /
748 files, sha256 `1300c487d63fa8351189a35f06eabc91a0aed3222e796f8870f256fd070a6380`; the
packaged-bytes smoke extracted the published tarball and called `migration_report` on a `.SLC`
legacy side (no error, 3 rungs read, rows capped at 2 of 5 totals, no non-finite numbers in the
JSON, report written) and `migration_assess` on an imported `.L5X` (wizard-defaults audit fired
all six rules with one blocking `MODULE_NAME_ILLEGAL`), plus a wrong-extension probe refused with
the `.RSS, .ACH, .RSP or .SLC` message. The registry serves 0.88.0 as `latest`; the market
`catalog` branch records the same tarball and sha256.

**0.87.1 release record (2026-11-05).** Built from `Release 0.87.1` (`a434f10`), tagged `v0.87.1`.
Removed the ECAD composer status bar: the face no longer registers `conversation.input.dock`. Root
suite 42 files / 398 tests green, ECAD typecheck and `docs:check` current, build deterministic. The
published tarball is 3.9 MB / 14.2 MB unpacked / 743 files,
sha256 `1bce93497af675a21c62e68f1c4bb497a7ccb88090cf1d0234023e041ea3219b`; the packaged
`lib/client.js` contains the focus-mode control and no `ecad-sheet-set` registration, and the
packaged L5X tree still carries `l5x_compose_logic` and the no-project skill guidance. The market
`catalog` branch records the same tarball and sha256.

**0.87.0 release record (2026-11-04).** Built from `Release 0.87.0` (`51a2baa`), tagged `v0.87.0`.
Root suite 42 files / 398 tests, eight package typechecks, L5X 562/562, ftview 304 passed / 3 skipped,
mwi 64/64, migration 60/60, `docs:check` and `resources:check` current. `pnpm -r build` + `assemble`
were deterministic; the packed tarball is 3.9 MB / 14.2 MB unpacked / 743 files,
sha256 `ab691ac915b3b5d5ce4f13f604696a2f42dd0e02ba78aaf12c0b152b0f21e9f6`. The packaged-bytes smoke
extracted the published tarball and called `l5x_compose_logic`, which registered 17 tools and returned
`[XIC(Start),XIC(Run)]XIO(Stop)OTE(Run);` with `Start`/`Stop`/`Run` BOOL declarations, coverage marked
unverified and **no file written**. The registry serves 0.87.0 as `latest`; the market
`catalog` branch records the same tarball and sha256.

**One host for every entry.** The catalog points at `registry.npmjs.org` tarballs; the market repo
holds the catalog JSON and nothing else. A GitHub release asset is not part of this flow — the
`--tarball` mode of `publish-arya-release.mjs` still exists for packages that cannot be published to
the registry, but no Arya entry uses it. Because npm publishing is staged, publish first and record the
catalog entry after the version is visible in `npm view`.

## History: seven tarballs before 0.3.0

Seven tarballs made up a release:

| Package | Role |
|---|---|
| `dsh-engineering` | the bundle: `cordis.patch.yml` with the tool-exposure policy and the entry rows |
| `dsh-engineering-l5x` | L5X read, editing, studio, live entries and the event handler |
| `dsh-engineering-l5x-viewer` | the folded L5X ladder viewer client face |
| `dsh-engineering-ftview` | FactoryTalk View read, editing and studio entries |
| `dsh-engineering-ftview-viewer` | the folded FTView display preview client face |
| `dsh-engineering-mwi` | MotionWorks IEC session, read, verify and edit entries, the COM bridge and the saved-model engine |
| `@aryacode/dsh-tool-ft-optix` | FactoryTalk Optix Studio discovery, live authoring, preview and OCR |

## Where they are hosted

The repository is private, so GitHub release assets here are not anonymously
fetchable. Releases are published on the public site repository
`KonnectSuite/KonnectSuite.github.io` under the tag `plugins-v<version>`, which
serves the assets without authentication.

Before 0.4.0, the bundle declared its six component packages as **URL dependencies** pointing
at those assets:

```
https://github.com/KonnectSuite/KonnectSuite.github.io/releases/download/plugins-v0.1.0/<name>-0.1.0.tgz
```

pnpm calls these "exotic" subdependencies. Installing the bundle therefore
requires `blockExoticSubdeps: false`:

- the AryaCode workspace sets it in `pnpm-workspace.yaml`, because `apps/cli`
  depends on the packed bundle;
- new profile templates set it in `PROFILE_PNPM_WORKSPACE`, documented in
  `packages/boot/app-boot/src/profile.ts`.

## Component packages

The component packages are parts of the bundle, not separately managed plugins — vendored into
`vendor/` since 0.3.0, and previously separate tarballs.
Each declares `"dsh": { "component": true }`, and the Harness plugin inventory omits
such packages, so the Plugins page lists the Engineering bundle alone rather than
its components. A component also carries no product entry of its own; the bundle
patch is the only composition surface.

## Release steps

The steps in this section are the **pre-0.3.0 record**; use "Current release" above. They built and
published six component tarballs before the components were vendored.

1. Build and pack:

   ```sh
   pnpm --filter dsh-engineering-l5x run build
   pnpm --filter dsh-engineering-ftview run build
   pnpm --filter dsh-engineering-l5x-viewer run build
   pnpm --filter dsh-engineering-ftview-viewer run build
   pnpm --filter dsh-engineering-mwi run build
   pnpm pack --pack-destination dist/<version>            # from each package dir
   pnpm --filter dsh-engineering pack --pack-destination dist/<version>
   ```

2. Publish the five assets on the public site repository:

   ```sh
   gh release create plugins-v<version> --repo KonnectSuite/KonnectSuite.github.io \
     --title "Engineering plugins <version>" --notes-file <notes> \
     dist/<version>/*.tgz
   ```

3. Pin the bundle into the installer:

   ```sh
   # AryaCode checkout
   pnpm run release:sync-installer-plugins
   pnpm install
   ```

   This packs `dsh-engineering` into `apps/desktop/bundled-plugins`, records its
   source commit, and pins `apps/cli` to that tarball. `PRODUCT_PLUGINS` lists
   the bundle with `distribution: 'installer'`, so new Web profiles include it.

## Verification performed

Checked on the 0.4.0 package before publishing:

- `pnpm pack` produced one tarball carrying `lib/client.js` (both faces), `lib/index.js`,
  `cordis.patch.yml`, `vendor/*/SKILL.md`, `vendor/l5x/studio-bridge/*.csproj` and
  `vendor/mwi/code/engine/**`.
- `test/client-face.spec.mjs` materialized the registered factory and mounted both previews against a
  recording client context — the check that catches a face which loads and draws nothing.
- `dsh.client.inject` on the package equals the union of the two retired viewers' lists.
- `dependencies` carries no `@aryacode/*` entry; the Optix tarball is the only one.

Recorded from the pre-0.3.0 multi-tarball layout:

- A clean profile with `nodeLinker: hoisted` installed the bundle from its
  tarball and resolved all five packages at top level; `SKILL.md` and all component bundles were
  present.
- A freshly initialized Web profile lists `dsh-engineering` in
  `dsh.profile.bundles` and `dsh --dump-config` composes every engineering row
  under `# == dsh-engineering`.
- `product-plugins.spec.ts` and `profile.spec.ts` pass in AryaCode (53 tests).

**0.94.4 release record (2026-11-14).** Built from `343150e` (the tool-contract fix) and `b3a3b97` (the version
commit). The reason for it is the only thing worth recording: 0.94.3 shipped `engineering_reference` and
`engineering_profile` refused by the harness tool contract (`output.render` missing), the resources row swallowed
the throw, and every agent that followed the new standards-first step found no such tool — measured on the
operator's session as the agent reading `app.asar` bytes in search of it. The fix declares `output { schema, render }`,
registers each tool separately so one refusal cannot empty the row, reports refusals at error level, and adds
`test/entry-tool-contract.spec.mjs`, which mounts all eight entries against the harness precondition instead of a
stub that accepts anything. Release evidence: `pnpm test` **54 file(s) passed (26,640 ms)**; `pnpm docs:check`
up to date; `pnpm -r build` + `pnpm assemble` (8 components) clean; `pnpm publish` published 0.94.4;
`verify-release.mjs --wait 300` first answered the usual CDN-edge `FAIL registry latest is 0.94.3` and then
`ok @aryacode/dsh-engineering@0.94.4`; catalogue recorded the registry copy sha256 `7034f1ba632f…`; tag `v0.94.4`.
Installed from the registry into `%LOCALAPPDATA%\AryaCode-dev\home\profiles\optix-live` and proved in the packaged
app: `engineering_reference {id: hmi-isa101-baseline}` returned `HMI-101-01 … HMI-101-06` in 11 s
(`docs/port/optix-live-proof/20-engineering-reference-live.png`), and the same template prompt that started this
(`I would like to build a Optix Template…`) then read **eight standards pages first, with zero `pwsh`/`glob`/`grep`
calls**, called `optix_template {}` afterwards, and asked the runtime/deploy brief
(`docs/port/optix-live-proof/21-engagement-replay-a2-standards-first.png`).
