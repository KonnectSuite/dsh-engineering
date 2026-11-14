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
  bridge. A `Rectangle`/`Label`/`Panel` composition is the fallback, not the first answer.
- **FactoryTalk View ME** carries its own composition in the export, and `ftview_theme_audit` reports
  how much of the house palette a display already uses, paired with `ftview_draft_restyle` for the
  display that does not.

A shipped item is not a design decision by itself: it arrives with its own layout and its own
properties, so it goes through the same draft → validate → check → look loop as anything hand-built.

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
- Navigation wiring in Optix needs the `PanelLoader` path from the live model. `optix_screen` wires a
  navigation button only when that path is supplied; otherwise it creates the buttons and reports the
  exact wiring operation it left pending.
- How a `Screen` becomes reachable from the window is not documented in the installed help, so the
  scaffold composes screens under `UI/Screens` and leaves the window's own panel setup to the engineer.
- The spelling the bridge uses when it reports a colour value has never been observed live, so
  `optix_design_check` accepts several spellings and reports the ones it cannot parse as unchecked.
- There is no Optix screen viewer. Optix is looked at through `optix_preview` and `optix_screenshot`.
