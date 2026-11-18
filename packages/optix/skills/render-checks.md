# render-checks

A screen passes every model rule and still reads badly, so the render check judges the served pixels — and it needs no Studio bridge at all.

## Why the model is not enough

`optix_design_check` and `optix_production_check` read the design model through the bridge. On the demo's
LineStatus screen every one of their rules was quiet while the screen had four defects an operator can see in
a screenshot. The model reports what was authored; a render is what the runtime instantiates, scales, clips
and paints. `optix_render_check` is the other half, and it runs on the runtime leg: the emulator serving the
saved project is the only thing it needs.

## The five rules

| Rule | What it catches |
| --- | --- |
| `VIEW-RENDER-01` | Rendered text that is a placeholder nothing drives: `--:--`, `{TotalUnits}`, `undefined`, `TBD` |
| `VIEW-RENDER-02` | A painted surface whose text covers under `COVERAGE_MINIMUM` (0.3) of its box and leaves `EMPTY_BAND_MINIMUM` (60 px) empty |
| `VIEW-RENDER-03` | A painted surface or control drawn outside the box the runtime serves, which the runtime clips instead of shrinking |
| `VIEW-RENDER-04` | Text whose colour does not separate from what was painted under it, under `CONTRAST_MINIMUM` (4.5:1) |
| `VIEW-RENDER-05` | Text drawn in the very colour behind it: its captured box holds no pixel more than `INVISIBLE_MAX_DISTANCE` (20) away |

Plus the two corpus rules re-decided on the painted box rather than the authored one: `HMI-TARGET-01` (a
rendered target under 44 px) and `VIEW-TYPE-02` (computed font under 11 px).

## The engine paints where the model does not say

Measured on the served page, and the reason the colour rules read pixels:

- A `[data-type="rectangle"]` computes `backgroundColor: rgba(0, 0, 0, 0)`. Its fill is on an **untyped child
  div** carrying `width: 100%; height: 100%`, which is an *ancestor* of the element's real children. Its border
  is an **inset `box-shadow`**. Judging `entry.background` calls every card unpainted — `surfacePaint()` looks
  through that overlay child instead.
- A `NavigationPanel` paints its tab strip with `background-image: linear-gradient(…)`. Only 14 elements in the
  whole served page carry a non-transparent `backgroundColor`.
- Fills are **sibling underlays**, not ancestors: the band rectangles come before the content layout under the
  screen's child-wrapper, so a parent walk finds nothing under the text. `paintUnder()` takes the
  latest-indexed earlier element whose box covers the text's centre; `textOver()` takes later-indexed text
  whose centre falls inside a surface.
- The engine gives a `label` **element** a container-sized box (measured: 1280x800 at (16,12)) while the text it
  paints is 22.6x16 at (860,18). `VIEW-RENDER-03` therefore judges only painted surfaces and interactive
  controls, never a wrapper div.
- The served page has **no `canvas` element**: `document.body` holds `div#root` measuring **1264x0** (its child
  is positioned, so the container collapses) and under it `div[data-type="window"]` at 1280x800. A walk that
  stops at a zero box measures an empty page, and a capture that waits for a canvas never settles. Both now
  prefer the runtime's own `[data-type="window"]` element.

## The known-answer proof

The same screen, checked with the bridge down and the emulator serving it: 172 elements measured, 29 text
elements, 0 unchecked, **7 findings** — `VIEW-RENDER-01` on the header clock `--:--`; four `VIEW-RENDER-02` on
the cards (coverage 0.27, 0.03, 0.05, 0.03; 148-190 px empty of a 247 px card); `VIEW-RENDER-05` on `Ready`
(`#0fafff` on `#0fafff`, pixel distance 1); `VIEW-RENDER-04` on the rail's **selected** tab (`#ffffff` on
`#0fafff`, 2.44:1). The header title, white on `#005d8a` (7.16:1), produced no finding — that pair is the
discriminating case the spec pins.

The run also surfaced a defect no rule was written for: content Row1 rendered **96.2 px + 895.8 px** inside a
1012 px track while Row2 rendered 496 + 496. One card lost its Stretch alignment, so it hugged its content and
its `Width -1` sibling took the whole track. That is the starvation behaviour measured in
`screens-and-layout`, visible in a real screen.

## What it honestly cannot say

- **A finding names a rendered type chain, never a project path.** DOM ids are the runtime's own
  (`ns=9;g=…`) and are not the bridge's guid, so `located_at` is `window > … > rowlayout > rectangle`. Match it
  to a node by reading the screen with `optix_design_check` and pairing the geometry.
- **It proves the project as saved.** The runtime serves the saved file, so unsaved bridge authoring is not in
  what it judges; the answer carries `unsaved_changes` when the bridge is reachable.
- **Paint order is DOM order.** A `z-index` or a positioned overlay that reorders paint can mislead
  `paintUnder()` and `textOver()`. Nothing in this project's served page does.
- **`decodePng` reads an 8-bit non-interlaced RGB or RGBA PNG.** A palette, 16-bit or interlaced capture is
  refused, the colour rules fall back to the DOM, and `unchecked` says so. `measured.paint_read` is
  `"captured pixels"` or `"dom"` — a DOM-only judgement cannot see a gradient or an inset border.
- **An unmeasurable page never reports clean.** Zero measured elements, a `max_nodes`/`max_depth` cap hit, or a
  text element with nothing painted under it all land in `unchecked`, capped at `UNCHECKED_REPORTED` (40) lines
  plus the count of what was not listed.

## How to use it in the loop

Run it after a save and a restart, on the screen you just changed, with the emulator serving. A finding is a
statement about the render, not the model: fix the model, save, restart, run it again. Pair it with
`optix_design_check` on the same screen — one names the node, the other names what an operator actually sees.
`include_image` returns the capture clipped to the served window, so the screenshot and the findings describe
the same pixels.
