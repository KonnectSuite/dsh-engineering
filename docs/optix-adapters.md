# Optix vendor components and artwork

A screen drawn only from rectangles and labels is a mock-up. Optix ships the widgets a production screen is made
of — an alarm banner, an alarm grid, a trend, a recipe editor, a login form, a gauge, a station status — and a
project that does not use them looks entry level no matter how neat the grid is. This page is how the generator
reaches them: **adapters** place a vendor widget, **artwork** gives the shell its icons and its process drawings.

## Adapters

`optix_ui { action: "components" }` returns the drawn kit *and* `adapters` — the vendor components, each with
`library`, `item`, what it requires and why it exists. A blueprint names them beside its cards and its chart:

```json
{
  "title": "ALARMS", "pattern": "overview",
  "adapters": [
    { "kind": "alarmGrid", "name": "LiveAlarms", "type_path": "UI/Components/Widgets/AlarmGrid",
      "bindings": { "Model": "Model/Alarms" } }
  ]
}
```

| kind | library item | requires | what it is for |
| --- | --- | --- | --- |
| `alarmBanner` | `Widgets/AlarmBanner` | Model | the newest unacknowledged alarm, in the header |
| `alarmGrid` | `Widgets/AlarmGrid` | Model | the live list with acknowledgement |
| `alarmHistoryGrid` | `Widgets/AlarmHistoryGrid` | Model | what happened, from the store |
| `trend` | `Widgets/AdvancedTrend` | Model | pens over time with a cursor |
| `recipeEditor` | `Widgets/RecipesEditor` | — | select, edit, save, download a recipe |
| `loginForm` | `Widgets/LoginForm` | Users alias | the only login surface Optix provides |
| `userEditor` | `Widgets/UserEditor` | Users alias | users and their groups |
| `gauge` | `Widgets/AnalogItemGauge` | Model | one analogue value as an instrument |
| `stationStatus` | `Widgets/StationConnectionStatus` | — | is this station connected |
| `dataGrid` | builtin `DataGrid` | Model, Query | a native table |
| `histogram` | builtin `HistogramChart` | Model, Query | native bars |
| `trendNative` | builtin `Trend` | Model, Query | the native trend, without the library |

### The rule that keeps it honest

**An adapter does not import.** `optix_library { action: "import" }` does that, as a visible step, because an
import writes hundreds of nodes into the project. A library-backed adapter with no `type_path` refuses:

```
adapter_not_imported: Alarm grid is a library item; import it first with tool "optix_library",
action "import", library "Widgets", item "AlarmGrid", then pass typePath (the imported type's project path)
```

**An adapter does not guess a binding.** It places the widget, sets its geometry, applies the `bindings` it was
given, and reports what it could not bind in `unbound` — a placed widget with an empty binding is still a working
widget; a widget wired to a guessed variable is a lie.

A library item is placed with `create_object … object_type: "<imported type path>"`; a builtin one with
`create_widget … widget_type: "<Type>"`. Both are 44×44 px minimum (`adapter_bad_slot`), and the name must be a
Logix identifier (`adapter_bad_name`).

## Artwork

`optix_ui { action: "assets" }` writes the authored set into `<Project>/ProjectFiles/imgs/`, which is what
`%PROJECTDIR%` resolves to and the only folder the Web Presentation Engine serves. A file copied beside the project
(into `<Project>/imgs/`) is a 404 at runtime and renders as a blank image.

- **16 icons, 24×24**, SVG 1.2 Tiny, hex fills: `home`, `overview`, `alarms`, `trends`, `diagnostics`, `settings`,
  `users`, `recipes`, `reports`, `logout`, `ok`, `warning`, `alarm`, `offline`, `chevron`, `bell`.
- **2 process drawings**: `conveyor` (frame, belt, four rollers, workpiece, guard, stack) and `tank` (tank, level,
  pipes, valve) — every movable part carries an `@id` so `optix_svg bind` can drive it: `Conveyor_Color` turns the
  belt red when the line stops, `Tank_Color` shows a fault.
- `only: ["home", "alarms"]` writes a subset; `mode: "plan"` reports the files and writes nothing.

An `Image` node then points at `%PROJECTDIR%/imgs/home.svg`, and a `NavigationPanelItem`'s `ImagePath` takes the
same string.

Measured on the live bridge (`AryaOptixTemplate`, bridge 1.0.9):

| call | result |
| --- | --- |
| `action components` | 9 drawn components plus 12 adapters |
| `action assets` (plan) | 3 files, written 0 |
| `action assets` (apply, `only: ["home","alarms","conveyor"]`) | 3 files written into `ProjectFiles/imgs` |

## Proving it

- `node scripts/test.mjs --only optix-adapters` — the catalogue, the imported-type refusal, the builtin placement,
  the slot/name/screen refusals, the `unbound` report, the blueprint that compiles an adapter with the chrome
  around it, and the adapters-only body.
- `node scripts/test.mjs --only optix-assets` — every icon is Tiny, 24×24, hex-only and free of `currentColor`; the
  colour substitution and its refusals; the process drawings' ids; `writeAssets` into a scratch project (and the
  dry run that writes nothing).
- `node test/optix-live-screen.mjs assets` — the same two calls against a real project.

The adapter placement itself is proven where it matters: at runtime, after Save and Build, the alarm grid shows
alarms. A grid that reads back as a node and never receives an alarm is not a working alarm grid, and this page
does not claim otherwise.
