# ECAD port — DXF feasibility gate

Status: **M0 gate 1 and 2 passed on the owner's real print set (2026-11-04).** The typert
client-remote gate is still open; nothing ships until it lands.

## What the owner provided

`Prints.zip` (outside this repository; customer drawings are never committed):

| Format | Files | Size | Scope |
|---|---|---|---|
| DXF (`FC1000495-NNN.dxf`) | 34 sheets | 25.2 MB (133 KB – 6.4 MB) | **v1 now** |
| DWG (`20136-NNN.dwg`, same sheet set) | 33 | 17.5 MB | future need |
| ACD (`FC1000495_AFR.ACD`) | 1 | 4.6 MB | future need |

The DXF set is AutoCAD Electrical **IEC** drawings: `AC1032`/`AC1027`, `ANSI_1252`, units unset,
**no proxy/custom objects, no xref attachments, no meaningful XDATA**; symbols are largely exploded
(no device blocks to read tags from); very few layers (`0`, `BLOCKS`, `TITLE_BLOCK`, sometimes
`Centerline`/`Defpoints`); the ACADE `WD_M` drawing-properties block is present on every sheet with
the ACADe defaults (`WIRELAYS=WIRES`, `WIREFIXED_LAY=WIREFIXED`, `XREF_LAY=XREF`, `LOC_LAY=LOC`,
`TAG_LAY=TAGS`, `TAGFMT=%F%N`, `XREFFMT=%N`), while the drawings themselves use only the few layers
above; sheet identity and title-block labels are **text on the `TITLE_BLOCK` layer**
(`SHEET NUMBER:`, `TITLE`, `REVISION LEVEL:`, `RELEASE DATE:`, `CHECKED BY:`, `SCALE:`, with values
such as `FC1000495-031`, `Solstice AFR #FC1000495`); sheet 001 is a **SHEET INDEX** sheet listing
the set.

Consequences for the design, all recorded in the plan: profile inference reads `WD_M` first and
then the title-block layer/label pairing; cross-reference is text-format driven (candidate evidence,
confidence on every row) because there are no tagged symbol blocks; the sheet-index sheet provides a
high-confidence structural cross-check of the file list.

## Gate 1 — parse and DXF write-back with `@mlightcad/data-model@1.15.21` (MIT)

Node 26, `AcDbDatabase.read()` + `dxfOut()`; snapshot comparison of entities, entity types, text
values with layers, block names, layer names, and block-attribute values on every one of the 34
sheets.

| Measurement | Result |
|---|---|
| Sheets parsed | 34 / 34 |
| Round-trip model differences | **0** on all 34 sheets |
| Parse time | 693 ms total; slowest sheet 100 ms (6.4 MB, 9,440 entities) |
| `dxfOut` time | 554 ms total; slowest 123 ms (3.9 MB in, 13,121 entities) |
| Output size | 15–25 % smaller than the source (formatting/whitespace only; model equality proves it) |
| Entity totals in the set | LINE 37,126 · LWPOLYLINE 8,961 · TEXT 6,690 · ARC 3,792 · ATTDEF 2,875 · CIRCLE 2,130 · INSERT 1,034 · SPLINE 971 · ELLIPSE 705 · HATCH 295 · POINT 275 · SOLID 171 · MTEXT 54 · VIEWPORT 34 · DIMENSION 23 · LEADER 1 |

**Decision:** v1 enables `modify` mode (new-file writes of edited drawings), not only annotation
overlays, because the corpus round-trips cleanly. The general risk (proxy entities, ACIS bodies,
custom objects, extension dictionaries) is still reported per write and never silent.

## Gate 2 — editing operations

On `FC1000495-001.dxf`: rename a title-block text and move it, create layer `ARYA_TEST` and append a
new text on it, change the `TAGFMT` attribute inside the `WD_M` insert, insert a block reference,
erase one line. After `dxfOut` and a fresh read: the in-memory model equals the re-read model, the
three intended changes and the one erase are present, the new layer exists, and no other entity
changed. This is the draft → new-file → re-read → compare loop `ecad_draft_apply`/`ecad_verify`
will implement.

## Toolchain notes

- `@mlightcad/data-model@1.15.21` pulls MIT `@mlightcad/{common,geometry-engine,graphic-interface,emf-converter}`.
- The package is now a **bundle dependency** and a declared component dependency: the vendored engine
  imports it at runtime, so the root `package.json` keeps the exact `1.15.21` pin the engine was measured
  against.
- This environment installs with `pnpm install --ignore-scripts --config.node-linker=hoisted`
  (isolated pnpm links and Node 26 ESM do not mix here); CI on the owner's Node line is unaffected.

## M1 — engine library, measured on the corpus

The engine lives in `packages/ecad/src/engine`: plain Node over `@mlightcad/data-model`, with no Host
services in it, exporting parse, render model, title block, index sheet, profile inference,
cross-reference, checks, diff, SVG render, ops, DXF write and write verification. Its own specs are
**112 tests, all passing**; the synthetic fixtures regenerate byte-identically.

| Measurement (34 sheets, 26.4 MB, read-only) | Result |
|---|---|
| Parse + render model | 34/34, **83,936 primitives**, 1,756 approximated, **0 unsupported**, 0 truncated |
| Title blocks | sheet number 34/34 and title 34/34 (text pairing, confidence 0.93–0.95) |
| Index sheet | sheet 001, heading `SHEET INDEX`, 80 entries read by column |
| Profile inference | confidence 0.95: `TITLE_BLOCK` layer, WIRES/TAGS/XREF/LOC from `WD_M`, tag format from `TAGFMT`, 33 standard layers |
| Cross-reference | 74 candidate rows (33 device tags, 4 sheet references, 37 wire labels); 1,132 pattern-only noise rows withheld |
| Checks | 97 findings; **0** TB-MISSING / SHEET-MISMATCH / LAYER-UNKNOWN / SHEET-REF-UNRESOLVED |
| Render | 34 model layouts → 19.2 MB SVG in 143 ms |
| Round-trip | 34/34 `dxfOut` → re-read → rebuild → **0 added/removed/changed**, `verifyWritten.ok` on every sheet (3.2 s) |
| Draft ops | validate → apply → write → verify passes on sheets 001/031/051 |

Known limits, reported per write and never hidden: the pinned writer emits group 74 as the lock flag,
so ATTRIB vertical justification is not carried (horizontal mode is); hatch islands are filled because
the contract carries one points loop per loop (stable ids `<handle>#n`, loops sorted so a write/re-read
does not diff); planar drawing assumption (OCS/extrusion normal, thickness and non-uniform insert
scaling are not applied, non-uniform/mirrored block arcs are marked `approx`); ASCII DXF without the
`0/EOF` terminator is refused because the pinned parser would otherwise accept a truncated file.
Contract additions accepted for v1: `ECAD-SCOPE` as an `info` rule appended to every checks result,
`ECAD-TB-BLANK` as `info`, and the module-local result types re-exported from `engine/index.ts` (move
them into `types.ts` only if the panel needs them).

**Service probe.** With the engine built in-repo, `src/remote/ecad-service.js` ran against a fake Host
context over two real sheets: `capabilities`, `open` (render-model artifact under `.ecad/previews/`,
title-block sheet number, 0 unsupported), `sheets`, and `apply` (a NEW file, `verification.ok`, source
bytes unchanged, SHA-256 echo) all passed; a stale `baseVersion` and a writes-disabled service were
refused with `ECAD_STALE_DOCUMENT` and `ECAD_WRITES_DISABLED`.

## Closed gate: Typert client remote (GO)

Proven end to end on a composed Dev AryaCode profile: browser client bundle → `ctx.remote.$mount` →
Gateway dispatch → the plugin-defined `ecad` Cordis service → a marker file on disk, with the
Gateway's `"descriptor":"strict"`, i.e. dispatched through the bundle's `./typert` artifact and not
the source fallback. A hand-written artifact is enough (the published generator is optional), the
target service must expose `typertRemote = bindTypertRemote(service, key)`, the client must reach a
just-mounted namespace through `ctx.inject(['remote.ecad'], …)`, and loader discovery needs an exact
package-root row (the existing `viewers` row qualifies). The real service now ships in
`src/remote/ecad-service.js` with `open`, `apply`, `sheets` and `capabilities`.

## DWG path evaluation (2026-11-04)

The open-source path for DWG was previously described as GPL (LibreDWG) or proprietary (a paid
parser). The owner pointed at [OpenCADStudio](https://github.com/HakanSeven12/OpenCADStudio); reading
its stack changes the options.

| Candidate | License | DWG read | DWG write | How it would fit |
|---|---|---|---|---|
| **acadrust** (Rust crate, crates.io `0.6.8`, 2026-10-27) | **MPL-2.0** | R12–R2018+ | R12–R2018+ | Embed as a prebuilt WASM module (or a small sidecar) inside the bundle |
| OpenCADStudio (Rust app, `v2026.44`, 2026-11-01) | GPL-3.0 | yes | yes (versioned save) | Only as a **user-installed external** converter/verifier; never bundled |
| ODA File Converter (external) | proprietary free tool | yes | yes | User-installed external converter; highest fidelity, EULA-restricted |
| mlightcad parser (proprietary) | commercial (~$3k) | read | no | Not needed now |
| LibreDWG | GPL-3.0 | partial | no | Still rejected |

**The find.** OpenCADStudio's own GPL app cannot be embedded in this MIT bundle, but its engine is a
separate crate: [`acadrust`](https://crates.io/crates/acadrust) (`0.6.8`) — pure Rust, **DXF ASCII +
binary and native binary DWG read/write, R12 through R2018+**, ACIS SAT/SAB data, 48 entity kinds,
191k lines of Rust, 85,967 downloads, actively released (37 versions since February 2026), and it
documents WebAssembly as a supported (sequential) target. Its DWG reader/writer is ported and adapted
from **ACadSharp (MIT, © 2021 Albert Domenech)**, with the ODA DWG specification as the reference for
binary layouts; the crate's `THIRD_PARTY_NOTICES.md` carries that MIT notice. MPL-2.0 is file-level
copyleft: the bundle can stay MIT and ship the codec as a distinct MPL component, provided the MPL
notices are included and the source of the MPL-covered files stays available (we use the unmodified
crate at a pinned version plus our own MIT wrapper).

OpenCADStudio itself is still useful as (a) an optional user-installed converter/verifier for users
who already run it — it has a headless JSON automation API (`--serve`, `--http`) with `open`, `save`,
`wblock`, `plot`, `audit` and `save_verified` operations, an MCP server, and a Windows x86_64 portable
executable — and (b) a reference for how a verified save should be gated (audit, reopen, semantic
manifest, SHA-256). Its published reader/writer gap list is also a review checklist.

**Decision and gate.** v1 stays DXF-only and unchanged: the current MIT in-process path is measured
on the corpus and does not depend on an external program. DWG becomes a post-v1, opt-in milestone
with a spike that must prove, on the owner's 33 DWGs: build acadrust to WASM (or a small sidecar),
convert DWG → DXF, parse with the shipped engine, then take an edited DXF → DWG, reopen it and compare
the model; only measured, per-drawing results justify a DWG claim. The gate is honest coverage:
unsupported entities are reported per file, the writer stays version-targeted and off by default,
and a drawing is never called a faithful DWG round-trip without that evidence. ODA remains the
documented fallback when a customer requires AutoCAD-native output and already has it installed.
