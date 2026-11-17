# screens-and-layout

A screen is a container in a window, and the window decides what a coordinate means.

## The layout tree the generators emit

`optix_screen`, `optix_ui action="screen"`, `optix_ui action="shell"` and `optix_nav` no longer place a field
of pinned rectangles — they build FTOptix.UI containers (measured against Studio 1.8.1.27 / bridge 1.0.9,
2026-11-16):

- one `ScaleLayout` direct child of the screen, **stretched** (`Width`/`Height` `-1.0`, both alignments `3`),
  with the design box in `OriginalWidth`/`OriginalHeight`, `FillMode 0` (Fit) and `FontScaling` off. A pinned
  canvas carries nothing: it only scales when its own size differs from the design box, and a pinned one is
  the letterboxed 1280×800 picture inside a 1920×1080 viewport that this replaced. **Proven rendering**
  (`optix-proof/smt/shots/probe-scale4.png`, 2026-11-17): a 400×200 rectangle designed at (100,100) rendered
  330×165 in a 1060×736 content area — a fit factor of 0.828, which is exactly `min(1060/1280, 736/800)` —
  and its 28 px label rendered at 28 px, which is `FontScaling` off;
- a chrome `ColumnLayout` filling that canvas, stacking an 88 px `RowLayout` header, a content
  **`ColumnLayout` that holds one `RowLayout` per row of cards**, and a 56 px `RowLayout` footer;
- **Studio's own `GridLayout` is never emitted.** Two measured reasons. Its `Columns`/`Rows` are `String[]`
  and the bridge refuses a scalar write to them (`unsupported_array_write`, 2026-11-16) — and `validate_ops`
  cannot see that for a node the batch is about to create, because its catalogue entry declares `Columns` as
  `String`, so the refusal lands mid-batch. Its per-cell `GridLayoutProperties` child was the last thing
  written before Studio died with a native `invalid unordered_map<K, T> key` in `HMISolution`
  (`FTOptixStudio.0.log` 2026-11-16 21:23:34 → 21:23:41, dump `FTOptixStudio.exe.10352.dmp`), which cost every
  unsaved edit of that session. `gridLayout()` in `packages/optix/lib/containers.js` emits the composition
  Rockwell's shipped widgets use instead, and `layout()` refuses the two node types before a batch is built;
- cards are items of a content row: `Rectangle` + a `Body` `ColumnLayout`, no cell child of any kind.
  **Proven rendering** (`optix-proof/smt/shots/probe-rc.png`, 2026-11-17): two children at `Width -1` with
  `HorizontalAlignment 3` split a 1060 px row as 530 + 20 gap + 514, and a `RowLayout` at `Height -1` with
  `VerticalAlignment 3` took the whole leftover height of the column. An unequal pair has no `fr` spelling the
  bridge will write, so it is two explicit pixel widths — the widths the geometry library already computed;
- card rows are inside that column, so no `LeftMargin`/`TopMargin` on a layout child — a pinned margin is an
  absolute coordinate the layout then fights;
- `Width`/`Height` `-1.0` with the matching alignment `3` is "fill the parent minus the margins"; that pair is
  what `stretch`/`stretchVertical` in `packages/optix/lib/containers.js` emit. **The pair is not optional.** The
  first live render of the SMT demo (`optix-proof/smt/shots/demo-linestatus.png`, 2026-11-17) showed four cards
  hugging their text at ~95 px inside a 1060 px row, each short inside its row, because the emitters wrote the
  `-1` and left the alignment at its default. `layout()` now derives the alignment from the size — a `FILL`
  dimension implies `ALIGN.STRETCH` unless the caller names one, a pinned pixel dimension gets none — and
  `surface()` in `packages/optix/lib/screens.js` and `cellSurface()` in `packages/optix/lib/kit.js` emit the pair
  on a leaf rectangle. The same screens then rendered as two equal rows splitting 1060 px 50/50 with every card
  filling its row (`optix-proof/smt/shots/demo-stretch-linestatus.png`, `…-stationhealth.png`, and the whole
  window in `…-alarms-full.png`).

Two things a container cannot do, so the generators keep them as they are: a layout container has **no fill**
(`FillColor` is a `Rectangle` property; the bridge answers `unknown_property`), so a coloured band is a
`Rectangle` plus a container over it; and the shell's `NavigationPanel` rail and the panel loader stay where
they were measured, because a nav button compiled inside a panel resolves the design-time loader at run time
and the runtime answers "No behaviour or observer found that handles ChangePanel".

Budgets: a container screen costs more operations than the pinned version it replaced (measured 2026-11-17 on
the 1280×800 canonical design with each card carrying one value row and one lamp row: 1 card 138 ops, 2 cards
189, 3 cards 246, 4 cards 297 without navigation; 161 / 212 / 270 / 321 with a two-button nav row — the
alignment pair the fill rule adds is about five operations a card) against `maxScreenOps`, default 400, and the
whole batch must be validated in one call, so one card too many is a refusal with a name, never a half-built
screen. The three live SMT screens applied 276 / 340 / 240 operations at 1060×706.

## What a live session still has to prove

The tree above is now measured against a rendered screen for its two load-bearing shapes: the stretched
`ScaleLayout` and the `ColumnLayout`-of-`RowLayout`s body (screenshot paths in the bullets). What is still
owed, in this order:

1. **several stretched rows splitting one `ColumnLayout` equally.** Settled in shape, not in spelling: the live
   SMT screens place two `RowLayout`s, each carrying the height the geometry computed (`rowHeights`), inside one
   content `ColumnLayout`, and both rendered as equal bands with the gap between them
   (`optix-proof/smt/shots/demo-stretch-alarms-full.png`). Two `Height -1` rows inside one column is still
   unmeasured, which is why the emitters keep naming the height;
2. **clipping versus push.** A card whose rows are taller than its reserved row either clips or grows the row,
   and which one happens decides whether the emitters keep their minimum heights or can stop reserving them.
   The demo cards never exceeded their row, so this is still open;
3. **`ContentAlignment` on a `RowLayout`.** `ContentAlignment 1` on an 88 px header row placed the group at
   475→920 inside a 215→1275 row: near-centred, not exactly (exact centring would start near 522), so the
   enum's meaning is still not pinned;
4. **the kit's STRETCH `ScaleLayout`** (a progress bar's 100 px design canvas, `FillMode 1`) scaling to the
   width of its row — the Fit canvas is proven, the Stretch one is not;
5. **a container screen in a window larger than the design box.** The fit factor was measured in a 1060×736
   content area of a 1280×800 window; the 1920×1080 case that motivated the change has only been reasoned
   about, not opened.

Two authoring mechanics the same session measured, worth keeping beside those proofs:

- a `NodeId` write cannot point at a node the same batch creates: `set_property` on a `NodeId` resolves the
  path against the **live** model, so a pointer to a node created earlier in the batch is refused
  (`bad_value: NodeId value must be a resolvable node path`). Create the node, then point at it in a second
  batch;
- `set_link` is not validated by bridge 1.0.9 (`unknown_op: it will be applied unchecked`), so a pointer is
  written with `set_property` on the NodeId variable, which echoes the resolved `NodeId` back.

Until 1, 2 and 5 are seen on a screen, report a container screen as authored and partly unverified, exactly as
the binding rules report an unwired link. Studio Save and Ctrl+Shift+B are still required before the runtime
loads a bridge-authored batch, and Studio's own write lands several seconds after the `Ctrl+S` keystroke: a
runtime restarted inside that window serves the **pre-save** design, so restart it again rather than trusting
the first render.

## Facts that decide the design

- `UI/MainWindow` is `1280 x 800` in this template; a screen's own `(0,0)` starts at the content area, so a
  screen node at `LeftMargin 24` sits 24 px inside the panel, not 24 px from the window edge.
- A Label has no background, no border and no padding. Every card, pill, band and divider is a Rectangle
  behind the text. Children paint in creation order, so a label must be created **after** the shape it sits on,
  and the bridge cannot reorder children afterwards (`reorder` answers `reorder_index_unreached`).
- `TextHorizontalAlignment` `Left=0`, `Center=1`, `Right=2`; `TextVerticalAlignment` `Center=1`;
  `FontWeight` takes `700`/`600`.
- Text below 11 px fails the design rubric (`VIEW-TYPE-02`, critical). 11 px captions, 13-19 px values,
  22-25 px titles.
- Colours are packed ARGB (`0xAARRGGBB`). A colour written without the `0xFF` alpha byte is fully
  transparent — that is why a lamp or a pill can be "set" and invisible.

## The authoring order that avoids rework

1. `optix_screen` or `optix_ui action="screen"` for a whole screen from a blueprint (a container tree that
    scales, refuses what cannot fit), rather than hand-placing twenty rectangles.
2. Shapes first, then labels, then bindings.
3. `optix_ui action="review"` — the rubric names the concrete fixes (contrast, touch targets, missing caption,
   vendor component vs drawn lookalike).
4. `optix_ui action="audit"` for the house theme; `optix_design_check` for the touch/caption/contrast rules.
5. `optix_save`, `optix_emulator action="restart"`, `optix_screenshot`.

## Slots worth knowing

- The shell draws a 64 px header and a 220 px navigation rail (`SHELL_MAX_RAIL` limits the item count); the
  content area is what remains. A screen that assumes the full 1280 width slides under the rail.
- Vendor components (`optix_library`) arrive as ObjectTypes; instantiate one per screen and set its own
  pointers (`Logger` for a trend, `Model` for an alarm grid) rather than drawing a lookalike.
