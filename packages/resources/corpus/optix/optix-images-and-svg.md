---
id: optix-images-and-svg
title: Vector artwork that can be driven, not swapped
domain: optix
level: practitioner
basis: [creating-projects/graphic-objects/predefined/Image.html, creating-projects/graphic-objects/predefined/Multistate-image.html, creating-projects/graphic-objects/predefined/Add-an-Advanced-SVG-image.html, creating-projects/graphic-objects/predefined/Advanced-SVG-image.html, creating-projects/graphic-objects/predefined/configure_an_image.html, creating-projects/graphic-objects/predefined/Presentation-engines.html, Reference/FTOptix-UI/ObjectTypes/Image.html, Reference/FTOptix-UI/ObjectTypes/MultiStateImage.html, Reference/FTOptix-UI/ObjectTypes/MultiStateImageState.html, Reference/FTOptix-UI/ObjectTypes/AdvancedSVGImage.html, Reference/FTOptix-UI/ObjectTypes/AdvancedSVGImageElementProperty.html, creating-projects/project-nodes/Paths.html, best-practices/graphic_rendering_impact.html]
tags: [images, svg, multistate, colour, resources]
applies_to: [optix]
rules: [OPTIX-IMG-01, OPTIX-IMG-02, OPTIX-IMG-03, OPTIX-IMG-04]
---
## Principle
Three objects look similar and behave differently. An `Image` shows one file from a resource URI. A
`MultiStateImage` shows one of several files chosen by an integer `StateValue`, each state carrying its own
`Path` and `Opacity`. An `AdvancedSVGImage` loads one SVG and exposes named parts of it as element properties,
so the same drawing can be recoloured or dimmed without replacing the file. Picking the wrong one is not a
visual choice: it decides whether a value can drive the artwork at design time or whether a NetLogic has to
replace the whole document at runtime.

The SVG path has conditions. The Advanced SVG image requires an SVG 1.2 Tiny file that contains the ids and
properties to be changed, with fill and stroke declared and colours written as hex values as XML attributes or
inline CSS. A file that does not conform still displays, but its properties cannot be changed — the project
looks finished and the highlight simply never happens. Element properties select a part by its `ID`, set a
`Property` (colour, opacity, stroke width or stroke dasharray) and take the `Value` from a variable.

Where the file comes from is part of the contract. Images are resource URIs, and the web presentation engine
serves files only from the project directory, so a path that points outside `%PROJECTDIR%`, or an absolute
path on the engineer's machine, works in the emulator and returns nothing on the panel or the browser.
`%PROJECTDIR%` is the shortcut for files transferred with the project; `%APPLICATIONDIR%` is for the runtime
database and exported files, not for artwork.

## Rules
- **OPTIX-IMG-01** Graphics that must scale, recolour or animate are SVG; PNG or JPEG is reserved for
  photographs and bitmaps and is sized to the area it occupies instead of being scaled by the object; every
  `Path` is a resource URI under the project directory (`%PROJECTDIR%`-relative), never an absolute path on
  the engineering machine.
- **OPTIX-IMG-02** An SVG used with element properties conforms to SVG 1.2 Tiny, declares a width and height so
  the web and native engines render it identically, and gives every part that a value drives an `id` plus a hex
  fill or stroke as an XML attribute or inline CSS; a file that cannot meet that is used as a plain Image and
  the limitation is stated rather than left as a highlight that never appears.
- **OPTIX-IMG-03** `AdvancedSVGImage` is chosen only when its `SVGElementProperties` collection holds at least
  one entry that binds an `ID`, a `Property` (colour, opacity, stroke width or stroke dasharray) and a `Value`
  from a variable; an AdvancedSVGImage with an empty collection is replaced by an `Image`, because the extra
  object adds cost and no function.
- **OPTIX-IMG-04** State and colour feedback uses `MultiStateImage` (`StateValue` plus a `States` entry per
  state, each with `Value`, `Path` and `Opacity`) or `ColorizationMode` with `DynamicColor` on an SVG; a
  runtime path swap by variable, or `SetImageContent` used as the design-time styling mechanism, is a defect -
  `SetImageContent` is a C# runtime method that takes the complete SVG XML.

## Apply
Confirm the shape before authoring. `optix_read` `{action:"type_schema", type:"AdvancedSVGImage"}` and the same
action for `AdvancedSVGImageElementProperty` return the property names and the `Property` values this build
accepts, so the page names colour, opacity, stroke width and stroke dasharray only after the schema confirms
them.

Put the file where the engine can serve it. Import through the object's `Path` resource picker, or stage the
property with `optix_edit` `set_property` on `Path` using a `%PROJECTDIR%`-relative resource; `configure_an_image`
documents Browse and Import, and the nine-slice margins (`ImageLeftMargin`, `ImageTopMargin`,
`ImageRightMargin`, `ImageBottomMargin`) are set in the same object when a frame must not distort. A file that
must be visible to the web engine lives under the project directory; `%APPLICATIONDIR%` is not an artwork
location.

Author the right object. `optix_edit` `create_widget` with `widget_type` `Image`, `MultiStateImage` or
`AdvancedSVGImage`; for the multistate variant add one state per value through `create_object` with
`object_type` `MultiStateImageState` under the object's `States`, then `set_property` `Value`, `Path` and
`Opacity` per state and bind `StateValue` to the integer that selects it. For the advanced variant add an
`AdvancedSVGImageElementProperty` entry per driven part, set `ID` to the SVG `@id`, `Property` to the enum
value, and `bind` or `attach_expression` its `Value`; opacity is entered as 0-100, stroke dasharray as Solid,
a single number, or a `#;#` series such as `5;2;10;3`, and an invalid binding reverts to the value in the file.

Prefer colourisation over document replacement. An SVG whose whole colour must change uses the image's
`ColorizationMode` (`Replace`, `Hue`, `Multiply` or `Add`) with `DynamicColor` bound to the state; only when
individual parts must differ does `SVGElementProperties` carry the job. `SetImageContent` stays out of the
design: it exists so a NetLogic can hand the engine a new SVG document at runtime, and it needs `optix_script`
with a reviewed class, not a property edit.

Review with evidence. `optix_design_check` reports an `AdvancedSVGImage` with no bound element property as
`OPTIX-IMG-01` and `OPTIX-IMG-03`; `optix_emulator` `{action:"restart"}` plus `optix_screenshot` proves the
recolour actually happens, and the same screen must be captured under the web engine when the project serves
browsers, because that is where a `%PROJECTDIR%` mistake shows up as a missing image.
