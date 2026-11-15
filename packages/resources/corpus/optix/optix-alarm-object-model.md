---
id: optix-alarm-object-model
title: An alarm is a model object, not a red lamp
domain: optix
level: practitioner
basis: [creating-projects/alarms/Alarms.html, creating-projects/alarms/Alarm-types.html, creating-projects/alarms/Create-an-alarm.html, creating-projects/alarms/Create-an-alarm-type.html, creating-projects/alarms/Custom-alarm-types.html, creating-projects/alarms/Alarm-variables.html, creating-projects/alarms/Alarm-grid.html, creating-projects/alarms/Alarm-log-grids.html, creating-projects/alarms/Confirm-and-acknowledge-alarms.html, creating-projects/alarms/shelve_alarms.html, Reference/FTOptix-Alarm/ObjectTypes/AlarmController.html]
tags: [alarms, severity, acknowledgement, model, history]
applies_to: [optix]
rules: [OPTIX-ALARM-01, OPTIX-ALARM-02, OPTIX-ALARM-03]
---
## Principle
An alarm in Optix is a node in the information model: a controller object of a type that matches the condition
it watches, with its input, its limits, its message, its severity and its lifecycle state. It is not a bit that
a screen paints red. That distinction is what makes severity, acknowledgement and history possible — the alarm
carries them, the screen only reads them. This page is the mechanics behind the design rules in
`optix-alarms-and-trends.md` (OPTIX-ALM-01 and OPTIX-ALM-02): limits and priorities are reviewed once in the
model, and the screen inherits a definition instead of restating one.

The type carries the semantics. A digital alarm watches a Boolean against a normal state; exclusive and
non-exclusive level alarms watch analog limits, with the non-exclusive variant signalling each limit while the
exclusive variant signals only the last one crossed; deviation alarms watch an offset from a setpoint; rate of
change alarms watch speed of movement; non-exclusive limit alarms expose the low-low, low, high and high-high
limits together. Choosing the right one decides what the grid shows: one analog column for exclusive, four for
non-exclusive.

Acknowledgement and confirmation are two different operator acts. Acknowledging records that the operator saw
the alarm; confirming records that the cause is resolved. The status model follows the OPC UA alarm states -
active or inactive, acknowledged or not, confirmed or not — and the grid exposes each on its own column, so a
screen that only clears the alarm on acknowledge leaves the history wrong.

## Rules
- **OPTIX-ALARM-01** Every alarm is an instance of the controller type that matches its condition (digital,
  exclusive or non-exclusive level, deviation, rate of change, or the limit variants), created under `Alarms`
  with its `InputValue` linked to the watched variable, a `Message`, a `Severity` in 1-1000, `Enabled` True and
  every limit the type exposes set; an alarm without a message, or a boolean watched through a level type
  chosen by habit, is a defect.
- **OPTIX-ALARM-02** Alarms that share a pattern are instances of one alarm type: the type is made by moving
  the configured alarm into the Type view under `Alarms`, the per-instance values are its input and limits, and
  the custom properties declared on the type are the ones the grid filters and displays — a screen's worth of
  hand-copied alarms whose messages and limits have drifted is a defect.
- **OPTIX-ALARM-03** Acknowledgement is designed per alarm: `AutoAcknowledge` and `AutoConfirm` are enabled only
  where no operator judgement exists, everything else is acknowledged and confirmed from an Alarm grid whose
  columns include `Acked` and `Confirmed`, history comes from an alarm log grid fed by an event logger, and
  shelving uses timed shelving with `MaxTimeShelved` and `PresetTimeShelved` rather than disabling the alarm.

## Apply
Read the alarm before writing any screen. `optix_read` `{action:"map", path:"Alarms"}` lists the controller
objects and their types, `{action:"node"}` on one returns `InputValue`, `Message`, `Severity`, `Enabled`,
`AutoAcknowledge`, `AutoConfirm`, `MaxTimeShelved`, `PresetTimeShelved` and the latching properties, and
`{action:"type_schema", type:"AlarmController"}` confirms the names and the method signatures this build
exposes (`Acknowledge`, `Confirm`, `OneShotShelve`, `TimedShelve`, `Unshelve`, `Suppress`, `Enable`, `Disable`,
`Reset`).

Author from the type down. Create the type with `optix_edit` `create_type` (`object_type` one of the alarm
controller types, parent `Alarms`), set the shared `Message`, `Severity` and limit defaults on it, then
`create_object` under it for each watched point and bind `InputValue`. Add custom properties with
`create_variable` when the grid must show or filter by a plant attribute (line, area, motor), because those
variables become grid columns; do not encode that information in the message text.

Reuse rather than copy for messages. `Message` is a `LocalizedText`, so the text goes through the translation
dictionary and per-limit messages are set where the type defines them; `optix_edit` `set_property` with the
`Key` value rather than a literal keeps the alarm translatable, which is what `Translate-an-alarm-message`
describes. A dynamic message that inserts the triggering value is a String formatter on the message, not a
second alarm object.

Put the operator actions on the screen. `optix_screen` or `create_widget` places an Alarm grid (`Optix.Alarms`
library widgets are available through `optix_library`), the columns are the grid's own, and the buttons call
`Acknowledge` / `Acknowledge all` / `Confirm` / `Confirm all` with the grid's selection as the scope — selecting
a row scopes the action to it, an empty selection scopes it to all. The confirmation buttons are separate
objects from the acknowledgement buttons; a single "OK" that does both is a design finding, not a shortcut.

Close with history and evidence. `optix_design_check` reports alarms with no message, with an unreachable
acknowledgement path, or bound to a severity outside 1-1000; the log side is an alarm log grid backed by an
event logger, and its rows are status changes rather than active alarms. `optix_screenshot` after a forced
condition proves the banner and grid agree, and the severity values in the screenshot are the same numbers the
model records.
