# Production

An Optix HMI is not finished when it renders: it is finished when its buttons reach something, it has
been graded against the house design rules, its sources compile, the save that carries the change is
proven on disk, and every claim you make about it has a call behind it. `optix_production_check` is the
release gate for the project, `optix_ui { action: "review" }` is the design rubric for a screen,
`optix_library` and the shipped adapters place vendor components instead of hand-drawn lookalikes, and
the verification recipe at the end of this page is the order that makes the four claims testable. The
gate reports what it can see and names what it cannot — a green verdict is a statement about the model,
not proof that a machine runs.

## The release gate: `optix_production_check`

| Rule | Severity | What it reports | Why it matters |
| --- | --- | --- | --- |
| `OPTIX-PROD-01` | critical | an event handler that still names an absolute design-time object | the runtime instantiates UI per session, so an absolute path does not resolve and the button is dead even though it exists |
| `OPTIX-PROD-02` | critical | a handler that points at a screen which is not there | the click answers nothing, or opens a blank panel |
| `OPTIX-PROD-03` | critical | a screen the operator cannot reach from the panel the loader starts on, or from the items of a `NavigationPanel` rail | a screen nothing opens is a screen no one sees |
| `OPTIX-PROD-04` | warning | a presentation engine left on engineering defaults — an anonymous starting user, or the stock style sheet | the project ships with its design and its session policy, not the vendor's defaults |
| `OPTIX-PROD-05` | warning | screens that live outside the screen folder | the next person cannot find them, and the folder no longer means "the screens" |

The verdict is `ready`, `review` or `not_ready`, and every finding names the node and the fix rather than
just the rule. The parameters describe where to look:

| Parameter | Default | What it decides |
| --- | --- | --- |
| `window` | `UI/MainWindow` | the window that carries the `PanelLoader` the reachability check starts from |
| `screens_folder` | `UI/Screens` | the folder that defines "inside the screen folder" |
| `depth` | `8` | how deep the UI tree is read in one bridge call |
| `max_handlers` | `120` | how many event handlers are inspected in full; past that, the answer says it was capped |

`repair: true` clears the absolute pointer value of every handler `OPTIX-PROD-01` reports — and only that
value. It needs `allowWrites`, and it is the measured cause of the "button clicks but nothing changes"
failure, because an absolute `ObjectPointer` left on a handler is exactly what the runtime cannot resolve.
It is not a general fixer: `-02`, `-03`, `-04` and `-05` are decisions, not residue.

```json
{
  "project": "LineHMI",
  "window": "UI/MainWindow",
  "screens_folder": "UI/Screens",
  "repair": true
}
```

Run it after the save, not before: the gate reads the saved project through the bridge, and a save that
has not landed leaves the findings of the previous build in place.

## The design rubric: `optix_ui { action: "review" }`

The gate asks whether the HMI works. The rubric asks whether it looks and measures like a machine HMI,
and grades one screen at a time against rules whose ids are citable from
[engineering_reference](../../reference/hmi-design.md) and the engineering corpus.

| Rule | Grade | What it requires |
| --- | --- | --- |
| `VIEW-SHELL-01` | critical | a band across the top at least 48 px tall and 80 % of the canvas wide; the window's `ShellHeader` counts and the content host does not |
| `VIEW-NAV-01` | critical | a native `NavigationPanel` with at least two items, in the screen or in the window it sits in |
| `HMI-TARGET-01` | critical | every control at least 44 × 44 px |
| `VIEW-TYPE-02` | critical | no text below 11 px |
| `HMI-CONTRAST-01` | critical | both presentation engines carry a style sheet, and the same one |
| `VIEW-CONSIST-01` | critical | the shell header height and the content-host rectangle agree across screens |
| `VIEW-HDR-01` | warning | a header title at 20 px or more, a status chip, and the user or the clock |
| `VIEW-ADAPTER-01` | warning | a vendor component or a process drawing carries the content, not a hand-drawn lookalike |
| `VIEW-EMPTY-01` | warning | the screen has enough on it to be a screen |

The score starts at 100, a critical costs 40 and a warning 10, floored at 0. `professional` is 85 or more
with no critical, `acceptable` is 70–84, `entry-level` is below 70 or anything with a critical left. The
`must_fix` list carries every critical with its node path and a one-line repair, so the next edit is
prescribed rather than guessed.

Three rules the rubric **refuses to call proven**, and says so in `unverified`:

| Rule | What it needs instead |
| --- | --- |
| `VIEW-DLG-01` | a destructive command must open a confirm dialog — click it after Save and Build |
| `VIEW-STATE-01` | the active tab must follow the open screen — change screens and look |
| `VIEW-DATA-01` | a data component must show live values — let the logger sample, then look |

That refusal is the point of the rubric: a static read cannot prove an interaction, so it does not claim
to.

Measured on `AryaOptixTemplate` with bridge 1.0.9 at 1280 × 800, after the shell, the modern style sheet
and a kit screen: **score 90, grade professional, must fix 0**, one warning (`VIEW-ADAPTER-01`,
"UiProbe - nothing on the screen is a vendor component or a process drawing") and `VIEW-DLG-01` listed as
unverified. The same screen before the shell and the theme graded **30, entry-level**, with `VIEW-NAV-01`
and `HMI-CONTRAST-01` critical — the two findings the theme and shell apply exist to remove.

The rubric reads each node once through `nodes`, merging `LeftMargin`, `TopMargin`, `Width`, `Height` and
`FontSize`; the walk is bounded to 400 nodes per descriptor and batched eight at a time. The window is a
second descriptor, and the consistency rule is skipped when the reviewed path *is* the window, because
there is nothing to compare it with.

## The kit and the template library

`optix_ui { action: "components" }` answers with what the design paths can draw:

| Part | Count | What it is |
| --- | --- | --- |
| Drawn kit | 9 | the components the blueprint places — header, cards, rows, KPI tiles, lamps, charts, message cards, status strip, rail |
| Adapters | 12 | vendor widgets the kit can place instead of a hand-drawn version |
| Rubric | 9 rules + 3 unproven | the same list the review grades against |

Adapters are the answer to `VIEW-ADAPTER-01`. Each one names the template-library item it places, what
that item needs, and what it is for:

| Adapter | Item | Needs |
| --- | --- | --- |
| `alarmBanner` | `Widgets/AlarmBanner` | a `Model` |
| `alarmGrid` | `Widgets/AlarmGrid` | a `Model` |
| `alarmHistoryGrid` | `Widgets/AlarmHistoryGrid` | a `Model` |
| `trend` | `Widgets/AdvancedTrend` | a `Model` |
| `recipeEditor` | `Widgets/RecipesEditor` | nothing |
| `loginForm` | `Widgets/LoginForm` | the `Users` alias |
| `userEditor` | `Widgets/UserEditor` | the `Users` alias |
| `gauge` | `Widgets/AnalogItemGauge` | a `Model` |
| `stationStatus` | `Widgets/StationConnectionStatus` | nothing |
| `dataGrid` | builtin `DataGrid` | a `Model` and a `Query` |
| `histogram` | builtin `HistogramChart` | a `Model` and a `Query` |
| `trendNative` | builtin `Trend` | a `Model` and a `Query` |

An adapter **never imports**. A library-backed adapter with no `type_path` refuses with
`adapter_not_imported` and names the item, because importing is a decision with a destination; `optix_library`
makes it. An adapter also **does not guess a binding**: what it could not connect is reported in `unbound`,
so an unbound grid is visible in the answer rather than a blank box discovered by an operator. A placed
adapter is at least 44 × 44 px (`adapter_bad_slot`) and its node name is a Logix identifier
(`adapter_bad_name`).

`optix_library` is the importer, in two actions:

| Action | Needs | What it does |
| --- | --- | --- |
| `list` | nothing — reads the installed catalog from disk | names the items in each library (Widgets, GraphicElements, StyleSheets, Keyboards, Misc, Scripts) with the usage text each item ships; `query` filters, `detail` adds the text |
| `import` | `allowWrites`, the project open with the bridge started, and a 1.0.9 bridge advertising `template_library` in `optix_status` | pulls the item and the types it depends on into the project, landing at the root of `UI` under `UI/Components/<library>` by default; `replace` resolves type conflicts by name, `preserve` keeps dependency objects in their original library folders |

An import is **not batch-reversible**, so read the model back with `optix_read` before any retry. And a
library is not a shopping list: pick the named component for a design already decided, rather than
surveying what the machine happens to ship — a new build starts from the brief and the published
standards, and the machine's inventory is not a brief.

Measured on `AryaOptixTemplate` with bridge 1.0.9: `action components` returned the 9 drawn components and
the 12 adapters; `action assets` planned 3 files and wrote 0; applying with
`only: ["home", "alarms", "conveyor"]` wrote 3 files into `ProjectFiles/imgs`.

## The verification recipe, end to end

The order is fixed because each step's evidence depends on the previous one being true.

1. **Decide the design first.** Read the house standards through `engineering_reference` and the open
   project's own conventions through `engineering_profile`. A screen authored before the language is
   chosen gets repainted later, and repainting is not free.
2. **Apply the style sheet.** `optix_ui { action: "theme", language: "modern", mode: "apply" }` writes the
   `StyleSheet` and binds both presentation engines; `engine_refs_verified` is the only claim that it
   landed.
3. **Draw the window chrome.** `optix_ui { action: "shell" }` puts the header band, the native navigation
   rail, the content host and the footer around the start window. Without it, `VIEW-SHELL-01` and
   `VIEW-NAV-01` are critical on every screen.
4. **Compile the screens.** `optix_ui { action: "screen" }` turns each blueprint into operations on the
   12-column grid, refusing a pattern that has no content and a screen that cannot fit.
5. **Place vendor components.** `optix_library` imports the item, then the adapter places it; the assets
   action writes the icons and process drawings the screens reference.
6. **Grade the screen.** `optix_ui { action: "review" }`: repair `must_fix` until there is none, then
   decide about each warning. `VIEW-ADAPTER-01` is the one to take seriously on a screen that claims to
   show a process.
7. **Check the measurements.** `optix_design_check` re-decides the size and contrast rules against the
   painted box and computed font, and `optix_render_check` judges the rendered pixels. These find what a
   model read cannot.
8. **Save, then build.** `optix_save` proves the write from file timestamps; `optix_build` with the
   emulator stopped compiles the NetSolution and reports whether `bin/<Project>.dll` now carries it.
9. **Prove the navigation.** `optix_nav { action: "verify" }` clicks each bar button in the served preview
   and reads the loader's `Panel` back, so "the button works" is a read, not a hope.
10. **Run the release gate.** `optix_production_check` answers `ready`/`review`/`not_ready`; `repair: true`
    clears the `-01` handlers, and everything else is a change.
11. **Prove the interactions the static rules refuse.** Open the destructive command and confirm the
    dialog appears; change screens and confirm the active tab follows; let the logger sample and confirm
    the grid fills.
12. **Record the evidence.** Each claim with the call that produced it — and the runtime facts a
    screenshot cannot settle stated as unproven.

## What "done" means

Five conditions, and each one has a call that proves it rather than a feeling that it is close:

| Condition | The proof |
| --- | --- |
| Every button reaches what it names | `optix_nav { action: "verify" }` reports each click as verified, not `repaint_only` |
| The production gate has nothing critical left | `optix_production_check` verdict `ready`, or a `review` whose remaining findings you have read and accepted |
| The sources compile and the artefact is current | `optix_build { action: "check" }` exit 0, and `optix_build { action: "status" }` not `stale` |
| The save landed | `optix_save` `ok: true` with a file that moved, or `optix_emulator { action: "status" }` saying `saved_after_edit: false` |
| The design review is professional | `optix_ui { action: "review" }` grade `professional` with an empty `must_fix` |

Anything short of those is a draft, and the answer says which condition failed and why.

## Limits

- **The gate reads the model; it cannot watch a machine.** A `ready` verdict means no handler is dead, no
  screen is stranded and no engine is on defaults. It does not mean the PLC answers.
- **`repair` fixes one class of finding.** It clears `OPTIX-PROD-01`'s absolute pointer value and nothing
  else; `-02` to `-05` are edits to make deliberately.
- **The rubric refuses three interaction rules on purpose** and lists them as unverified, so a
  `professional` grade is a statement about geometry, colour, structure and header — not about a dialog
  opening.
- **The walk is bounded.** 400 nodes per descriptor and 120 handlers per gate run are caps, and the answer
  says when it was truncated rather than implying full coverage.
- **`OPTIX-PROD-05` depends on a folder convention.** Screens outside `screens_folder` are reported even
  when the project loads them, because the finding is about discoverability.
- **An import is not reversible in a batch.** Read the model back before retrying an `optix_library`
  import; a failed placement is a repair, not a rollback.
- **The recorded measurements describe one machine.** Studio 1.8.1.27 with bridge 1.0.9, at 1280 × 800
  unless stated; a different Studio build can change what `optix_schema` and the rubric see, which is what
  `optix_schema { action: "refresh" }` reports.
