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

## M2 — the sixteen tools and the row

The tool layer (`packages/ecad/src/{core,drawings,session}.ts` and `tools/**`) registers sixteen
`ecad_*` tools in three groups — **read 10** (`capabilities`, `profile`, `scan`, `open`, `overview`,
`find`, `cross_reference`, `checks`, `render`, `compare`), **drafts 4** (`draft_ops`, `draft_apply`,
`draft_discard`, `verify`) and **deliverables 2** (`document`, `backup`) — totalling 15,199 characters of
model-visible definitions. The row is inserted `disabled` and its `writes` config starts off, so the
default-on context budget is unchanged; `ecad_apply` writes one new drawing beside the source only when
the row and its write switch are both on.

Two seams are deliberate. `drawings.ts` is the only place that reads a drawing, decides the format from
`SUPPORTED_EXTENSIONS`/`RECOGNISED_EXTENSIONS` and publishes a new one (`readDrawing`/`writeDrawing`);
the DWG branch is a marked one-liner there, so the converter is a single-module change. `session.ts`
keeps a bounded per-chat cache plus the profile, index, drafts and applied records under `.ecad/`, and
stamps every write with the session's sandbox policy. Internal `.ecad/` state works with writes off
(review stays possible); every output outside `.ecad/` — the new drawing, a custom documentation folder,
the backup tree — requires the switch.

Verification: **143 package tests** pass (112 engine + 31 tool specs through a fake Cordis composition
that mirrors `FsTarget` resolution, write intents, sandbox policy and effect disposal), every failure
returns `{ ok:false, error:{ code, message, fix } }`, and no tool returns file contents: render,
document and backup answer with paths and counts. Typecheck and `tsc -p` are clean. The skill body is
4,282 characters (budget 8,000) and its copy says DWG is landing in this batch, with one marked
sentence per surface to flip when the converter merges.

## M3 — the right-panel drawing preview

The third client face (`packages/ecad/src/client`, folded by `scripts/build-client.mjs` into the
bundle's one registration) registers the document preview for **`.dxf` and `.dwg`**
(`binaryExtensions: ['dwg']`, loading `renderer`) and the Better Sidebar file viewer, mounts the
bundle's Typert contribution and reads the sheet from the Remote service: `capabilities`,
`open` → the render-model artifact under `.ecad/previews/`, then a chunked read of that artifact
through `workspaceFiles.readBytes` (1 MiB chunks, 64 MiB cap) and a JSON parse. The body renders the
layout as SVG (fit, pan, zoom, layers on/off, click selection with an inspector, layout tabs, coverage
badges), carries the converter provenance for DWG (`converter`, source version, warnings) as a quiet
badge and panel rows, and maps any envelope failure — including `ECAD_DWG_*` — through one failure
panel. “Ask Arya” appends a review prompt with the drawing's format and path to the conversation draft.
The actions slot is not used: its owner prop is only an absolute path and the conversation bridge needs a
Session, so the action lives in the body's quiet view toolbar as the ladder face does.

Theme compliance is part of the face, not a later pass: only `--dsw-*` tokens (document surface, layers,
labels, borders, hover/active, business state, warn state, selection, radii, elevation, focus ring,
fonts), light and dark, 24 px targets, `aria-pressed`/`aria-selected`, hover only under
`@media (hover: hover)`, `prefers-reduced-motion` honoured, and the sheet's ACI linework mixed toward the
theme ink (`--ecad-ink-tint: 55%`) with a measured worst case of **3.19:1 light / 3.25:1 dark**; ACI
7/0/256 draw in full theme ink. The en and zh dictionaries have identical keys and every literal
`t('key')` resolves.

Verification: the committed artifact was rendered in real headless Chrome against a real corpus sheet
with the host's `ui-theme` stylesheets — 15 screenshots covering fit, pan, zoom, selection, layer hide,
narrow panes, zh, error/empty/truncated/unavailable and the DWG badge/rows/warnings — asserting the
transform changes, Escape clears, layer hide removes primitives, Ask Arya writes the path, fit is
centred, and there are **zero console errors or warnings**. `test/client-face.spec.mjs` locks the
registration (extension list, renderer loading, `binaryExtensions`, locale namespace, slot) and the face
artifact's freshness; `packages/ecad/test/client/{scene,artifacts}.spec.mjs` cover the geometry and
artifact helpers. The in-app Shell mount and a real DWG in the panel were then verified in the Dev
AryaCode pass below.

**Post-release fix found on the real set.** A user screenshot of the installed 0.86.0 panel showed short
electrical fragments in the bottom-left corner of the sheet. Reproduced on `FC1000495-025`: the block
flattener transformed circles, arcs, text, polylines and hatches, but `LINE` was emitted from its raw
block-local start/end points, so every block's line segments piled up at the block origin while the other
primitives stayed at the insert. The line case now applies the insert transform like the rest; a synthetic
block fixture carries a line and asserts its world coordinates. Re-rendering the real sheet puts the
contacts, coils and terminal bars back in place and removes the corner cluster. The fix is in
`[Unreleased]`; the published 0.86.0 artifact is unchanged until a 0.86.1 batch is approved.

## M4 — in-panel editing

The drawing body edits when the row's `writes` switch is on, and is honestly read-only when it is not:
the read-only badge's tooltip says where to enable writes, and no edit control is rendered. A
segmented **View / Edit** switch opens an edit bar with three staged operations, built from the sheet
model's own layout and entity ids:

- **Add text annotation** — arm it, click the sheet, and a compact form (text, height, layer) appears;
  the default height is the sheet's **median text height** and the default layer is the drawing's `0`
  layer. Enter places at the view centre, Escape cancels.
- **Move** — drag the selected primitive (an accent ghost previews the offset) or type ΔX/ΔY; one
  `move` op per entity.
- **Erase** — one `erase` op for the selected entity, faded on the sheet until applied.

The staged list shows each op's kind, layout and summary with per-op remove and clear-all. The canvas
shows ghost text/moves and faded erases. Apply calls `ecad/apply(sessionId, path, sourceVersion, ops)`
through the same child-fiber injection as open, unwrapping the carrier's `{ ok, value }`. Success prints
the new path, **format**, per-kind counters, verification totals and host notes; the written drawing's
model is read from the returned `modelPath` but the source view is not swapped — “Open written drawing”
is an explicit action, and the written sheet carries “Back to source”. A failure
(`ECAD_WRITES_DISABLED`, `ECAD_STALE_DOCUMENT`, `ECAD_INVALID_DRAFT`, `ECAD_DWG_*`) prints code, message
and fix inline and **keeps the draft**. Reloading retires a draft staged against a replaced version;
switching to View keeps it.

The face does not surface every engine operation: `addLine`, `addPolyline`, `addRectangle`,
`addRevisionCloud`, `addLeader`, `addBlock`, `setText`, `setAttribute`, `setLayer` and `rotate` are
accepted by the engine but deliberately not in the M4 UI. Flattened block members (ids containing `/`)
are refused with an explicit note. DWG sources are handled entirely by the service: the face keeps the
DWG badge and conversion provenance and displays the service's `dwgRoundTrip` split into hard changes
and metadata-only changes plus converter warnings.

Verification: `packages/ecad/test/client/edits.spec.mjs` (12 tests: screen→drawing inverse through
fit/pan/zoom and Y flip, drag deltas, op builders and rounding, flattened-id refusal, defaults, field
parsing) and the client-face spec's injected `open`/`apply`/`ask` surface, editing dictionary and
stylesheet pairing; the headless harness now wraps Remote results as `{ ok, value }` like the live app
and covers read-only (light/dark), staged (light/dark), applied, written view, move+erase, a stale
failure that keeps the draft, DWG applied with round trip and warnings, and a narrow pane — **14
screenshots** in `tmp/ecad-edit-harness/shots/`, zero console errors or warnings. The full suite is
**315 tests, all passing**.

**Dev AryaCode, end to end.** In the app: opened `20136-004.dwg` in the panel, switched to **Edit**,
placed a text annotation, staged it (“1 STAGED”), and applied. The host wrote
`prints/20136-004-ecad-20261104T075612.dwg` (56,387 bytes), and the panel reported *Output*, *Format:
DWG*, *Changes: addText 1*, **“1 change · verified”**, the host notes, and **“The DWG round trip matched
the written drawing”** with one converter warning; the source view stayed and the staged list cleared.
Screenshot: `tmp/ecad-dev-shots/36-applied.png`.

**Host gap found and closed.** The first apply in the app failed with `ECAD_NO_FS_WRITE`: the shipped
host filesystem service writes UTF-8 text only and exposes no byte writer, so a drawing (DXF or DWG)
could not be published at all. Both the tools adapter (`core.ts`) and the Remote service now fall back
to a local byte writer that keeps the same promises — a read-only session refuses
(`ECAD_WRITE_REFUSED`), the destination must sit inside the policy's workspace or additional writable
root, and `createIfAbsent` still refuses an existing file — with `packages/ecad/test/core.spec.mjs`
pinning the write, the read-only refusal, the outside refusal, an additional writable root and the
create guard. The `npm pack` freshness check was also corrected to compare the newest built file
instead of `lib/index.js`, so a face-only rebuild is not refused by `assemble`.

## M5 — conversation intelligence

The same face also makes ECAD work legible in the conversation, using the shell's own slots (read from
the harness source, not guessed):

- **Tool cards.** `tool.call.toolview` is a keyed, session-scoped slot declared by the shell's tool UI as
  a child of its `conversation.chat.node` tool-call row; a hit replaces the generic row and the key is
  the exact wire tool name. The face claims **all sixteen** `ecad_*` tools, so no ECAD call falls back to
  the generic row. Six have specialised cards — `ecad_open` (path, DXF/DWG badge, DWG warning count,
  entities/layouts/unsupported/approximate, title block, truncated, “Open drawing”), `ecad_scan`
  (index path, drawings/sets/formats, unsupported, skipped), `ecad_checks` (severity counts, first eight
  findings with rule/sheet/message, the scope note), `ecad_cross_reference` (duplicate/unresolved/
  one-sided counts, first eight candidates with confidence), `ecad_render` (layout, SVG path, drawn/
  total) and `ecad_draft_apply` (verified badge, output path, format, change counters, verification
  problems, DWG round-trip hard/metadata split and warnings, “Open written drawing”). The other ten use
  labelled scalar-field cards. Error envelopes print `code`/`message`/`fix` (and candidates); an
  unparseable or wrongly shape payload prints what was seen instead of inventing counts; a result marked
  `isError` overrides a success-looking payload; nothing throws. Opening a file uses the owner's
  `openFile(path)` route, and a composition without an opener shows a path hint instead.
- **Sheet-set dock.** `conversation.input.dock` supplies a real `SessionSnapshot` (`session.sessionId`),
  so the dock reads through the same child-fiber Remote bridge: `ecad.sheets(sessionId, 500)` and
  `ecad.capabilities(sessionId)`, unwrapping the carrier's `{ ok, value }`. The quiet chip above the
  composer reads e.g. `3 drawings · 2 DWG · profile confirmed · writes on` (or `writes off` / `default
  profile`) with an aria label. It renders nothing while loading, for a workspace with no drawing, with
  no session, or when the bridge/read fails; a failed read never blocks or unbalances the composer.

Honest limits: the render card names the SVG path instead of claiming a thumbnail (the shell previews
`.dxf`/`.dwg`, not `.ecad/renders/*.svg`); the cards replace the generic row's Inspect/trajectory control
(that needs shell tool primitives this face does not bundle); dock counts come from the service's capped
drawing listing, not an uncapped filesystem walk; and `ui-tool` is a shell package, so a composition
without it registers no card and does not throw.

Verification: `packages/ecad/test/client/toolCards.spec.mjs` (22 tests: parsing, every specialised card,
error envelope, unknown-tool card, malformed-field fallback, a never-throws sweep over all sixteen tools
and junk payloads, and the dock's report/hidden/degraded cases) and `test/client-face.spec.mjs` (the 16
keys checked against the generated `tools.json` inventory, dock registration and session-degraded
reader, a composition without the tool UI, and class pairing for both CSS modules). The headless harness
(`tmp/ecad-m5-harness`, real committed artifact, owner-shaped props, fake Remote) passed with zero
console warnings/errors and seven screenshots — cards light/dark (including fallback and running), dock
light/dark, dock absent, dock read-only, and a narrow card column.

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

**Decision and gate.** The owner then approved pulling DWG into the same batch (2026-11-04), so the
converter is an embedded, byte-in/byte-out module rather than an external install: `acadrust 0.6.8`
(MPL-2.0, unmodified) behind `packages/ecad/src/dwg` (`converterInfo`, `isDwg`, `dwgToDxf`,
`dxfToDwg`), built to **WASM** (the crate compiles for `wasm32`; one host clock import, no
wasm-bindgen) with a native sidecar as the documented fallback; the wrapper and build script live in
`packages/ecad/rust/`, the artifact in `packages/ecad/assets/`, and the MPL and ACadSharp notices ship
with the package. The service routes `.dwg` through the converter and reports
`dwg.available`/`format`/`converted`; the converter landed in M4 below and every DXF path is unchanged.

The gate: on the owner's 33 DWGs, conversion success and time are measured (M4); where a DWG and DXF
name the same drawing they are not the same title-block issue, so the comparison is reported as measured
rather than as equality; three sheets take the full `DXF→DWG→DXF` round trip and three take
`DWG→DXF→DWG→DXF`; and a drawing is never called a faithful DWG round-trip without that evidence.
Unsupported entities and conversion warnings are reported per file, the writer stays version-targeted
(the source drawing's version) and off by default, and ODA remains the documented fallback when a
customer requires AutoCAD-native output and already has it installed.

## M4 — the DWG converter, measured

**Artifact and build.** WASM won the timebox: `packages/ecad/assets/acadrust.wasm`, **6,408,006 bytes**,
sha256 `5229f9ae7bff0d47aa4acb5c51927b020cd112d1920e9ee113099460ea9a798d`, built with rustc/cargo
1.99.1 for `wasm32-unknown-unknown` in **107.5 s** first build (3.3 s rebuild) by
`packages/ecad/rust/build.ps1`. The module has no wasm-bindgen glue and one host import
(`ecad_host_now_millis`); acadrust's `memmap2` and `rayon` are `cfg`-gated off for wasm. A native
sidecar was built to prove the fallback (6,846,976 bytes, 172.8 s via MSVC) but is deliberately not
committed; its source, build flag and measured size stay in `rust/`, and `src/dwg/sidecar.ts` picks it
up only when the wasm asset is absent. `cargo test --release` passes 5 tests; the package's
`test/dwg.spec.mjs` passes 11.

**Conversion on the corpus.** 33/33 DWGs converted with **0 reader warnings**,
15,556,754 → 80,640,792 DXF bytes in **1,168.6 ms** total (4.7–138.7 ms/sheet; the one-time module
compile is about 90 ms). Versions present: **16 AC1027, 17 AC1032**; both directions preserve the
version (`dwgToDxf` reports it, DXF `$ACADVER` carries it back, `dxfToDwg` defaults to it).

**Equivalence, reported honestly.** The DWG set and the shipped DXF set are **different title-block
issues** of the same drawings (company and date differ on every pair), so entity equality cannot be
clean: **0/33 pairs entity-identical**, mean geometry shared **89.8 %** (92.2 % excluding
`TITLE_BLOCK`), differences concentrated in title-block logo hatches/arcs, company/date text,
paper-space `Layout1` viewport arrangement, and title-block text written on layer `0` in one issue and
`TITLE_BLOCK` in the other. Sheet 045 shares 6.7 % — a genuine content difference; its conversion and
round-trip are clean like the rest. DWG support is therefore claimed as conversion plus re-read
verification, **never** as “the DWG matches the DXF”.

**Write path and round trips.** Shipped DXF → DWG → DXF: **0/0/0** on sheets 004 (smallest) and 035
(largest), **0/0/3** on 007 where the only change is an anonymous block rename (`*X26`→`*X7`; entity
count and geometry identical). Real DWG → DXF → DWG → DXF: **0/0/0** on 004, 001 and 035. A DWG write is
gated on the re-read model, not on byte or handle equality.

**Per-drawing write gate.** Every one of the **33 DWGs** was then taken through the panel service's
whole write path — open (convert), stage one annotation, apply to a NEW DWG, re-open the written DWG
through the converter, rebuild the model and diff it against the expected model. Result: **33/33 pass**,
each output keeps the source version (16 AC1027 / 17 AC1032), source bytes are unchanged, and the added
text is observed. Four sheets (020, 022, 047, 051) report **linetype-metadata normalisation only**
(936 / 741 / 1000 / 1000 changed entities, reasons `linetype changed`), which the service classifies as
a metadata difference and quotes with its count; **no sheet has a hard geometry or text difference**.
The gate also exposed two false-change defects in the engine's model diff, both fixed: a value landing
on a tolerance half-step boundary (`0.1375` versus the writer's `0.13749999999999996`) rounded to
different sides, and a full turn reported as `2π−ε` compared unequal to `0`. The fix nudges half-step
values consistently and collapses a full turn to zero, with a regression test using the measured
values; without it, sheets 002, 003, 032 and 049 reported phantom size/angle changes. The service's
`dwgRoundTrip` now reports `hardChanges`/`metadataChanges` separately, so only a real model change keeps
a write unproven.

**The panel service, on a real DWG.** Probe over `20136-004.dwg` and `FC1000495-001.dxf`:
`capabilities` reports `engine: dxf+dwg`, wasm 0.6.8, AC1009–AC1032; `open` returns `format: dwg`,
`converted: {converter: wasm, version: 0.6.8, sourceVersion: AC1027}`, 213 entities, title-block sheet
`004`, and caches the render artifact; `apply` staged one `addText` and wrote a **new** 56,483-byte
AC1027 DWG with `verification.ok`, `dwgRoundTrip 0/0/0` and the attribute-attachment warning quoted,
the source hash unchanged; `sheets` lists both formats; the DXF still opens; a stale `baseVersion` is
refused with `ECAD_STALE_DOCUMENT`.

**Wrapper work disclosed.** acadrust 0.6.8's DXF reader leaves `ATTRIB` entities loose while its DWG
writer only writes `Insert::attributes`, so a plain DXF→DWG silently dropped every block-reference
attribute value; the wrapper re-attaches them positionally per the DXF spec and reports
“attached N block-reference attribute entity list(s)” as a warning (visible in the service probe).
`web-time` is patched to an in-repo MIT shim (native `std::time`, one host clock import on wasm);
acadrust itself is unmodified. `packages/ecad/THIRD_PARTY_NOTICES.md` carries the acadrust MPL-2.0
statement and full text, the ACadSharp MIT notice, the shim note, and where the MPL source is available
(crates.io tarball plus the `rust/` wrapper sources).

**Limits.** DWG→DXF output is about 5× the shipped DXF (the shipped DXF is an exploded, block-purged
export) and includes unreferenced block definitions; visible geometry is unaffected (proven by the
round-trip diffs). A DWG write renumbers anonymous blocks, and four corpus sheets show linetype
normalisation in the metadata (quoted, not counted against the write). Proxy/custom objects, ACIS and
xrefs are absent from this corpus and therefore **unmeasured** — reader diagnostics are the only report,
and support is not claimed either way. Conversion runs CPU-synchronously on the calling thread (5–145 ms
per sheet), so the service caches the model artifact per open.

## Dev AryaCode pass (2026-11-04)

The packaged bundle was installed and booted on the development home
(`%LOCALAPPDATA%\AryaCode-dev\home`), never on the installed product.

- **Pack.** `npm pack --ignore-scripts` produced a 3.7 MB tarball (13.3 MB unpacked, 731 files) that
  carries every ECAD runtime piece: `vendor/ecad/lib` (engine, DWG converter, session, tools), the
  6,408,006-byte `vendor/ecad/assets/acadrust.wasm`, the Rust wrapper sources and `build.ps1`, the
  MPL/ACadSharp notices, `entries/ecad.js` and `src/remote/` (contract plus panel service).
- **Profile.** A fresh `ecad-dev` profile composes `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`
  and the tarball, and adds a profile patch enabling the `ecad` row with `writes: true`;
  `dsh --profile ecad-dev --dump-config` shows the nine rows with those values. The profile must be
  installed with peer auto-install disabled (`--config.auto-install-peers=false`): pnpm otherwise pulls
  the latest `0.2.2-alpha.3` host plugins into the profile, which the `0.2.2-alpha.2` runtime correctly
  refuses to activate. The shipped installer supplies matching peers, so this is a hand-built-profile
  caveat, not a bundle defect; it is recorded here for the next commissioning run.
- **Boot.** `dsh web --host 127.0.0.1 --port 0` served the UI (title *AryaCode Local Build*). The
  Plugins page reported `@aryacode/dsh-engineering` (the pass ran on the 0.85.3 pack; this batch ships
  as 0.86.0 without a code change) installed with **Components: 9 total · 9
  running**, including `@aryacode/dsh-engineering/ecad` **Running**, the `viewers` client row, and the
  ECAD row table with `writes off · maxFiles 2000 · maxFileBytes 64 MiB · maxEntities 200000`. The only
  console error was the offline account read (`[deepseek-account] account read failed`); no plugin,
  client-face or composition error appeared. Screenshots from this pass are in
  `tmp/ecad-dev-shots/` (`09-ecad-row-visible.png`, `10-ecad-config.png`); they are evidence, not
  committed assets.
- **The drawing panel opened a real DWG in the app.** Two prints were placed in the dev default
  workspace (`prints/20136-004.dwg`, `prints/FC1000495-001.dxf`), a session was started in that
  workspace, the DWG was attached through the composer's `@` file menu, and clicking the attachment
  opened the document preview. It rendered the sheet with the **DWG badge**, `Approximate`, `213
  entities · all drawn as carried geometry`, Model/Layout1 tabs, the layer list, the title-block fields
  (`004`, `DTG-#20136`, `20136`, `DTG`), the inspector hint, and the provenance rows
  (`Format DWG`, `Converted via wasm`, `DXF version AC1027`, file version). Screenshot:
  `tmp/ecad-dev-shots/25-dwg-preview.png`.
- **The live pass found a real integration bug, now fixed.** The first click reported
  `ECAD_PREVIEW_INVALID`: the Remote carrier resolves a successful call to `{ ok, value }`, and the
  face was reading `modelPath`/`layouts` off that wrapper instead of off the service envelope. The pane
  now unwraps the success wrapper (`unwrapRemoteValue` in `artifacts.ts`), with a regression test for the
  wrapper, a direct envelope and a failure wrapper; the packaged bundle was rebuilt and the same click
  then rendered the drawing. This was invisible to the headless harness because its fake call returned
  the envelope directly, which is exactly why the interactive dev pass exists.

## Final commissioning pass (2026-11-04)

The finished batch was packed again (3.8 MB, 731 files), installed into the `ecad-dev` Dev profile and
booted on the development home; the installed product was never written.

- **Rows.** The Plugins page reports `@aryacode/dsh-engineering` (the pass ran on the 0.85.3 pack; this
  batch ships as 0.86.0 without a code change) with **Components: 9 total ·
  9 running**, including `@aryacode/dsh-engineering/ecad` Running (`tmp/ecad-dev-final/01-plugins-rows.png`).
- **Sheet-set dock.** A fresh session in the Default workspace rendered the M5 dock chip above the
  composer: **`3 drawings · 2 DWG · default profile · writes on`**, with the aria label
  `Workspace drawings: 3, 2 DWG` — the conversation surface mounts in the real composer and reads the
  live session's drawing set through `ecad.sheets`/`ecad.capabilities`
  (`tmp/ecad-dev-final/02-dock-chip.png`).
- **Panel.** Opening the original `20136-004.dwg` again showed the DWG badge, `Converted via wasm`, 213
  entities, the View/Edit switch and the `AC1027` provenance rows
  (`tmp/ecad-dev-final/05-final-panel.png`). Earlier in the same pack, a staged text annotation was
  applied to a new 56,387-byte AC1027 DWG with “1 change · verified” and “The DWG round trip matched
  the written drawing” (`tmp/ecad-dev-shots/36-applied.png`).
- **Only console error** in the whole pass was the offline `[deepseek-account] account read failed`;
  no plugin, client-face, card or dock error appeared.
- **Tool cards — the honest remaining gap.** The dev home has no model API key, so no live agent turn
  could invoke an ECAD tool and render its card in the transcript. The cards are harness-verified with
  owner-shaped props and a fake Remote (seven screenshots, zero console errors), and the dock proves the
  face's conversation registrations mount in the real composer; a card in a real tool call needs a
  configured model in a Dev session. This is recorded rather than claimed.

This completes the end-to-end verification on a Development instance. Release remains gated on the
owner's explicit **ship**: version bump, `[Unreleased]` → version heading, tag, publish and catalog
entry; nothing in this batch is published.
