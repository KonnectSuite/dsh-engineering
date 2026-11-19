# Artwork

FactoryTalk Optix can drive parts of an **SVG** at runtime: an `AdvancedSVGImage` renders the drawing,
and one `AdvancedSVGImageElementProperty` per controllable part binds that part's colour, opacity,
stroke width or dash array to a value or a tag. The catch is conformance, not authoring — a drawing that
breaks the rules renders perfectly and refuses every property silently. `optix_svg` is the tool for that
whole path: `inspect` says whether a drawing can be driven before it is placed, `add` places it under
`ProjectFiles/imgs` with the one path the Web engine serves, `bind` wires a part, and `list` reads back
what each image on a screen animates. `optix_ui { action: "assets" }` writes the authored icon and process
set into the same folder.

## What Optix can drive

| Thing | What it is |
| --- | --- |
| `AdvancedSVGImage` | the widget: one drawing, rendered on the screen, extended from `Container` |
| `Path` | the drawing's resource URI, written as `%PROJECTDIR%/imgs/<name>.svg` |
| `SVGElementProperties` | the collection of element properties — every dynamic part of the drawing lives here |
| `AdvancedSVGImageElementProperty` | one part driven: an `ID` (the SVG element's `id`), a `Property` and a `Value` |
| `SetImageContent(string)` | a **method**, not a setting: it swaps the drawing at runtime and is not persisted |

The `Property` values are the four things the renderer can change on a part:

| Value | Number | Effect | Notes |
| --- | --- | --- | --- |
| `Color` | 0 | the part's fill colour | takes an ARGB colour value; a literal `#RRGGBB` string binds directly |
| `Opacity` | 1 | how solid the part is | `0` is fully transparent, so a lamp can be hidden rather than recoloured |
| `StrokeWidth` | 2 | the outline's width | the element needs a stroke for this to show |
| `StrokeDasharray` | 3 | the outline's dash pattern | line style, not colour |

Nothing else moves. There is no property for position, rotation, scale, path geometry or text content, so
a drawing that needs to *move* has to be built as separate parts whose visibility toggles, or animated
from NetLogic through `SetImageContent`.

`optix_schema { action: "type", name: "AdvancedSVGImage" }` is the authority for this build's property
list, methods and allowed children; the catalog is generated from the installed Help.

## The three conditions

An element can be driven only when all three hold:

1. **The file is SVG 1.2 Tiny.** Optix's SVG renderer implements the Tiny profile; a full SVG 1.1 file
   with gradients, filters, masks, `foreignObject`, `script` or SMIL animation elements draws (or does
   not) but cannot be driven.
2. **The element carries an `id`.** No `id`, no target: `SVGElementProperties` addresses a part by name.
3. **The colour is a hexadecimal value on the part.** `fill="#30A46C"` works — written as an attribute or
   in inline CSS. `rgb(48, 164, 108)`, a named colour, `currentColor` and `url(#gradient)` do not, even
   though they render.

Two smaller rules follow from how the properties are stored:

- **An element property's name derives from its id and property** (`Conveyor` + `Color` →
  `Conveyor_Color`). Two ids that would collide once the suffix is added are a finding, and `bind`
  appends rather than duplicating, so a second bind on the same part restates it.
- **The drawing should have no script.** It is artwork, not behaviour; anything dynamic belongs in
  NetLogic, where it can be reviewed and compiled.

## `optix_svg`: inspect, add, bind, list

| Action | Parameters | What it answers or writes |
| --- | --- | --- |
| `inspect` | `source` (a path) or `inline` (SVG text) | whether the drawing is `conformant`; every `controlable` id with the properties it really supports; findings split into what **blocks control** (no `id`, a colour that is not hex, a colour not on the part) and what **may not display** (unsupported constructs); and a `repairs` list naming the exact edit |
| `add` | `screen`, `name`, `source` or `inline`, `box` (`left`, `top`, `width`, `height`) | copies the file into `<project>/ProjectFiles/imgs/<name>.svg`, creates the `AdvancedSVGImage` on the screen, sets `Path`, sets the geometry, then reads the node back and reports the saved `Path` |
| `bind` | `node`, `id`, `property`, `value` or `source_path` or `bool_colours` | creates the `AdvancedSVGImageElementProperty` under `SVGElementProperties` with `ID`, `Property` and `Value`, and reports the node it wrote |
| `list` | `screen` | the images on that screen and what each one drives, so a review can see what is animated |

`inspect` is the cheapest step and the one that matters most: it is the difference between a drawing that
animates and a drawing that only looks right. Nothing about the placement can rescue a non-conformant
file.

```json
{
  "action": "inspect",
  "source": "artwork/conveyor.svg"
}
```

The report's `controlable` list is the plan for `bind`: each id, the properties that make sense for it,
and the reason any other property was rejected. A file with no `id`, gradients, filters, `foreignObject`,
`script` or animation elements is reported, not silently accepted.

### Placement: why `ProjectFiles/imgs`

`add` copies the drawing into `<project>/ProjectFiles/imgs/` and writes `Path` as
`%PROJECTDIR%/imgs/<name>.svg`, because that is the folder the Web presentation engine serves as
`/projectfiles/imgs/...`. A copy in `<project>/imgs` — beside the project, not inside it — answers **404**
and renders as a blank image; measured 2026-11-15, which is why `add` writes where it writes. The engine
refuses any path outside the project folder, so an absolute path is not an escape hatch.

The `box` is placed through the same layout arithmetic as any other component, and the image is an
object on the screen like a card: it has geometry and a node name, and it can be moved, reordered and
re-styled.

### Binding a part

```json
{ "action": "bind", "node": "UI/Screens/Line/OvlConveyor", "id": "Conveyor", "property": "Color", "source_path": "Model/Smt/LineRunning" }
```

Three forms, and which one to use depends only on what the value is:

| Form | Field | Use for |
| --- | --- | --- |
| Literal | `value: "#30A46C"` | a colour that never changes — a palette test, a fixed part |
| Dynamic link | `source_path` | a value or tag whose colour is computed elsewhere |
| Boolean | `bool_colours: { "on": "#E5484D", "off": "#30A46C" }` | a state: run or stop, fault or healthy |

The boolean form is the one that ships: it becomes the expression `if({0}, 0xFF<on>, 0xFF<off>)` with the
tag as its source — the ARGB form a colour value needs — and it was proven red-to-green on a live render
(2026-11-15) before it was documented.

Two measured details about the writes:

- **The element property is created inside `SVGElementProperties` explicitly.** A create that the bridge
  would auto-route into a collection comes back as a warning, and a strict batch refuses a warning, so the
  collection is named in the operation.
- **The value is read back after the write**, because the node read-back is what shows the value the
  runtime will use rather than the value that was sent.

`SetImageContent` is a runtime method: it changes what is drawn for the current session and is not saved,
so it belongs in a NetLogic, not in a design-time step. The cheat sheet records that it does not work at
design time; use `Path` for anything that must persist.

## Assets

`optix_ui { action: "assets" }` writes the authored set into `<project>/ProjectFiles/imgs/` — the folder
`%PROJECTDIR%` resolves to and the only one the Web engine serves. `mode: "plan"` reports the files and
writes nothing; `only` writes a subset.

| Set | Files | What it is |
| --- | --- | --- |
| Icons | 16 icons, 24 × 24, SVG 1.2 Tiny, hex fills | `home`, `overview`, `alarms`, `trends`, `diagnostics`, `settings`, `users`, `recipes`, `reports`, `logout`, `ok`, `warning`, `alarm`, `offline`, `chevron`, `bell` |
| Process drawings | 2 drawings, every movable part carrying an `id` | `conveyor` — frame, belt, four rollers, workpiece, guard, stack; `tank` — tank, level, pipes, valve |

The process drawings exist to be bound: `Conveyor_Color` turns the belt red when the line stops,
`Tank_Color` shows a fault on the tank. They are what `VIEW-ADAPTER-01` looks for when a screen claims to
show the process — a hand-drawn lookalike passes the geometry checks and loses that finding.

An `Image` node points at `%PROJECTDIR%/imgs/home.svg`, and a `NavigationPanelItem`'s `ImagePath` takes
the same string, so the rail's icons come from the same set.

Measured on the live bridge (`AryaOptixTemplate`, bridge 1.0.9):

| Call | Result |
| --- | --- |
| `action components` | 9 drawn components plus 12 adapters |
| `action assets` (plan) | 3 files reported, 0 written |
| `action assets` (apply, `only: ["home", "alarms", "conveyor"]`) | 3 files written into `ProjectFiles/imgs` |

## Rules that make a drawing animate

1. **Start from `inspect`, not from the drawing.** A non-conformant file cannot be rescued by placement,
   binding or a bigger box; repair the source and inspect again.
2. **Give every part you want to drive its own `id`, on the element that carries the paint.** An `id` on a
   group does nothing; the fill has to be on the part the id names.
3. **Use hex, and put the colour on the part.** Inline CSS counts; `rgb()`, named colours and gradient
   references do not.
4. **Keep it Tiny.** No filters, masks, gradients, `foreignObject`, `script` or SMIL.
5. **Bind only what the drawing needs.** Each element property is a node; a dozen unused bindings is a
   screen that reads as animated and never changes. `OPTIX-IMG-01` reports an `AdvancedSVGImage` with no
   binding at all — the opposite mistake, artwork that can never change.
6. **Prove it in the runtime.** Save and Build in Studio, restart the emulator, and watch the part change
   state. The ops that wrote the binding are not evidence the colour changed.

## Limits

- **Four properties only**: colour, opacity, stroke width, dash array. Position, rotation, scale, geometry
  and text are not driveable.
- **No text in the drawing is translatable.** Operator-facing words belong in `Label`s bound to
  translation keys, not baked into the SVG.
- **`SetImageContent` is a runtime call with no persistence.** A drawing swapped that way is gone on the
  next start; anything that must survive uses `Path` plus element properties.
- **The engine serves one folder.** A path outside `ProjectFiles` is refused; `<project>/imgs` is a 404.
- **A drawing that renders is not a drawing that is driven.** `inspect` is a static analysis of the file,
  not a render: `may_not_display` findings are the renderer's business, and only the runtime shows what
  an operator sees.
- **The conformance list is this build's.** Studio 1.8.1.27's SVG support is what the rules describe; a
  Studio upgrade can add or drop a construct, which is what `optix_schema { action: "refresh" }` is for on
  the object model and what re-running `inspect` is for on the drawing.
