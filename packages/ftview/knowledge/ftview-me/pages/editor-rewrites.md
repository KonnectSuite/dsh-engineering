# What the editor rewrites on import

<!-- section: Authoring; identifiers: geometry, innerPolygon, line, path, polyline, percent of the object box, fontSize, charHeight, cornerRadius, re-export -->

An authored display is not a round-trippable document. Studio reads the XML you
give it, stores its own model, and writes a different XML when you export again.
Most of that difference is vendor defaults; a smaller part is geometry the editor
recomputes. Knowing which is which is what lets you read a comparison without
mistaking a rewrite for a lost object.

Every figure below was measured on one machine by authoring a display, importing it
through the Add Component Tool and exporting it again. The display held one object
of each shape at a known position, so each line of the table is one observation.

## Object geometry is written as a percentage of the object box

The coordinates inside a graphic object — `line` on a line, `path` on a polyline,
`polygon` on a polygon or poly-polygon, `innerPolygon` on a poly-polygon — are read
as a percentage of that object's own box (`left`, `top`, `width`, `height`). The
export writes them back as absolute display pixels, inset by one pixel:

| Written | Box | Exported |
|---|---|---|
| `path="0 0 100 0 100 100"` | `left=300 top=200 width=200 height=100` | `path="301 201 500 201 500 299 "` |
| `innerPolygon polygon="0 0 100 0 100 100"` | `left=400 top=125 width=170 height=90` | `polygon="400 125 569 125 569 214 "` |
| `line="0 0 100 0"` | `left=10 top=10 width=100 height=10` | `line="15 15 105 15 "` |

A number above 100 is not an error and not a distance in pixels: it is clamped to
the box edge. Writing `path="300 320 400 320 400 420"` on a `200 x 100` box gave
`"301 321 500 321 500 419 "` — every point pushed to the percentage limit, not to
`300 320`.

The consequence for a comparison: coordinates that look wildly different from the
draft are usually the same shape in the other coordinate system. Compare the
exported pixels against `box + percentage`, not against the number in the draft.

## A line is a box, not two points

A `<line>` reports both a box and a `line` attribute, and the editor recomputes one
from the other on import:

- a line written with a `line` attribute exported with `lineWidth` equal to the
  box's short side (`lineWidth="2"` was written, `lineWidth="10"` came back on a
  10-pixel-high box) and with endpoints inset by half of it;
- a line written with no `line` attribute exported as the box diagonal, inset by one
  pixel, and kept `lineWidth="2"`.

So neither the endpoints nor the pen width of a written line round-trip. Set the
box the line should occupy and treat the exported `line` attribute as the editor's
report, not as your input returned.

## Text size lives in charHeight and charWidth

`fontSize` is an input convenience: the editor drops it on export and reports
`charHeight` and `charWidth` in pixels instead, recomputed from the font metrics.
The measured pairs on a 40-pixel-high text object:

| Written | Exported |
|---|---|
| `fontSize="18"` | `charHeight="40" charWidth="26"`, no `fontSize` |
| `charHeight="20" charWidth="10"` | `charHeight="40" charWidth="25"` |
| nothing | `charHeight="40" charWidth="22"` |

The box also shrinks by a few pixels against the text (`width="200"` exported as
`196`, `198` or `199` depending on the string), and `sizeToFit`, `wordWrap`,
`alignment="topLeft"` and `fontFamily="Arial"` appear even when the draft set none
of them. A comparison that expects `fontSize` to survive will report every text
object as changed.

## Some attributes are dropped, not stored

- `cornerRadius` on a `<panel>` is dropped entirely, even though the vendor schema
  declares it for that type. A rounded panel cannot be authored through XML and
  confirmed by re-export.
- `cornerRadius` on a latched, maintained or momentary button exports as `0` while
  `shape="rounded rectangle"` survives — the shape carries the rounding.
- `fontSize="1"` is clamped to `2` on the list, gauge, message and time displays
  that report it.

## The export adds far more than it rewrites

The same import added 127 default attributes across the 13 objects of the probe
display: `visible`, `wallpaper`, `isReferenceObject`, `backColor`, `backStyle`,
`patternColor`, `patternStyle`, `endColor`, gradient properties, `blink`,
`description`, and children such as `<imageSettings>` on buttons and `<threshold>`
on bar graphs and gauges. This is why a byte comparison of draft and re-export is
never clean, and why `ftview_verify_import` reports vendor-added attributes as
normalisation rather than as a difference.

## Reading a comparison honestly

The order that actually proves something:

1. `ftview_validate` — the draft against the vendor schema, before anything is
   written.
2. `ftview_apply` — the export folder and its batch import manifest.
3. Import it in Studio or with the Add Component Tool.
4. Export again and compare. `ftview_verify_import` does this for you and keeps the
   folder it compared against.

A display whose objects all exist and whose only differences are the rewrites above
did import. A display whose object is missing did not, and no amount of default
attribute churn explains that.
