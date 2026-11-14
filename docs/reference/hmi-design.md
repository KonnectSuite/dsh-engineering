# HMI design

This page owns the shared part of screen design: the screen grammar both HMI products build with, and
which tool enforces which rule in each product. The rules themselves live in the corpus
(`packages/resources/corpus/`), not here — this page is the map from a rule to the tool that reports it.

Design quality is not a product feature. A 20 px close box is too small in FactoryTalk View ME and too
small in FactoryTalk Optix; a white title on a saturated brand blue fails contrast in both. The tools
below were written once for View and ported to Optix so the same question gets the same answer.

## The loop

Both products run the same four steps, and the order is the point:

1. **Draft** — build the screen as an editable plan, not as a live write. View: `ftview_draft_display_scaffold`
   then `ftview_draft_screen`. Optix: `optix_screen` with `dry_run` left on.
2. **Validate** — prove the operations resolve against the real model before anything is written. View:
   `ftview_validate` on the draft. Optix: the dry run is a `validate_ops` call against the open project,
   so a bad parent or a property the type does not carry is reported before the batch lands.
3. **Check** — run the design rules over what the model actually says. View: `ftview_design_check`.
   Optix: `optix_design_check`.
4. **Look** — a report is not a picture. View: the viewer renders the display. Optix: `optix_preview`
   and `optix_screenshot` against the Web presentation engine, with `optix_ocr` when the text has to be
   read out of the image.

Skipping step 4 is how a screen that passes every rule still reads badly: the rules see geometry,
colour and wiring, not density.

## Screen grammar

The scaffold is the same in both products, in the same units, so a screen drafted for one is legible to
the other. From `packages/ftview/src/edit/scaffold.ts` and its Optix twin `packages/optix/lib/screens.js`:

| Slot | Geometry |
|---|---|
| Padding | 24 px on every side |
| Header band | full width, 88 px tall |
| Title | 24 px in, 16 px down, 34 px tall |
| Subtitle | 24 px in, 52 px down, 22 px tall |
| Body | starts 112 px down, ends 56 px above the bottom |
| Footer band | full width, 56 px tall |
| Content gap | 20 px between cards |
| Card row | 36 px pitch, 14 px card padding |
| Navigation strip | 56 px tall, at the bottom of the body |

A draft refuses rather than squeezes: a display under 200 px wide or 150 px tall is refused outright, a
display whose body is under 60 px tall is refused as leaving no room for content, more than 4 cards or
more than 4 navigation buttons is refused, and a card narrower than 180 px or shorter than 120 px is
refused as unreadable. Those refusals are the design opinion: the scaffold would rather say no than
produce a screen nobody can operate.

The palette is shared too, with one deliberate divergence:

| Role | View | Optix |
|---|---|---|
| Backdrop | `#0E1A24` | `#0E1A24` |
| Header band | `#0088C8` | `#005D8A` |
| Card / surface | `#13232F` | `#13232F` |
| Footer band | `#143243` | `#143243` |
| Title text | `#FFFFFF` | `#FFFFFF` |
| Row and footer text | `#CFE0EA` | `#CFE0EA` |
| Value text | `#E2E8F0` | `#E2E8F0` |
| Card border | `#2C4557` | `#2C4557` |
| Lamp on / off | `#30A46C` / `#E5484D` | `#30A46C` / `#E5484D` |

The header band is the one place a design keeps a strong colour while still carrying text, and it is
where palettes fail. Measured with the same contrast function both checks use: white on `#0088C8` is
3.92:1 and `#CFE0EA` on `#0088C8` is 2.89:1 — both under the 4.5:1 the rule requires. Darkening the
band to `#005D8A` gives 7.16:1 and 5.29:1 and keeps the blue identity, so the Optix scaffold ships the
darker band. View keeps `#0088C8` because its own check compares a control's foreground with its own
background, and a View header band carries its text colour on the band object itself, so the failure is
not visible to it; changing View's shipped palette is a separate decision with its own measurements.

## Which tool reports which rule

| Rule | Corpus page | FactoryTalk View ME | FactoryTalk Optix |
|---|---|---|---|
| `HMI-TARGET-01` a pressed control under 44 px | `hmi/hmi-targets-and-labels` | `ftview_design_check` (as `VIEW-HPM-02`) | `optix_design_check` |
| `HMI-TARGET-02` a control with no visible label | `hmi/hmi-targets-and-labels` | `ftview_design_check` (as `VIEW-HPM-01`) | `optix_design_check` |
| `HMI-CONTRAST-01` text below 4.5:1 against what it sits on | `hmi/hmi-colour-and-contrast` | `ftview_design_check` (as `VIEW-COLOR-01`) | `optix_design_check` |
| `HMI-CONTRAST-02` colours invented per object instead of from the shipped palette | `hmi/hmi-colour-and-contrast` | `ftview_theme_audit` | `optix_library` (`StyleSheets`) |
| `VIEW-HPM-01` a screen that is not an overview | `view/view-hpm-01` | review, not a check | review, not a check |
| `VIEW-HPM-02` colour used for decoration | `view/view-hpm-01` | review, not a check | review, not a check |
| `VIEW-NAV-01` nothing navigates to this screen | `view/view-navigation` | `ftview_design_check` | `optix_design_check` |
| `VIEW-NAV-02` a screen with no way out | `view/view-navigation` | `ftview_design_check` | `optix_design_check` |
| `VIEW-LAYOUT-01` two objects overlapping | `view/view-layout` | `ftview_validate` (`DRAFT_OVERLAP`) | the dry run's own warnings |
| `VIEW-LAYOUT-02` a screen sized differently from its window | `view/view-layout` | `ftview_design_check` | `optix_design_check` |
| `OPTIX-UI-01` a device copy-pasted instead of typed | `optix/optix-ui-structure` | — | `optix_design_check` |
| `OPTIX-UI-02` behaviour living inside the composition | `optix/optix-ui-structure` | — | `optix_design_check` |

`optix_design_check` also states what it could not check. A control whose colour the bridge did not
report, or a screen whose own geometry the model did not give, is listed in `unchecked` rather than
scored, so a clean summary and a blind summary are distinguishable.

## The release review: `optix_production_check`

A screen can pass every geometry rule and still ship dead. The review that runs over the whole project
is `optix_production_check`; it reads the `UI` tree once and answers with a verdict (`ready`, `review`,
`not_ready`), a count per severity and findings that name the node and the fix.

| Rule | What it catches | Why the designer does not show it |
|---|---|---|
| `OPTIX-PROD-01` | a handler whose `ObjectPointer` still holds the absolute design-time NodeId | the button and its handler both exist; the runtime instantiates UI per session and reports `No behaviour or observer found that handles the method` when it is clicked |
| `OPTIX-PROD-02` | a handler with neither a reference nor a dynamic link, or navigation to a screen that is not there | the property editor shows a path that used to exist |
| `OPTIX-PROD-03` | a screen the operator cannot reach from the panel the loader starts on | nothing marks a screen as orphaned; the shell bar counts for every panel because it sits in the start window |
| `OPTIX-PROD-04` | a presentation engine on the built-in starting user or the stock style sheet | the defaults are legitimate engineering values; they are not a production policy |
| `OPTIX-PROD-05` | a screen outside the screen folder | the tree renders it identically |

`repair: true` clears the absolute pointer value of every `OPTIX-PROD-01` finding — the measured cause of
"the click fires and nothing switches" — and needs `allowWrites`. It writes only that value; re-check
afterwards, then click the button in the runtime, because the review reports what the model says, not
what an operator saw.

The build order that avoids these failures in the first place (model, NetLogic class, screens, command
buttons, save/build/run, operator click, review) is `optix-application-recipe` in the corpus.

## Build from what the product ships

The fastest way to a screen that looks designed is to stop drawing primitives. Both products ship
composition, and the tools reach it:

- **Optix** ships seven template libraries under `<Studio>\Files\Libraries`. `optix_library` with
  `action: "list"` reads that catalog from disk with Studio closed and returns each item's browse name,
  its display name, the usage text the library itself ships, and its Chinese display name. On the
  install this repository is tested against that is 94 importable items: Widgets 42 (AlarmIcon,
  LoginForm, AlarmGrid, ConfirmationDialog, PanelLoaderWithBack, DateAndTimeWidget, …), Scripts 33,
  FeaturePreview 6, Misc 6, StyleSheets 4 (`FriendlyLight`, `FriendlyDark`, `MaterialDark`,
  `ISAStyleSheet`), GraphicElements 2 items plus 8 group folders (the industrial graphics: pumps, valves,
  tanks, motors, signs), Keyboards 1. `action: "import"` pulls one into the open project through the
  bridge, landing it under `UI/Components/<Library>` (the folder chain is created when missing), so the
  imported types stay separable from the project's own objects. `optix_screen` with `library_items` does
  the whole step for a screen in one call: import each named composite once, instantiate it under the
  screen, place it in a card slot. A `Rectangle`/`Label`/`Panel` composition is the fallback, not the
  first answer.
- **FactoryTalk View ME** carries its own composition in the export, and `ftview_theme_audit` reports
  how much of the house palette a display already uses, paired with `ftview_draft_restyle` for the
  display that does not.

A shipped item is not a design decision by itself: it arrives with its own layout and its own
properties, so it goes through the same draft → validate → check → look loop as anything hand-built.

## Where the patterns come from

Rockwell publishes its own Optix screens as complete, MIT-licensed projects in the
[FactoryTalk-Optix](https://github.com/FactoryTalk-Optix) organisation: navigation shells
(`Optix_Template_NavigationButtons`, `Optix_Template_NavigationPanel*`, `Optix_Template_FlyoutMenu`),
panel switching (`Optix_Sample_PanelLoaderChangePanelNetLogic`, `Optix_Sample_ChangeScreenFromTag`),
widgets and gauges (`Optix_Sample_OptixPanelLibraryWidgets`, `Optix_Sample_CustomGaugeWidget`,
`Optix_Sample_GridLayout`), style sheets (`ChangeStyleSheetComboBox`), alarm grids
(`Optix_Sample_AlarmsGridWithClickableFilters`) and the full demos (`FeaturesDemo2`,
`Optix_Lab_BasicTemplate`). They are the closest published statement of the product's own idioms.

Three corpus pages distil them, and `engineering_reference` serves them:
`optix-navigation-patterns` (the window's loader owns navigation, not each screen),
`optix-widget-patterns` (composite before primitives, layout containers before constants) and
`optix-design-resources` (the catalogue that maps a design task to a repository). They are references
to read, not files to vendor: the pattern is rebuilt with this project's types, tags and style sheet,
and a sample's names and colours are never authority.

## Two ways an Optix project starts, and the line the agent does not cross

There are two entry points, and the tools differ for each. Neither one involves the agent opening
Studio.

**A project that has no bridge yet** - a new one from a starter, or somebody's existing project.
`optix_template` with `destination` scaffolds the starter: copy, rename, the bridge this bundle ships,
and the canvas from `width`/`height` (`Nodes/UI/UI.yaml` `MainWindow`). Those two numbers are required
rather than defaulted, because every screen drafted afterwards reads the canvas from the live window: a
wrong answer is not one edit later, it is the size of every screen in the project. The copy lands in
`<destination>/<name>` - Studio warns (`423`) when a project's name and the folder holding it disagree,
and a workspace root is not a project folder. For an existing project,
`optix_bridge_arm` with `confirm: false` first reports what is there, and `confirm: true` writes the
bridge and adds the `StudioMCPBridge` NetLogic node to `Nodes/NetLogic/NetLogic.yaml` when the project
has none - a hand-built project usually has none, and `StartBridge` is unreachable without it. Every
file it replaces is kept under `ProjectFiles/.dsh-backups`.

**A project that already has the bridge.** Nothing to write: the engineer opens it and runs
`StartBridge`, and the agent works through the bridge.

The line: opening the project, building it, and right-clicking `StartBridge` are the engineer's three
actions. The agent writes the files, then hands over in one short message - which `.optix` file, that
the build must succeed, that the node wants `StartBridge` - and waits for the engineer's word before
it calls `optix_status`. It does not launch Studio, click in it, or poll it. Once the bridge answers,
the agent takes over: read, draft, edit, check, `optix_production_check`, and start or stop the runtime
with `optix_emulator` - never Studio's own toolbar.

One measured constraint belongs in every handover: the runtime loads the **saved** project, so a change
made through the bridge reaches the emulator only after the engineer saves in Studio. Ask for that save
when a visual check is the point.
## What a clean report does not prove

Every rule above is a static reading of the model. None of them renders the screen, runs it, or touches
a tag. A screen with zero findings can still be too dense, can still name its buttons badly, and can
still be unreachable because the window's panel loader was never wired — `optix_design_check` reports an
unwired control, but it cannot see a navigation path that lives in NetLogic. The last step is always
the picture.

## Known gaps

- Whether an Optix library item nested inside a group folder can be imported by a nested path is
  unverified; only top-level items are documented, and `optix_library` reports group folders as groups
  rather than as importable names.
- A navigation button inside a *panel* cannot reach the loader. A panel's instance sits one level deeper
  in a session (`UIRoot/<loader>/<panel>/<button>`) than it does in the design tree, so a loader path
  written inside a screen resolves to the design-time loader and the runtime logs `No behaviour or
  observer found that handles the method 'ChangePanel'`. `optix_screen` therefore draws the bar in the
  window beside the `PanelLoader`, names each button for the panel it opens (`Nav_<target>`), wires it
  `object_raw`-relative, and clears the absolute `ObjectPointer` value the bridge also writes — the
  runtime resolves that absolute id first. Verified live by clicking both buttons; a caller that wires
  its own panel-internal buttons will reproduce the failure.
- A composite placed from the library carries no geometry for its own children, so `optix_design_check`
  reports those children as unchecked. That is the honest answer: their layout is computed inside the
  type, not by the screen.
- `optix_preview` and `optix_screenshot` need the host's attachment and browser services, which a
  headless harness does not provide; the verification runs in this repository looked at the runtime's
  Web presentation engine through a browser instead of through those two tools.
