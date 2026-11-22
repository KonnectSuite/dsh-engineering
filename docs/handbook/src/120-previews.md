---
title: Drawing and display previews
order: 120
purpose: What the viewer surfaces show, what they do not prove, and what changed when the ECAD product row retired.
audience: Anyone using the workbench previews
---

## Three preview faces

The workbench has three engineering preview faces, each rendering a local file:

- **Ladder viewer** - a routine rendered from L5X neutral text, with contacts, coils and branches laid out for reading.
- **FactoryTalk View display** - a display rendered from the ME export XML, including the object bounds the exporter wrote.
- **Drawing pane** - a read-only electrical drawing preview for DXF/DWG files: drag to pan, wheel to zoom, layout tabs, a layer panel, text search, a coverage badge, print, and SVG or PNG export.

A fourth, the **settings** face, reports the bundle's configuration. Optix screens are previewed through the Optix row's emulator and screenshot tools rather than a separate workbench face.

## The ECAD change

The ECAD product row is retired in this change. Its drawing pane remains as a preview because reading a drawing is still useful; what leaves is the product surface - the deliverable tools and their editing-adjacent workflow. Electrical authoring stays with AryaCAD Electrical, which the owner runs separately; the bundle does not create or edit drawings.

If a session needs drawing tools and the ECAD row is off or absent after this change, that is expected: the viewer is not the row.

## What a preview proves

A preview proves that a local file parsed and rendered. It does not prove:

- that the file came from the machine that is running now - an export has an age;
- that the drawing is correct, current or approved;
- that a display will deploy to a terminal;
- that a rendering matches the vendor runtime's rendering.

For display behavior, the vendor runtime is the evidence. For a drawing, the issued file is. An image is a reading aid; `docs/capabilities.md` records which images were captured and what they cannot show.

## Practical notes

Previews are read-only by construction: they open a file and produce an image, and never write back into it. Renders that need a browser report clearly when Chrome or Edge is missing instead of producing a blank image. Both workbench faces follow the host's theme tokens, so light and dark themes show the same content.
