---
id: optix-navigation-patterns
title: Navigation belongs to the shell, not to each screen
domain: optix
level: practitioner
basis: [FactoryTalk Optix sample projects]
tags: [navigation, panel loader, change panel, tabs, flyout, menu, samples]
applies_to: [optix]
rules: [OPTIX-NAV-01, OPTIX-NAV-02, OPTIX-NAV-03]
---
## Principle

An Optix navigation is one loader on the window that swaps the panel under it, not a button on every
screen that knows the name of the next one. That is why the product ships templates whose whole subject
is navigation: the shell owns the loader, each screen is a panel that can be shown in it, and the
buttons only say which panel to show.

Read one of the official samples before inventing a scheme. They are complete Optix projects, MIT
licensed, and the saved `Nodes` YAML shows how the loader, the buttons and the panel types are wired:

- [Optix_Template_NavigationButtons](https://github.com/FactoryTalk-Optix/Optix_Template_NavigationButtons) — buttons that switch panels.
- [Optix_Template_NavigationPanelDefaultTabs](https://github.com/FactoryTalk-Optix/Optix_Template_NavigationPanelDefaultTabs) — a navigation panel with tabs across the top.
- [Optix_Template_NavigationPanelDefaultLeftTabs](https://github.com/FactoryTalk-Optix/Optix_Template_NavigationPanelDefaultLeftTabs) — the same idea with the tabs down the left.
- [Optix_Template_NavigationPanelIconsTabs](https://github.com/FactoryTalk-Optix/Optix_Template_NavigationPanelIconsTabs) — tabs carrying an icon as well as a caption.
- [Optix_Template_NavigationPanelWithLines](https://github.com/FactoryTalk-Optix/Optix_Template_NavigationPanelWithLines) — decoration lines instead of solid tabs.
- [Optix_Template_FlyoutMenu](https://github.com/FactoryTalk-Optix/Optix_Template_FlyoutMenu) — a flyout menu over the panel area.
- [Optix_Template_DropdownWithAccordion](https://github.com/FactoryTalk-Optix/Optix_Template_DropdownWithAccordion) — a dropdown that groups pages in accordions.
- [Optix_Sample_PanelLoaderChangePanelNetLogic](https://github.com/FactoryTalk-Optix/Optix_Sample_PanelLoaderChangePanelNetLogic) — switching the loader's panel from NetLogic.
- [Optix_Sample_ChangeScreenFromTag](https://github.com/FactoryTalk-Optix/Optix_Sample_ChangeScreenFromTag) — a screen change driven by a tag value.

## Rules

- **OPTIX-NAV-01** One loader per window. The shell holds a `PanelLoader` sized to the content area, and
  every screen is a panel loaded into it. A second loader, or a button that assigns a window property,
  splits navigation into two authorities that drift apart.
- **OPTIX-NAV-02** Navigation lives in the shell, and every screen can be reached from it and leave it.
  A screen that carries its own private menu cannot be reused in another window, and a screen with no
  exit strands the operator.
- **OPTIX-NAV-03** Wire a navigation button as an event handler calling the loader's `ChangePanel` with
  `NewPanel` set to the target panel; do not build the path string at runtime when the target is known
  at design time. Then click it once in the runtime: a handler that compiles is not proof that the
  runtime found it.

## Apply

Decide the shell once: window canvas, header band, content area, loader, navigation strip. Create the
panels as types, load the first one into the loader, point every button at the loader, and check the
runtime by clicking each button. The resources page `optix-ui-structure` covers why the screens are
panels rather than copies.

## Anti-patterns

A menu bar rebuilt on every screen; navigation by hiding and showing overlapping panels; a loader whose
`Panel` property is assigned but never displayed; a button that changes a picture instead of the panel.
