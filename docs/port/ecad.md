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
- The package is currently a repository devDependency for the engine work; it becomes a bundle
  dependency (and a declared component dependency) when the component lands.
- This environment installs with `pnpm install --ignore-scripts --config.node-linker=hoisted`
  (isolated pnpm links and Node 26 ESM do not mix here); CI on the owner's Node line is unaffected.

## Open gate

- **Typert client remote**: the panel's edit path needs a plugin-defined Remote service. Spiked in a
  scratch worktree; its result decides M3/M4 and is recorded here when it closes.
