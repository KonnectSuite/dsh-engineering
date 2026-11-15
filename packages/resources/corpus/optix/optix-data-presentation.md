---
id: optix-data-presentation
title: The widget decides what the operator reads
domain: optix
level: practitioner
basis: [Reference/FTOptix-UI/ObjectTypes/Label.html, Reference/FTOptix-UI/ObjectTypes/TextBox.html, Reference/FTOptix-UI/ObjectTypes/DataGrid.html, Reference/FTOptix-UI/ObjectTypes/ListView.html, Reference/FTOptix-UI/ObjectTypes/Led.html, Reference/FTOptix-UI/ObjectTypes/CircularGauge.html, Reference/FTOptix-UI/ObjectTypes/Trend.html, creating-projects/converters/String-formatter.html, creating-projects/converters/Engineering-unit-converter.html, creating-projects/converters/Converters.html, creating-projects/graphic-objects/predefined/Data-grid.html, creating-projects/graphic-objects/predefined/Trends.html, best-practices/model_complexity_and_node_count.html]
tags: [labels, formatting, units, datagrid, trend, cost]
applies_to: [optix]
rules: [OPTIX-DATA-01, OPTIX-DATA-02, OPTIX-DATA-03]
---
## Principle
A Label is a text sink. Its `Text` is a `LocalizedText`, so a dynamic link that puts a `REAL` or `DINT`
straight into it shows whatever the number happens to be — full float precision, no engineering unit, no
thousands separator — and it changes with the tag, not with the meaning of the tag. The model usually knows
more than the screen shows: an analog variable carries its engineering range and unit, and the converter
library exists so the displayed string can carry both. A screen full of raw values is not a display; it is a
memory dump with a corporate font.

Formatting is a property of the object, not of the decimal point. A String formatter converter takes a `Format`
string in a .NET subset (`{index,alignment:format}`, nesting such as `{0:f{1}}` where the decimal count comes
from another variable), and an Engineering unit converter maps a raw range to a scaled range. Used once as a
converter type they are consistent across every object that names them; copied as per-object literals they
drift the moment one screen is edited.

The remaining decision is the widget, and it is driven by the reading rather than by looks. A Boolean is an
LED, a bounded value is a gauge with its range and warning zones, history is a trend with a model and a query,
rows are a grid, and a mixed list of heterogeneous rows is a ListView. Choosing a grid for one value, or a
Label for a state, costs update time and operator comprehension at once.

## Rules
- **OPTIX-DATA-01** Every numeric an operator reads through a Label or TextBox is produced by a String formatter
  or Engineering unit converter that states its decimals in the format string and carries the engineering unit
  the model records; a `Text` property linked directly to a numeric variable, or a formatted value whose screen
  text omits the unit the tag declares, is a defect.
- **OPTIX-DATA-02** The object is selected from the reading: `Led` with `Active` and `Color` for a Boolean,
  `CircularGauge` or `LinearGauge` with `MinValue`, `MaxValue` and `WarningZones` for a bounded value, `Trend`
  with `Model`, `Query` and `RefreshTime` for history, `DataGrid` with `Model`, `Query` and `AutoRefreshTime`
  for rows, `ListView` with `TypeSelectors` and `RowHeight` for heterogeneous rows — a DataGrid whose query
  returns a single row, or a Label standing in for a state lamp, is a defect.
- **OPTIX-DATA-03** Update cost is explicit per surface: every DataGrid, ListView and Trend has a refresh
  interval chosen from the process (`AutoRefreshTime` or `RefreshTime`; 0 on a grid disables the periodic
  refresh and requires an explicit `Refresh` call), the interval is never shorter than the polling that feeds
  it, and a grid, trend or list on a hidden panel is not left refreshing.

## Apply
Establish the reading before the widget. `optix_read` `{action:"variable_members", path:"<model path>",
name:"<variable>"}` returns the members the model exposes (range and unit included) and
`{action:"type_schema", type:"DataGrid"}` returns the exact property names for the widget about to be staged;
a rule never names a property the installed build does not expose.

Format once. Create the converter type with `optix_edit` `create_type` (`object_type` `String formatter`) under
`Converters`, or create a local converter with `create_object`, then `set_property` its `Format` — for example
`{0:f1} °C` for one decimal and the unit, or `{0,8:f2}` when the column must align. Where the variable's range
must be rescaled, stage an Engineering unit converter with `RawMin`, `RawMax`, `ScaledMin` and `ScaledMax`
instead of computing the scaling in a NetLogic. Attach the converter to the object with `attach_formatter`
(single value) or `attach_string_formatter` (a sentence that mixes text and values), and bind the resulting
`Text` with `bind` rather than a literal.

Pick and wire the object. `create_widget` with `widget_type` `Led`, `CircularGauge`, `Trend`, `DataGrid` or
`ListView`, then `set_property` the few properties that carry the design: `Active` and `Color` on the LED,
`MinValue`/`MaxValue` and `WarningZones` on the gauge, `Model` and `Query` (a node model needs
`SELECT * FROM Model` before any `WHERE`) on grid, list and trend, and `RefreshTime`/`AutoRefreshTime` on the
time-based ones. Inputs are separate objects: a writable value is a `TextBox` or gauge with `Editable` True,
whose `ValueChangeBehaviour` selects commit-on-Enter (end of typing, Escape restores) or commit-while-typing,
and whose `ContentType` hides a password — a Label is never an input.

Budget the update path. Every dynamic link materialises at least three nodes and a converter adds more, so a
grid that polls a wide query on a screen nobody looks at is the cost the review counts under
`OPTIX-DATA-03`; the presentation engine's dynamic variables polling time is the ceiling every label shares.
Use `optix_design_check` for the `OPTIX-DATA-01` and `OPTIX-DATA-02` findings, `optix_screenshot` for the
rendered result, and report the chosen refresh interval and the tag polling it depends on with the screen — an
interval without that number is a guess, not a design.
