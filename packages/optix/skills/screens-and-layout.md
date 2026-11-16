# screens-and-layout

A screen is a container in a window, and the window decides what a coordinate means.

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

1. `optix_screen` or `optix_ui action="screen"` for a whole screen from a blueprint (grid-placed, refuses what
   cannot fit), rather than hand-placing twenty rectangles.
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
