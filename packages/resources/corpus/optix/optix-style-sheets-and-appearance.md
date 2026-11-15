---
id: optix-style-sheets-and-appearance
title: One style sheet carries the house palette
domain: optix
level: practitioner
basis: [creating-projects/graphic-objects/predefined/Style-sheets.html, creating-projects/graphic-objects/predefined/Configure-a-style-sheet.html, creating-projects/graphic-objects/predefined/Apply-a-global-style-to-the-project.html, creating-projects/graphic-objects/predefined/apply-a-style-sheet-to-a-graphic-object.html, tutorials/graphic-objects/style-pick/add-and-configure-a-combo-box.html, Reference/FTOptix-UI/ObjectTypes/StyleSheet.html, Reference/FTOptix-UI/ObjectTypes/PresentationEngine.html, best-practices/ui_objects.html]
tags: [style-sheet, palette, theme, appearance, consistency]
applies_to: [optix]
rules: [OPTIX-STYLE-01, OPTIX-STYLE-02, OPTIX-STYLE-03]
---
## Principle
A property resolves from the nearest level that sets it: the object instance first, then the object type,
then a control style named on the object's `Style` property, then the sheet's Global Style. A literal
colour entered on one label therefore survives every later change to the sheet. A screen assembled that
way looks correct on the machine it was built on and becomes a patchwork the moment the palette, the font
or the theme is revised, because each literal has to be found and edited one object at a time.

The sheet is the one place a palette is expressed: `AccentColor`, `TextColor`, `WindowColor`,
`ScreenColor`, `BorderColor`, `DataInputBackgroundColor`, `FocusColor`, the font family, the font pixel
size, `Radius` and `BorderWidth`, plus a named style per control family (`ButtonStyles`, `LabelStyles`,
`InputBoxStyles`, `SwitchStyles`, `GaugeStyles`, `ChartStyles`, `DataListStyles`, `NavigationPanelStyles`,
`ScreenStyles`). A project that defines those once can be audited: a colour on a screen is either the
sheet's value or a declared exception, and there is no third case.

Theme switching is a session fact, not a rebuild. The presentation engine names a sheet in `StyleSheet`
(the default for every session it creates), and a session can point at another sheet at runtime, so a
light and a dark sheet can both ship in one application and an operator can choose between them.

## Rules
- **OPTIX-STYLE-01** No graphic object sets a literal `TextColor`, `BackgroundColor`, `BorderColor`,
  `FontFamily` or `FontSize` on a property that the project's style sheet already defines; the property is
  left unset so it inherits, and the review counts as a defect every object whose value differs from the
  sheet's resolved value for its type.
- **OPTIX-STYLE-02** Exactly one project style sheet owns every colour, font and corner radius used in the
  UI; a colour that appears on two or more objects and is absent from that sheet's Global Style or from one
  of its control styles is a defect, and each named control style is reached only through an object's
  `Style` property, never re-entered as a literal.
- **OPTIX-STYLE-03** Every session resolves its sheet from the sheet objects under `UI`, with the
  presentation engine's `StyleSheet` set to the default one; the theme choice is a single dynamic link from
  an input control's selected value to `{Session}/StyleSheet@Pointer@Value`, never a second copy of the
  screens and never a per-object literal that would survive the swap.

## Apply
Start with the object inventory rather than the canvas: `optix_read` with `{action:"map", path:"UI"}` lists
the sheet objects and the screens, and `{action:"type_schema", type:"StyleSheet"}` returns the bound
property names before anything is set, so a rule never names a property the installed build does not have.

Create or adopt the sheet once. `optix_library` with `{action:"list", library:"StyleSheets"}` shows the
sheets this installation ships and `{action:"import", library:"StyleSheets", item:"<name>", dest:"UI/StyleSheets"}`
places the chosen one under the structural folder; the project's own sheet stays the authority and the
imported one is only a starting palette. Rename the sheet for its role (`HouseLight`, `HouseDark`) and set
the Global Style values, then add the per-family control styles that screens will name (`Accent` for a
primary button, `HeaderLabel` for a bar title) through `optix_edit` `set_property` on the sheet node, and
`optix_edit` `create_folder` when the style-sheet set needs its own folder.

Point the shell at the sheet. In the presentation engine object, `optix_edit`
`{"op":"set_property","path":"UI/<engine>","name":"StyleSheet","value":"<sheet node path>"}` sets the
default; for a switcher, build it as the product does — a Combo box whose `Model` is the `UI/StyleSheets`
folder, `DisplayValuePath` `{Item}@BrowseName`, `SelectedValuePath` `{Item}@NodeId`, and `SelectedValue`
linked to `{Session}/StyleSheet@Pointer@Value`. `optix_edit` `wire_event` attaches that write to the
control's selection-changed event, and `attach_expression` is the tool for the path, not a hand-typed
literal NodeId.

Remove overrides, do not repaint them. Walk the screens with `optix_read` `{action:"node"}` and clear the
object-level properties that duplicate the sheet; where an object must keep a distinct look, give it a named
control style and set its `Style` property instead. `optix_design_check` reports the objects whose value
contradicts the sheet's resolved value and the findings carry `OPTIX-STYLE-01` and `OPTIX-STYLE-02`, so the
review is a list, not an opinion; `optix_screenshot` after `optix_emulator` `{action:"restart"}` proves the
light and dark sheets both render, and the same screen must be captured under both.

Two limits are worth stating before the audit. `ScreenStyle` is the only control style with own properties
(`BackgroundColor`, `BorderColor`, `BorderThickness`); every other control style is a named set of the
parent sheet's values, so a background colour that varies per screen belongs on a `ScreenStyle` named by
that screen's `Style` property, not on the screen itself. And a button's `Appearance` value `Accent` takes
its fill from the sheet rather than from `BackgroundColor`, so setting `BackgroundColor` on an accent
button is dead configuration — confirm which of the two the object actually uses before reporting it as a
style defect.
