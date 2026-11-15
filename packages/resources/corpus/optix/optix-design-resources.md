---
id: optix-design-resources
title: The official sample projects as a design reference
domain: optix
level: practitioner
basis: [FactoryTalk-Optix GitHub organisation, MIT licensed sample projects]
tags: [samples, templates, resources, github, reference, patterns]
applies_to: [optix]
rules: [OPTIX-RES-01, OPTIX-RES-02]
---
## Principle

Rockwell publishes its own Optix screens as complete projects in the
[FactoryTalk-Optix](https://github.com/FactoryTalk-Optix) organisation: templates for navigation, samples
for gauges, grids, alarms and style sheets, and the demos shown at Automation Fair. They are MIT licensed
and they are the closest thing to a statement of the product's own idioms — the object tree and the saved
`Nodes` YAML show the shape a working screen has.

Treat them as references to read, not files to copy into a project: this bundle links them, it does not
vendor them, and a pattern belongs in your project only once you understand why the sample did it that
way.

## What to open, by design task

| Design task | Start with |
| --- | --- |
| A shell with navigation | `Optix_Template_NavigationButtons`, `Optix_Template_NavigationPanel*`, `Optix_Template_FlyoutMenu`, `Optix_Template_DropdownWithAccordion` |
| Panel switching | `Optix_Sample_PanelLoaderChangePanelNetLogic`, `Optix_Sample_ChangeScreenFromTag` |
| Widgets and gauges | `Optix_Sample_OptixPanelLibraryWidgets`, `Optix_Sample_CustomGaugeWidget`, `Optix_Sample_GridLayout` |
| Selection controls | `Optix_Sample_ComboBox`, `Optix_Sample_ComboBoxWithEnumerator` |
| Style sheets | `ChangeStyleSheetComboBox`, `Optix_Sample_AdvancedSvgColorToSwitchableStylesheet`, `SVG_Colorization` |
| Alarms on screen | `Optix_Sample_AlarmsGridWithClickableFilters`, `Optix_Sample_AcknowledgeAndConfirmMultipleAlarms`, `Training_AlarmsBasic` |
| Trends and history | `Optix_Sample_DynamicTrendRuntime`, `Optix_Sample_DynamicTrendPensFromStore`, `Training_Loggers` |
| Users, roles, sessions | `Optix_Sample_UsersGroupsRoles`, `Optix_Sample_UsersLevelsManagement`, `Optix_Sample_WebPresentationEngineSessions` |
| Messages and overlays | `Optix_Sample_ToastNotification`, `Optix_Sample_ScreenSaver` |
| A complete application to compare against | `FeaturesDemo2`, `Optix_Lab_BasicTemplate`, `Optix_Demo_RecipeX` |
| NetLogic snippets | `NetLogic_CheatSheet`, `ToolboX`, `Training_NetLogicRuntime` |
| Style sheet, palette and theme switching | `optix-style-sheets-and-appearance` (OPTIX-STYLE-01..03) |
| Layout, containers and Z order | `optix-layout-and-containers` (OPTIX-LAYOUT-01..04) |
| Panels, loaders and dialogs | `optix-panels-and-dialogs` (OPTIX-PANEL-01..03) |
| Value presentation, units and refresh cost | `optix-data-presentation` (OPTIX-DATA-01..03) |
| Images, SVGs and driven element properties | `optix-images-and-svg` (OPTIX-IMG-01..04) |
| Alarm objects, severity and acknowledgement | `optix-alarm-object-model` (OPTIX-ALARM-01..03) |
| Users, roles, sessions and audit | `optix-users-and-security` (OPTIX-SEC-01..03) |
| Translation keys and locale switching | `optix-translations` (OPTIX-I18N-01..02) |
| Recipes, schemas and retentivity | `optix-recipes-and-retentivity` (OPTIX-RCP-07, OPTIX-RCP-08) |
| Presentation engine and performance | `optix-performance-and-engine` (OPTIX-PERF-01..03) |

Prefix each name with `https://github.com/FactoryTalk-Optix/` to reach the repository.

## Rules

- **OPTIX-RES-01** Before hand-building a pattern the product already demonstrates, open the matching
  sample and read its object tree. Cite the repository name when you report what you followed, so a
  reviewer can check the same tree.
- **OPTIX-RES-02** Rebuild the pattern with this project's own types, tags and style sheet. A copied
  sample brings the sample's names and its placeholder data with it; only the structure is worth taking.

## Apply

Read the sample, name the mechanism it uses (a loader's `ChangePanel`, a layout container, a style-sheet
reference, a type with instances), then express that mechanism through the project's own objects. If the
project lacks the composite the sample relies on, import the shipped library item first — the library is
in the product, not in the sample.

## Limits

A sample demonstrates one idea on one Studio version; it is not a standard, and its colours, tags and
naming are not authority. Where this bundle and a sample disagree on a number, the number that matters is
the one measurable in your own project — for contrast, the pair of colours the object actually sits on.

When the session has web access, read the repository's saved `Nodes` YAML as well as its screens: the
saved model is the exact object shape, and that is what a bridge or a scaffold has to reproduce — a
wiring that compiles in the designer can still be the wrong shape for the runtime.
