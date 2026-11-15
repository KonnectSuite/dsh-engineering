# Advanced SVG in FactoryTalk Optix

An `AdvancedSVGImage` is how a FactoryTalk Optix project shows artwork whose parts change with the
process: a conveyor that turns red while the line is stopped, a tank whose fill level moves, a valve
that opens. It is not an animation engine — it is one image whose individual elements can be recoloured
and restyled at runtime — and that constraint is why it is worth a tool.

Everything below was measured against Studio 1.8.1.27 with bridge 1.0.9 on 2026-11-15, and the object
model is in the shipped catalog (`optix_schema { action: "type", name: "AdvancedSVGImage" }`).

## The object

`AdvancedSVGImage` extends `Container`, so it takes the usual geometry (`LeftMargin`, `TopMargin`,
`Width`, `Height`, `Rotation`, `Visible`, `Enabled`, `Opacity`). Its own properties:

| Property | Datatype | Use |
| --- | --- | --- |
| `Path` | `ResourceUri` | the drawing, as a resource URI |
| `FillMode` | `ImageFillModeEnum` | `Fit`, `Stretch` or `Tile` |
| `ColorizationMode` | `ColorizationModeEnum` | how the whole image is tinted |
| `Blink` | `Boolean` | flash the whole image |
| `HitTestVisible` | `Boolean` | whether the image takes clicks |
| `SVGElementProperties` | element type `SVG Element Property` | the parts this image drives |

One method, `SetImageContent(ImageContent: String)`, replaces the drawing at runtime with SVG XML. It
is runtime-only (it does nothing at design time), it is not persisted, and the cheat sheet notes the
change is lost when the page is reloaded or the source changes — so it is for generated drawing, not
for configuration. Configuration is `Path` plus element properties.

## Conformance: the three conditions

Optix changes an element only when all three hold. Miss one and the file still renders — it simply
never moves, which is the failure that costs hours.

1. **SVG 1.2 Tiny.** A full SVG 1.1 or 2.0 file may draw, but the properties cannot be driven.
2. **The element carries `id`.** The element property's `ID` selects a part of the file "using the ID",
   so an element without one cannot be addressed at all.
3. **The paint is a hexadecimal colour declared as an XML attribute or inline CSS.** `fill="#30A46C"` or
   `style="fill:#30A46C"` works. `fill="red"`, `fill="rgb(48,164,108)"` and `fill="url(#gradient)"` are
   drawn but not drivable.

The element property itself is two values: which part (`ID`), which property (`Property`:
`Color`, `Opacity`, `StrokeWidth`, `StrokeDasharray`), and the `Value` — a literal or a dynamic link.
An opacity of `0` is transparent; a stroke width needs a `stroke-width` on the element to be meaningful.

`optix_svg { action: "inspect" }` answers all of this without touching the project: `conformant`,
`controlable` (each element with the properties it really supports), and `findings` whose severity
separates *blocks control* from *may not display*. It also reports `property_name_collision`, because
the element-property node is named from the id and the property (`Conveyor` + `Color` ->
`Conveyor_Color`), so two ids that differ only by punctuation would collide.

## The workflow

1. `optix_svg { action: "inspect", source: "<path>.svg" }` — read `conformant` first. If it is false,
   apply the `repairs` list to the drawing: the tool names the exact change (`fill="#30A46C"` for a
   gradient reference, an `id` for an unaddressable element, a rename for a collision).
2. `optix_svg { action: "add", screen, name, source }` — copies the file to `<project>/ProjectFiles/imgs/<name>.svg`,
   creates the `AdvancedSVGImage` on the screen, and writes `Path` as `%PROJECTDIR%/imgs/<name>.svg`.
   The file belongs under `<project>/ProjectFiles`, which the engine serves as `/projectfiles/...`; a copy in `<project>/imgs` renders blank and answers 404 (measured 2026-11-15). The `%PROJECTDIR%` form is required: the Web presentation engine refuses any path outside the project
   folder, so an absolute Windows path draws in the native engine and breaks the browser one.
3. `optix_svg { action: "bind", node, id, property, value }` — creates the
   `AdvancedSVGImageElementProperty` and writes `ID`, `Property` and `Value`. For live data pass
   `source_path` (a model or tag path) for a dynamic link, or `bool_colours: { on, off }` to turn a
   boolean into the two colours. The element property lands inside the image's `SVGElementProperties`
   collection, which the tool names explicitly: a create the bridge would auto-route into a collection
   comes back as a warning, and a strict batch refuses warnings.
4. `optix_svg { action: "list", screen }` — read back which images exist, what each one's `Path` is and
   which parts it drives, so a change is verified from the model rather than assumed.
5. `optix_design_check { screen }` — `OPTIX-IMG-01` fires while an image has nothing bound, and clears
   once a part is bound.

## Limits worth knowing

- **No gradients or filters.** `linearGradient`, `radialGradient`, `pattern`, `filter`, `clipPath`,
  `mask`, `foreignObject`, `script` and animation elements are outside the supported subset. A file that
  uses them can still be drivable on other elements; the inspection reports each one separately.
- **Colour, opacity and stroke only.** Position, rotation and path geometry are not drivable, so a
  moving part is done with a separate image, a `Move`/`Rotate` animation on a container, or NetLogic.
- **`SetImageContent` is not configuration.** It is for drawing generated at runtime and does not
  survive a reload.
- **The element property is a child node, not a property.** It is created inside
  `SVGElementProperties`; reading a node's `children` shows it, and its own `ID`/`Property`/`Value` are
  variables under it.
- **Text inside the drawing is not translatable through Optix.** Use a `Label` over the image when the
  words must be localized.
