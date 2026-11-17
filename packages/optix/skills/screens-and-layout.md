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

## What a live session proved (2026-11-17, `UI/Screens/ProbeContainers`, since deleted)

The tree above is measured against a rendered screen. The probe was authored through `optix_edit` in four
dependency-ordered batches (24/23/30/30 ops) because the installed plugin emits no containers, and measured
through the DOM: the runtime's element ids are **not** the bridge's node guids, so `getElementById` fails for
every guid the map reports — measure structurally with `[data-type="scaleLayout|columnLayout|rowLayout|rectangle"]`,
`getBoundingClientRect()` and the computed `placeSelf` / `gridTemplateRows` / `gridTemplateColumns`.

1. **several stretched rows splitting one `ColumnLayout` equally — settled.** Two `Height -1` rows with
   `VerticalAlignment 3` in a 608 px column with a 10 px gap both rendered **299 px**: `(608 - 10) / 2`. A row
   left at `FILL` splits the column, so `rowHeights` is for a band the design *must* pin (a 44 px touch floor,
   a reserved footer), not for making rows equal — and pinning means `VerticalAlignment 0` on that axis, which
   item 7 is about;
2. **clipping versus push — it pushes.** A child declared 900 wide inside an 800 px design track rendered
   **1192.5 px** and its `Width -1` sibling rendered at **w=0 at x=1433**, past the window edge. A layout
   neither shrinks nor clips a child to make room for its neighbours, and the overflow is drawn rather than
   cut. `VIEW-LAYOUT-03` in `design.js` is the check that names it before the screen is saved (evidence: the
   track, whose design box it is when the layout fills a `ScaleLayout`, the px the fixed children take, and
   how far past the rendered box they land);
3. **`ContentAlignment` on a `RowLayout` — pinned.** It is `ContentHorizontalAlignment` with members
   `0 Left`, `1 Center`, `2 Right` and **no Stretch member**, so it positions natural-sized children only: the
   three probe cells put their label at x **220 / 430 / 657**. A child at `Width -1` with
   `HorizontalAlignment 3` ignores it. `ColumnLayout`'s twin is `ContentVerticalAlignment`, and `1` centred a
   pair vertically while the horizontal axis stayed left. The earlier "near-centred, not exactly" reading was
   the group being centred as a group, not a bug;
4. **the kit's STRETCH `ScaleLayout` (`FillMode 1`) — proven, and it scales non-uniformly.** A design box of
   800×500 in a 1060×800 host rendered at **1.325 × 1.6**, so a 100 px progress bar drawn on a 100 px canvas
   stretches with the row. A nested `ScaleLayout` on `Fit` computes its uniform factor from **its own rendered
   box** (265×160 ÷ 100×50 → **2.65**) and centres that scaled design box when the aspects differ;
5. **gaps are not scaled by a `ScaleLayout`.** A 20 px row gap and a 10 px column gap stayed exact through the
   1.325 × 1.6 stretch. A gap is a real cost at any zoom, which is what makes the equal-split arithmetic in
   item 1 worth writing down;
6. **a layout's own margins come off its track before its children spend it.** On the demo's `LineStatus`,
   `Content` is `Width -1` with `LeftMargin 24` and `RightMargin 24` inside a 1060 px design box, and it
   rendered **1012 px at x=244** — its `RowLayout` child also 1012 px. Push `Row1/Card1` to `Width 1050` and the
   row rendered Card1 at 1050 px and its `Width -1` sibling `Card2` at **w=0 at x=1314** (244 + 1050 + 20), 58 px
   past the row's own right edge. `VIEW-LAYOUT-03` reported `track 1012`, `used 1070`, `past_the_box 58` — the
   margins are the difference between a rule that fires and a rule that is 48 px wrong. A layout-placed child
   reports no margin in the model (the runtime emits `margin: 0px`); a hand-placed node's `LeftMargin` is a
   position, not a share of the track, so only the container's own margins are subtracted.

   How the runtime lays a row out, from the same measurement: a `RowLayout` is `display: flex` with
   `column-gap`, and a child with a named size gets `width: Wpx; min-width: Wpx` with **no flex properties**,
   while a child at `-1` gets `flex-grow: 1; flex-basis: 0px; min-width: 0px`. That is exactly why the fill child
   collapses to zero instead of being shrunk. The `ScaleLayout` and `Rectangle` wrappers are CSS grid
   (`grid-template-columns: minmax(0px,1fr)`), so measure both kinds structurally rather than by element id.

7. **`Stretch` (3) on an axis *is* the size on that axis, and it discards the number written there.** Four
   states of one node (`UI/Screens/AlarmSummary/Canvas/Layout/Content/Row3`), one variable changed at a time,
   each saved and re-measured in a fresh runtime:

   | authored | rendered | the runtime's spelling |
   | --- | --- | --- |
   | `Height 300` + `VerticalAlignment 3` | **158** (the leftover fill) | `flex-grow: 1; flex-basis: 0px; min-height: 0px` |
   | `Height 300` + `VerticalAlignment 0` | **300** | `height: 300px; min-height: 300px; flex: 0 1 auto` |
   | `Width 500` + `HorizontalAlignment 3` | **1012** (the whole track) | `width: auto; align-self: stretch` |
   | `Width 500` + `HorizontalAlignment 0` | **500** | `width: 500px; align-self: flex-start` |

   It holds on both axes and whatever the parent's orientation is, and the model keeps the number the runtime
   threw away — `optix_read node` still reported `Height 300 (Float)` while the row drew at 158. Two rules come
   out of it: `VIEW-LAYOUT-04` reports a numeric size beside alignment 3 as discarded, and `VIEW-LAYOUT-03`
   counts such a child as a **fill sibling** rather than spending its number against the track (read as a fixed
   300 it invents a starvation the runtime never causes). `layout()` in `containers.js` refuses to emit the
   pair. The consequence for a design: pinning a band means alignment 0 on that axis, and a pinned band competes
   for the leftover — on this screen pinning `Row1`/`Row2` at 247 would have left `Row3` 514 − 247 − 247 − 40 =
   **20 px**, which is the same squeeze measured in item 2.

   The other half of the same rule: a `-1` under alignment 0/1/2 renders at **content size**, not at the track.
   That is why the demo's `Header` and `Footer` — `Width -1` written by the older emitter, which did not derive
   Stretch from a fill size — drew 204 px and 280 px wide instead of 1012. A fill size and a stretch alignment
   belong together; a `-1` with no alignment is a label that hugs its text.

The one case still not opened is a window genuinely larger than the design box (the 1920×1080 panel). The
mechanism is proven both ways — a fit factor computed from the rendered box, up-scaling included — but the
bigger-window number has been reasoned about, not measured.

Two authoring mechanics the same session measured, worth keeping beside those proofs:

- a `NodeId` write cannot point at a node the same batch creates: `set_property` on a `NodeId` resolves the
  path against the **live** model, so a pointer to a node created earlier in the batch is refused
  (`bad_value: NodeId value must be a resolvable node path`). Create the node, then point at it in a second
  batch;
- `set_link` is not validated by bridge 1.0.9 (`unknown_op: it will be applied unchecked`). The batch runner
  treats that as unchecked rather than as a refusal and reports the op in `unchecked`, so a dynamic link can be
  authored through a batch (it lands as a `DynamicLink` child, `DataType: NodePath`). A **pointer** is still
  written with `set_property` on the NodeId variable, which echoes the resolved `NodeId` back.

Studio Save and Ctrl+Shift+B are still required before the runtime loads a bridge-authored batch, and the order
that proves a change is `optix_save` → **poll the YAML's `LastWriteTime` until it moves** → `optix_emulator
restart` → **navigate the browser again**. `optix_save` reports `saved_at` at the keystroke plus a few seconds of
latency, but Studio writes the file later still (measured: `saved_at 17:39:17Z`, `Screens.yaml` stamped 17:39:29),
and a runtime restarted inside that window serves the **pre-save** design. A page opened before the restart keeps
rendering the old screen over a dead WebSocket even after a cache-busting reload, so re-navigate rather than
refresh. A bridge write is not durable until that save: when Studio crashed mid-session an unsaved `Width` change
was simply gone, and every file under `Nodes/` came back as it was.

## Facts that decide the design

- `UI/MainWindow` is `1280 x 800` in this template; a screen's own `(0,0)` starts at the content area, so a
  screen node at `LeftMargin 24` sits 24 px inside the panel, not 24 px from the window edge.
- **A screen is handed the box its mounter declares, not the window's.** The starter's `ShellRail` is
  `TopMargin 64`, `Width 1280`, `Height 706`, `TabWidth 220` (`packages/optix/templates/arya-optix-app/project/Nodes/UI/UI.yaml`),
  so the content area is **1060×706** and `ShellFooter` starts at `TopMargin 770` with `Height 30`. When the
  live demo's rail had drifted to `Height 800`, the mounted screen rendered 1060×**800** and the window clipped
  the last 64 px — it did not squeeze the screen to fit. Size the mounter, then design to what it declares;
  `optix_design_check` reports that box as `mounted_in` and names a mounter that reaches past the window
  instead of inventing a smaller one.
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
