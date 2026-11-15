# Designing a FactoryTalk Optix screen: the rule catalogue

This is the human-readable half of the design checks. The machine-readable half is the rule ids the
tools emit: `optix_design_check` for one screen, `optix_production_check` for a whole project,
`optix_model` for the information model. Every finding names a rule id, and this page says what that
rule means, why it exists, and what satisfies it.

The rules layer in a fixed order. A finding from a lower layer is never a reason to break a higher
one: the operator's explicit instruction wins, then the project's own theme and existing screens, then
the vendor guidance for the platform, then the product-neutral baseline. `hmi-standards-precedence`
holds that order; `engineering_reference` serves it.

## Where each family comes from

| Prefix | Family | Where it lives |
| --- | --- | --- |
| `CRAFT-` | how a build is ordered and what is read first | `engineering_reference`, the skill gate |
| `HMI-` | product-neutral HMI design: contrast, touch targets, ISA-101 levels | `corpus/hmi/*` |
| `VIEW-` | geometry and navigation rules shared with FactoryTalk View ME | `corpus/hmi/*`, enforced by both products |
| `OPTIX-MDL-` | the OPC UA information model under `Model` | `optix-opcua-model-structure` |
| `OPTIX-UI-`, `OPTIX-WID-` | composition, widgets and reuse | `optix-ui-structure`, `optix-widget-patterns` |
| `OPTIX-NAV-`, `OPTIX-PANEL-` | navigation, panels and dialogs | `optix-navigation-patterns`, `optix-panels-and-dialogs` |
| `OPTIX-STYLE-`, `OPTIX-LAYOUT-` | style sheets, appearance, layout containers | `optix-style-sheets-and-appearance`, `optix-layout-and-containers` |
| `OPTIX-DATA-`, `OPTIX-IMG-` | data presentation, images and SVG | `optix-data-presentation`, `optix-images-and-svg` |
| `OPTIX-ALARM-`, `OPTIX-RCP-` | alarms, recipes and retentivity | `optix-alarm-object-model`, `optix-recipes-and-retentivity` |
| `OPTIX-SEC-`, `OPTIX-I18N-` | users, roles, sessions, translations | `optix-users-and-security`, `optix-translations` |
| `OPTIX-PERF-` | presentation engines and node count | `optix-performance-and-engine` |
| `OPTIX-NL-` | NetLogic C# lifecycle and threading | `optix-netlogic-practices` |
| `OPTIX-VAR-` | variables on a component, units and ranges | `optix-variables-and-properties` |
| `OPTIX-PROD-` | release blockers a per-screen check cannot see | the skill's review section |

## What the screen checks mean

`optix_design_check { project, screen }` reports these against one screen, with `evidence` naming the
node and the measured value. Its `unchecked` list is part of the answer: a fact the bridge did not
report is not a pass.

| Rule | Severity | Means | What satisfies it |
| --- | --- | --- | --- |
| `HMI-TARGET-01` | warning | a control an operator presses is smaller than the 44 px touch minimum | give it room in the slot math, not a bigger hit area |
| `HMI-TARGET-02` | info | a control sits closer than the minimum to its neighbour | same |
| `HMI-CONTRAST-01` | warning | the text colour measures below 4.5:1 against the object it actually sits on | pick a palette pair that passes; the check uses the fill behind the text, not the screen backdrop |
| `VIEW-NAV-01` | info | a screen holds no control an operator can press, so it has no way out | add the arrow of the navigation bar, or accept it for a leaf screen and record why |
| `VIEW-NAV-02` | warning | the screen cannot be left by any wired control | wire a `ChangePanel` |
| `VIEW-LAYOUT-02` | warning | the screen's size is not the window's canvas | draft at the window's own size |
| `OPTIX-UI-01` | info | sibling screens are built from the same hand-made child set | make a type and instantiate it |
| `OPTIX-UI-02` | warning | behaviour (NetLogic, tasks) lives inside a composition | move it to the screen or to `UI/NetLogic` |
| `OPTIX-IMG-01` | info | an `AdvancedSVGImage` has no element property bound: artwork that can never change | bind one part, or use a static `Image` |
| `OPTIX-STYLE-01` | info | a control sets a literal colour outside the palette while the style sheet styles its type | drop the literal and let the sheet rule, or add the colour to the palette |
| `OPTIX-LAYOUT-01` | warning | a child is drawn outside the rectangle it belongs to | place it inside, or make the parent bigger. Geometry is absolute on the canvas |
| `OPTIX-DATA-01` | info | a label shows a model number that has a recorded unit but no formatter | attach a string formatter with the unit, or use the analog variable's own formatting |

## What the model check means

`optix_model { action: "check" }` judges the tree behind the screens, `OPTIX-MDL-01`..`06`: a signal
shallower than `Model/<plant>/<area>/<line>/<equipment>/<signal>`, an analog value with no
`EngineeringUnits`, a signal with no `Description`, a name that breaks the convention, a folder holding
more than twelve variables, and equipment folders with no `ObjectType` behind them. The verdict is
`structured` or `needs-work`. `docs/reference/optix-model.md` carries the convention and the two
measured limits (metadata is written as child variables, type members are copied onto instances).

## What the release review adds

`optix_production_check` reads the whole `UI` tree and answers `ready`, `review` or `not_ready` from
five rules a per-screen pass cannot see: `OPTIX-PROD-01` an event handler whose `ObjectPointer` still
holds the absolute design-time NodeId (the click lands and nothing switches), `-02` navigation to a
screen that is not there, `-03` a screen the operator cannot reach from the panel the loader starts on,
`-04` a presentation engine left on the built-in starting user or the stock style sheet, `-05` screens
outside the screen folder. `repair: true` clears the absolute pointer of every `OPTIX-PROD-01` handler.

## Cutting a rule on purpose

A house standard that contradicts a baseline rule is a decision, not a bug. Record the waiver where
the next engineer will find it — the screen's description, or the project's own standard document —
and cite the rule id. Silence is the only unacceptable answer: a finding left unreported reads as
"nobody looked".
