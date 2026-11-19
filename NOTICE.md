# Third-party notices

`@aryacode/dsh-engineering` is MIT-licensed; the copyright notice and the licence text are in
[LICENSE](LICENSE). It embeds or redistributes the components below, and ships the full notice for
each inside the package. Nothing here changes the licence of the bundle itself.

## Embedded in the package

### acadrust 0.6.8 — MPL-2.0, with ACadSharp code — MIT

The ECAD component converts DWG to DXF through a compiled Rust module,
`vendor/ecad/assets/acadrust.wasm`. `acadrust` is MPL-2.0 (file-level copyleft); its DWG codec is
ported from ACadSharp (MIT, © 2021 Albert Domenech). The unmodified crate is the MPL-covered source
form and stays available from upstream; the repository pins the exact version in
`packages/ecad/rust/Cargo.lock`.

The full notice — both licences, the MPL-2.0 text, the build-time `web-time` stand-in and what a
redistributor must keep — is [`vendor/ecad/THIRD_PARTY_NOTICES.md`](vendor/ecad/THIRD_PARTY_NOTICES.md),
which is part of the published tarball.

### `StudioMCPBridge.cs` — MIT, modified

The FactoryTalk Optix bridge that runs inside Optix Studio is a modified copy of
[asqi-carter/ftx-mcp](https://github.com/asqi-carter/ftx-mcp) at commit
`c36163ea88e79efc56d4df10eb337b44969fa922` (`studio-bridge/StudioMCPBridge.cs`, MIT). Local changes,
the upstream digest and the file's line endings are recorded in
`vendor/optix/bridge/source.json`, and the upstream licence is
`vendor/optix/bridge/LICENSE`.

### NetLogic cheat sheet — upstream snapshot

`vendor/optix/netlogic/` is a snapshot of the public
[FactoryTalk-Optix/NetLogic_CheatSheet](https://github.com/FactoryTalk-Optix/NetLogic_CheatSheet)
repository at commit `5e65254104bbbc49c1f4f7adde4c6f1e3e2b470f` (53 pages, taken 2026-10-27).
`vendor/optix/netlogic/SOURCE.json` records the commit, the page count and the upstream README
digest. The upstream repository's own terms apply to that material.

### FactoryTalk Optix Studio help index

`vendor/optix/help/index.json` is an index built from the FactoryTalk Optix Studio help installed on
the machine where it was generated: page id, title, section, headings and a short snippet per page.
The help pages themselves are not copied — they are read from the engineer's own Studio install.
FactoryTalk, Studio 5000, RSLogix, Allen-Bradley and MotionWorks are trademarks of Rockwell
Automation or Yaskawa; this project is not affiliated with or endorsed by either company.

### Engineering standards corpus

The 48-page corpus under `vendor/resources/corpus/` was written for this bundle. Its rule IDs are
this project's, and where a rule restates a published requirement it cites the clause it comes from;
no standard document is redistributed.

## npm dependencies (installed, not vendored)

| Package | Licence |
|---|---|
| `@deepseek-ai/schemastery` | MIT |
| `@mlightcad/data-model` | MIT |
| `fast-xml-parser` | MIT |
| `fast-xml-validator` | MIT |
| `js-yaml` | MIT |
| `playwright-core` | Apache-2.0 |
| `st-ethernet-ip` | MIT |

Their licence texts are in each package's own directory under `node_modules/` after install.
