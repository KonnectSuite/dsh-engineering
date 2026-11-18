# Designing a FactoryTalk Optix screen: the rule catalogue

This is the human-readable half of the design checks. The machine-readable half is the rule ids the
tools emit: `optix_design_check` for one screen read through the bridge, `optix_render_check` for one
screen as the runtime actually serves it, `optix_production_check` for a whole project, `optix_model`
for the information model. Every finding names a rule id, and this page says what that rule means, why
it exists, and what satisfies it.

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
| `VIEW-RENDER-` | what an operator sees in the served preview, measured from the capture | `optix_render_check`, `packages/optix/skills/render-checks.md` |

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
| `VIEW-LAYOUT-02` | warning | the screen's size is not the box its mounting panel gives it (the mounter's declared box, read through its `NodeId` pointers with its tab strip subtracted; the window canvas only as a fallback, and it says which) | draft at the box the host gives the screen |
| `VIEW-LAYOUT-03` | warning | a `RowLayout` or `ColumnLayout` whose fixed children plus their gaps already take the track, so a sibling at `-1` renders at zero | leave the leftover: give a fixed child a real number only when the fill sibling still has room |
| `VIEW-LAYOUT-04` | warning | a numeric size written on an axis whose alignment on that axis is Stretch: the runtime discards the number and fills, and the model keeps what it threw away | either name the size with alignment 0, or write `-1` and let the track decide |
| `VIEW-TYPE-02` | warning | text below the 11 px readable floor, the same floor the offline rubric applies | raise the font or let the `ScaleLayout` fit carry it |
| `OPTIX-UI-01` | info | sibling screens are built from the same hand-made child set | make a type and instantiate it |
| `OPTIX-UI-02` | warning | behaviour (NetLogic, tasks) lives inside a composition | move it to the screen or to `UI/NetLogic` |
| `OPTIX-IMG-01` | info | an `AdvancedSVGImage` has no element property bound: artwork that can never change | bind one part, or use a static `Image` |
| `OPTIX-STYLE-01` | info | a control sets a literal colour outside the palette while the style sheet styles its type | drop the literal and let the sheet rule, or add the colour to the palette |
| `OPTIX-LAYOUT-01` | warning | a child is drawn outside the rectangle it belongs to | place it inside, or make the parent bigger. Geometry is absolute on the canvas |
| `OPTIX-DATA-01` | info | a label shows a model number that has a recorded unit but no formatter | attach a string formatter with the unit, or use the analog variable's own formatting |

## What the render check means

`optix_design_check` reads the model. A screen can satisfy every rule above and still read badly, because
the model reports what was authored and a render is what the runtime instantiates, scales, clips and paints.
`optix_render_check { }` needs no bridge and no Studio: it captures the preview the emulator serves, clipped
to the window box the runtime actually paints, measures the element boxes the Web engine laid out, and judges
the **captured pixels**. Its `unchecked` list works the same way — a page it could not measure is never a pass.

| Rule | Severity | Means | What satisfies it |
| --- | --- | --- | --- |
| `VIEW-RENDER-01` | warning | rendered text is a placeholder nothing drives: `--:--`, `{TotalUnits}`, `undefined`, `TBD` | bind the control to something, or drive it from NetLogic; a clock that is not wired draws its own default |
| `VIEW-RENDER-02` | warning | a painted surface whose text covers under 30 % of its box and leaves 60 px or more empty | give the surface less room, or put the content that fills it there |
| `VIEW-RENDER-03` | warning | a painted surface or control drawn outside the box the runtime serves | the runtime clips there instead of shrinking the child, so fix the geometry |
| `VIEW-RENDER-04` | warning | text whose colour does not separate from what was painted under it, under 4.5:1 | pick a palette pair that passes against the surface the text really sits on |
| `VIEW-RENDER-05` | warning | text drawn in the very colour behind it: its captured box holds no pixel more than 20 away | the contrast rule cannot rank two colours that are the same colour, so this one names it |

`HMI-TARGET-01` and `VIEW-TYPE-02` are re-decided here on the **painted** box and the computed font rather
than the authored geometry — a `ScaleLayout` fit factor can carry a 28 px label at 28 px or shrink a 12 px one
under the floor, and only the render says which.

Two things the check is honest about. A finding names a **rendered type chain** (`window > … > rowlayout >
rectangle`), never a project path: the DOM ids the runtime writes (`ns=9;g=…`) are not the bridge's guids, so
pairing a finding to a node means reading the screen with `optix_design_check` and matching the geometry. And
it proves the project **as saved** — the runtime serves the saved file, so unsaved bridge authoring is not in
what it judges. `packages/optix/skills/render-checks.md` carries the measured paint routes (a typed rectangle
computes `rgba(0, 0, 0, 0)` with its fill on an untyped overlay child; a `NavigationPanel` paints its tabs with
a `linear-gradient`) and the limits of the pixel reader.

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
