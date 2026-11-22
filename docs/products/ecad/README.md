# DXF/DWG drawing preview

`@aryacode/dsh-engineering` ships one read-only drawing preview. It renders DXF natively and DWG through
an embedded converter in the document tab, next to the ladder viewer and the FactoryTalk View display
preview. The `viewers` row mounts it; there is no separate product row, no tool, and no switch.

This page describes what the preview shows and what it cannot establish. The ECAD tool set is retired:
the previous `ecad` row, its 12 `ecad_*` tools, the `ecad-review` skill and the AryaCAD Electrical bridge
page are gone. The engine, the DWG converter and the drawing pane are kept because the preview still
uses them.

## What it is

| Fact | Value |
| --- | --- |
| Component | `viewers` — *Ladder, display and drawing previews* (a surface, not a product) |
| Where it appears | **Settings → File viewers → *DXF/DWG drawing*** and the document tab for a `.dxf`/`.dwg` file |
| Reads | `.dxf` directly; `.dwg` through the embedded converter |
| Writes | nothing — the preview is read-only |
| Tools | none |
| Package | `packages/ecad` is the viewer payload the package root's Remote service loads lazily |

The preview draws one sheet at a time with pan, zoom, layer filtering and text search over the parsed
model. It parses the file in the client process, so nothing is written into the workspace just to look at
a drawing.

## What you need

Nothing but the bundle. The preview works on a machine with no vendor software installed, because the
DXF parser and the DWG converter ship inside the tarball (`vendor/ecad/assets/acadrust.wasm`). Drawing
authoring still belongs to AryaCAD Electrical, which runs in its own application; this bundle neither
ships, installs nor starts it.

## Measured facts

The figures below come from the owner's print set — 34 DXF sheets, 25.2 MB, plus DWG sheets and one
`.ACD`. They describe that set, not a promise about yours.

| Measurement | Result |
| --- | --- |
| Parse (parser gate) | 34 of 34 sheets parsed, 693 ms total, slowest 100 ms on the 6.4 MB sheet |
| Engine coverage on the set (26.4 MB) | 83,936 primitives, 1,756 approximated, 0 unsupported, 0 truncated |
| Render | 19.2 MB SVG in 143 ms |
| Drawing pane | driven in headless Chrome with zero page errors |

## Limits

- The preview draws what the parser model reports; linetypes, hatch patterns and exact font metrics are
  not reproduced.
- The renderer assumes a planar drawing: OCS/extrusion normal, thickness and non-uniform insert scaling
  are not applied, and arcs inside non-uniformly scaled or mirrored blocks are marked approximated.
- Hatch islands are filled rather than reconstructed as islands.
- An ASCII DXF without its `0/EOF` terminator is refused.
- DWG conversion was verified only in a Dev pass; the converter aborted intermittently on the full print
  set in another pass, so a DWG that fails to convert is a known risk, not a surprise.
- Entities the engine cannot represent are reported rather than silently dropped. The 0 unsupported on the
  measured set is a property of that set, not of the parser.
- The preview extracts no review facts: no checks, no cross-reference table, no documentation bundle.
  Those were tool features and are retired with the row.

## Where to go next

- [Architecture](../../architecture.md) — where the drawing face and its Remote service sit in the bundle.
- [Capabilities](../../capabilities.md) — the calls behind the measurements above.
- [Products](../README.md) — the product pages and the `viewers` surface.
