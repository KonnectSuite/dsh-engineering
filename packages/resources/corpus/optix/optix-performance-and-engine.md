---
id: optix-performance-and-engine
title: Choose the engine, then measure what costs
domain: optix
level: practitioner
basis: [creating-projects/graphic-objects/predefined/Presentation-engines.html, creating-projects/graphic-objects/predefined/Native-presentation-engine.html, creating-projects/graphic-objects/predefined/Web-presentation-engine.html, creating-projects/graphic-objects/predefined/Configure-a-web-presentation-engine.html, creating-projects/graphic-objects/predefined/Configure-a-native-presentation-engine.html, Reference/FTOptix-UI/ObjectTypes/PresentationEngine.html, Reference/FTOptix-NativeUI/ObjectTypes/NativePresentationEngine.html, Reference/FTOptix-WebUI/ObjectTypes/PresentationEngine.html, best-practices/performance_optimization.html, best-practices/graphic_rendering_impact.html, best-practices/reduce_overhead.html, best-practices/statistics.html, best-practices/model_complexity_and_node_count.html, best-practices/ui_objects.html]
tags: [performance, presentation-engine, polling, trends, node-count]
applies_to: [optix]
rules: [OPTIX-PERF-01, OPTIX-PERF-02, OPTIX-PERF-03]
---
## Principle
Two presentation engines can serve one project, and they are not interchangeable at deployment time. The
native engine drives an operator panel: it has one interactive session, booted with a starting user, and the
current user can change with the interface following. The web engine serves browsers and workstation clients:
every connection creates its own interactive session and its own start window, connection counts are capped
separately for web and workstation clients, files are served only from the project directory, and the window's
`X`, `Y` and `AlwaysOnTop` properties are ignored. An interface designed on the assumption of one session and a
local file system is a web engine that half works, and no amount of rendering tuning repairs that.

Performance in Optix is mostly a property of the node graph, not of the drawing. A dynamic link materialises
at least three nodes — the property node, a link node and the target node — and a complex link (an expression
or a key-value converter) adds nodes per input, per condition and per nested link. Nodes cost page load time and
interface responsiveness, which is why a reused widget with a dozen complex links is expensive in a way a
single screen with the same links is not. The same accounting applies to NetLogic: centralising logic in a
method removes redundant links, but a class that runs at start can add measurable application start time.

Rendering cost follows the format. SVG is the recommended graphic: vector, resolution independent, and its
colour, opacity and size can change at runtime, so one file serves every state and every viewport. PNG can be
faster to process but is a fixed picture, and an oversized PNG scaled down on screen pays for pixels nobody
sees. Video follows the same rule — size it to the area it occupies instead of letting the engine shrink it.

## Rules
- **OPTIX-PERF-01** The presentation engine is chosen per deployment before any tuning: one native engine for
  the operator panel (one interactive session, a stated `StartingUser`) or one web engine for browsers and
  workstation clients, with its connection limits set and, on a non-localhost address, HTTPS with a signed
  certificate; the web engine's constraints are recorded as design facts — files served only from
  `%PROJECTDIR%`, `X`, `Y` and `AlwaysOnTop` ignored, automation IDs disabled in production.
- **OPTIX-PERF-02** Every surface that polls has an explicit interval consistent with the data behind it: the
  engine's dynamic variables polling time, a rate-of-change alarm's polling time, a `DataGrid`'s
  `AutoRefreshTime` and a `Trend`'s `RefreshTime`; no interval is shorter than the polling that feeds it, and a
  zero interval is accepted only where an explicit refresh command is the sole trigger.
- **OPTIX-PERF-03** Optimisation follows a measurement: the node count and diagnostics are read from the Tools
  statistics, the dynamic links of the screen under review are counted (three nodes for a basic link, more for
  a complex one), and any NetLogic in the hot path has its start cost stated; a change that claims a
  performance gain without naming the screen, the metric and the before-and-after numbers is not accepted.

## Apply
Decide the engine from the deployment, then read what it exposes. `optix_read` `{action:"map", path:"UI"}`
shows which presentation engine object the project carries, `{action:"node"}` returns `StartWindow`,
`LoginWindow`, `StyleSheet`, `StartingUser`, `Session` and, for the web engine, `Protocol`, `IPAddress`, `Port`,
`Hostname`, `MaxNumberOfWebConnections`, `MaxNumberOfWorkstationConnections`, `AllowedLocalSources`,
`EnableAutomationIDs` and `DynamicVariablesPollingTime`. `{action:"type_schema", type:"PresentationEngine"}`
confirms the exact names before any value is staged.

Set the polling once. `optix_edit` `set_property` on the engine's `DynamicVariablesPollingTime` is the ceiling
every dynamic link in the project shares; per-object intervals are set on the objects (`AutoRefreshTime` on a
`DataGrid`, `RefreshTime` on a `Trend`, the polling time variable on a rate-of-change alarm). The order is:
process dynamics set the sample interval, grid and trend intervals sit at or above it, and engine polling time
is the fastest change a label needs — not the fastest the controller can produce.

Measure with the tools the product ships. The Tools statistics report node counts and diagnostics at design
time and at runtime, so the first number reported for a screen is its node count, and the first number for a
start-up complaint is the project's total. Count the links, not the objects: a screen with thirty labels of
which twenty carry a complex converter is the expensive one. Where a link is genuinely hot, `reduce_overhead`
permits replacing it with a NetLogic method — and `optix_script` is how that class is added and reviewed — but
the class's start cost is quoted in the same breath as the saving it buys.

Reduce the picture instead of the data. `graphic_rendering_impact` sets the rule for artwork: SVG for anything
that must scale or animate, PNG sized to its area and compressed, video sized to the window — a change to
`Path` and to the file, made with `optix_edit` `set_property`.

Report the evidence. `optix_design_check` flags the structural causes that show up as performance findings -
a reused composition with repeated complex links, a screen whose controls carry no handler — and
`optix_screenshot` after `optix_emulator` `{action:"restart"}` is how a before-and-after is captured at the
same window size. Record the engine, the polling values, the node count and the two measurements; a page that
says "optimised" without those four facts is not a measurement.
