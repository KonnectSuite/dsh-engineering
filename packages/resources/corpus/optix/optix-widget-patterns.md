---
id: optix-widget-patterns
title: Use the composite the product ships before drawing the box yourself
domain: optix
level: practitioner
basis: [FactoryTalk Optix sample projects]
tags: [widgets, gauges, grid layout, combobox, stylesheet, toast, samples]
applies_to: [optix]
rules: [OPTIX-WID-01, OPTIX-WID-02, OPTIX-WID-03]
---
## Principle

A production screen is assembled from composites, not from rectangles: the shipped template library
carries panels, gauges, alarm grids, keyboards and style sheets, and the official samples show how each
one is configured. Drawing a card out of a `Rectangle` and two `Label`s reproduces the look and none of
the behaviour, and it will not follow a style sheet.

The samples below are complete Optix projects, MIT licensed. Open the project and read the object tree
and the saved `Nodes` YAML rather than copying files into a project by hand:

- [Optix_Sample_OptixPanelLibraryWidgets](https://github.com/FactoryTalk-Optix/Optix_Sample_OptixPanelLibraryWidgets) — the panel-library widgets and how they are configured.
- [Optix_Sample_CustomGaugeWidget](https://github.com/FactoryTalk-Optix/Optix_Sample_CustomGaugeWidget) — a gauge type with configurable colours, scales and needles.
- [Optix_Sample_GridLayout](https://github.com/FactoryTalk-Optix/Optix_Sample_GridLayout) — placing widgets with a layout container.
- [Optix_Sample_ComboBox](https://github.com/FactoryTalk-Optix/Optix_Sample_ComboBox) and [Optix_Sample_ComboBoxWithEnumerator](https://github.com/FactoryTalk-Optix/Optix_Sample_ComboBoxWithEnumerator) — selection controls.
- [ChangeStyleSheetComboBox](https://github.com/FactoryTalk-Optix/ChangeStyleSheetComboBox) — switching the application style sheet from a ComboBox.
- [Optix_Sample_ScreenSaver](https://github.com/FactoryTalk-Optix/Optix_Sample_ScreenSaver) — an idle screen over the panel area.
- [Optix_Sample_ToastNotification](https://github.com/FactoryTalk-Optix/Optix_Sample_ToastNotification) — transient messages that do not steal the panel.

## Rules

- **OPTIX-WID-01** Prefer a composite from the template library, or a type built from one, over hand-drawn
  primitives. If the composite does not exist, build it once as a type and instantiate it — never draw it
  again on the next screen.
- **OPTIX-WID-02** Place widgets in a layout container or on the grid the shell defines, not at constants
  typed per object. A screen that only looks right at one window size is not finished.
- **OPTIX-WID-03** Take colour, border and type from the application style sheet; switch palettes by
  changing the style sheet, never by editing colours object by object.

## Apply

List the composites the screen needs, confirm each one exists in the project (import it from the shipped
library when it does not), instantiate it as a type under the screen, then position it inside the content
area. The resources pages `optix-ui-structure` and `optix-navigation-patterns` cover the type/instance
rule and the shell; `hmi-colour-and-contrast` carries the contrast numbers a palette must meet.

## Anti-patterns

A card made of rectangles and labels; per-object colours that disagree with the style sheet; a gauge
drawn as a picture; a screen that lays out at the default window size and nowhere else.
