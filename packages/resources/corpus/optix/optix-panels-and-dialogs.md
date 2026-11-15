---
id: optix-panels-and-dialogs
title: One loader owns the swap, one shell owns the frame
domain: optix
level: practitioner
basis: [creating-projects/graphic-objects/predefined/Panel.html, creating-projects/graphic-objects/predefined/Panel-loader.html, creating-projects/graphic-objects/predefined/Screens.html, creating-projects/graphic-objects/predefined/Containers.html, creating-projects/graphic-objects/predefined/Dialog-box.html, creating-projects/graphic-objects/predefined/Configure-button-to-open-dialog-box.html, creating-projects/graphic-objects/predefined/Configure-button-close-dialog-box.html, Reference/FTOptix-UI/ObjectTypes/PanelLoader.html, Reference/FTOptix-UI/ObjectTypes/Panel.html, Reference/FTOptix-UI/ObjectTypes/Screen.html, Reference/FTOptix-UI/ObjectTypes/Popup.html, Reference/FTOptix-UI/ObjectTypes/Dialog.html, tutorials/graphic-objects/confirmation-dialog/Create-panels.html]
tags: [panel, panel-loader, dialog, popup, navigation]
applies_to: [optix]
rules: [OPTIX-PANEL-01, OPTIX-PANEL-02, OPTIX-PANEL-03]
---
## Principle
A Panel is a container for the objects of one widget; a Screen is a Panel for the objects of one interface; a
Panel loader is the container that displays one of those panels according to the application logic. The split
matters because the loader, not the panel, decides what is on screen: the loader names the panel to display,
the loader names the node any alias inside that panel resolves to, and the runtime method `ChangePanel` swaps
the pair at once. A project that instead stacks panels in the same container and toggles their `Visible`
property has no single owner of the swap, and the aliases inside the panels keep pointing at whatever node
was recorded when they were drawn.

Default geometry reinforces the split. A new Panel has a fixed width and height and sits at the top-left of
its parent, while a new Screen stretches to cover its parent entirely. Panels are therefore building blocks
that a shell places; screens are full interfaces that a shell shows. Mixing the two — a screen pasted into a
panel container, a panel stretched as a screen — produces layouts that behave differently at each size.

Interaction that must stop the rest of the interface is a Dialog box: a modal window that does not allow
interaction with other components until it is closed. A Popup is a container with no modality of its own; it
needs explicit visibility logic and a Close method on whatever button dismisses it. Choosing between them is
an engineering decision about blocking, not about looks.

## Rules
- **OPTIX-PANEL-01** Swappable content is a Panel or Screen type stored under `UI`, displayed by exactly one
  Panel loader; every switch is the loader's `ChangePanel` method with its `NewPanel` node or a Navigation
  panel tab — never a set of sibling panels whose `Visible` properties are toggled, and never more than one
  loader claiming the same content in one window.
- **OPTIX-PANEL-02** Every panel that shows plant data resolves that data through an alias declared on the
  panel or its ancestors, with the alias `Kind` set to the expected object type; each switch passes the
  target node as the loader's panel alias node (the `AliasNode` argument of `ChangePanel`, or the loader's
  `PanelAliasNode` property), so no panel instance contains a dynamic link to a concrete project tag.
- **OPTIX-PANEL-03** Blocking interaction uses a Dialog box whose `Modal` is True, opened from a control's
  event with the UI command that opens a dialog and closed with the dialog's `Close` method, with `Visible`
  False at design time; the shell — header bar, navigation, alarm banner, loader — belongs to the
  MainWindow/Screen type that hosts the loader, and no panel draws a second copy of it.

## Apply
Inventory the shell first. `optix_read` `{action:"screens"}` lists the Screen and Panel types the project
defines, `{action:"map", path:"UI"}` shows which container holds the loader, and `{action:"node"}` on the
loader returns its `Panel`, `PanelAliasNode`, `CurrentPanel`, `EnterAnimation` and `ExitAnimation` values and
the property names to change.

Author in types, not instances. `optix_edit` `create_type` with `object_type` `Panel` (or `Screen`) and
`parent` `UI/Screens` creates the reusable widget; `create_widget` with `widget_type` `PanelLoader` places the
single loader in the shell, and `set_property` sets its `Panel` and `PanelAliasNode`. `optix_screen` mounts a
finished screen in the start window when the batch must produce a whole interface, and its `mount` and
`mount_name` arguments create the loader when the window has none.

Wire the switch. A navigation button gets the method call through `optix_edit` `wire_event` with
`event_type` `MouseClick` and the UI command `ChangePanel`, arguments `NewPanel` = the panel type and
`AliasNode` = the node the panel should read; a Navigation panel is configured instead by its `Panels`
collection, where each entry's `Panel` links to a panel type. Do not stage a `Visible` property change as a
navigation mechanism — the review rejects it as `OPTIX-PANEL-01`.

Dialogs. `create_widget` with `widget_type` `Dialog` (or `create_object` under the window), `set_property`
`Modal` True and `Visible` False, then `wire_event` on the opener's `MouseClick` with the UI command that
opens a dialog whose `Dialog` argument is the dialog object; the dismiss button carries the dialog's `Close`
method. A confirmation dialog is the documented use case, so the accept and cancel paths are separate
buttons, each with its own method call.

Verify the swap rather than the picture. `optix_emulator` `{action:"restart"}` then `optix_screenshot` shows
the panel that the loader actually selected, and `optix_production_check` reports event handlers that still
name an absolute design-time object — the failure mode where a navigation button clicks but never switches a
panel — with `OPTIX-PANEL-01` and `OPTIX-PANEL-03` in the findings. A panel whose data does not change when a
different alias node is passed is the `OPTIX-PANEL-02` defect: fix the alias `Kind` and re-run the check.
