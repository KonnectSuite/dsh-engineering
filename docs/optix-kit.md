# Optix screen kit

A designed screen is not a pile of rectangles. It is a header, a hierarchy of information, a consistent grid, and a status the operator can trust at a glance. `optix_ui` turns a **blueprint** - a description of *what* a screen shows - into validated bridge operations, using the vocabulary of the project's design language.

Apply the language first ([design languages](optix-theme.md)); the kit draws with its tokens.

## The components

`optix_ui { action: "components" }` answers with the kit a given language draws with:

| Component | What it is |
| --- | --- |
| `headerBand` | the top band: title, subtitle, up to 4 status chips, clock, language selector, user badge, alarm bell |
| `kpiTile` | one number with its label, unit and an optional progress bar |
| `card` | a titled surface with value, lamp and bar rows |
| `barChart` | a titled bar series with per-bar values and a threshold index drawn in the danger colour |
| `messageFeed` | a short list of operator messages, each its own card |
| `statusStrip` | the bottom strip: connection lamp plus a sentence |
| `lamp` | a square state indicator |
| `divider` | a hairline rule between sections |
| `heroImage` | a process graphic or photograph slot with a caption |

Every component is placed by the layout, not by a coordinate. Component names are prefixed with `Data` where a legacy scaffold may already own the plain name (`DataCard1`), because a second node of the same name under one parent is a real collision - `validate_ops` reports it as `already_exists` before anything is written.

## The blueprint

```json
{
  "pattern": "overview",
  "title": "LINE 1",
  "subtitle": "cutter and stack",
  "chips": ["RUNNING", "SHIFT A"],
  "kpis": [
    { "label": "Belt speed", "value": "1.4", "unit": "m/s", "percent": 62 },
    { "label": "Stack count", "value": "482", "unit": "pcs", "percent": 84 }
  ],
  "cards": [
    { "title": "CUTTER", "rows": [
      { "kind": "value", "label": "Blade life", "value": "89", "unit": "%" },
      { "kind": "lamp", "label": "Running", "on": true },
      { "kind": "bar", "label": "Load" } ] }
  ],
  "chart": { "title": "REFLOW OVEN - Temperature", "unit": "°C",
             "values": [98, 181, 225, 61, -9], "threshold": 2 },
  "messages": [ { "title": "Maintenance reminder", "body": "Belt maintenance: 2 days left" } ],
  "footer": "Comm. Driver - established"
}
```

Only `pattern: "overview"` and `"blank"` exist today; `blank` writes nothing (it is the deliberate empty screen), and `chrome: "none"` skips the header/footer bands so a window shell can own them instead. P3 adds the shell and the navigation rail, P4 the dialogs.

## The layout

`packages/optix/lib/layout.js` is pure arithmetic and every refusal is a typed error:

- 12-column grid, `PAD 24`, `GUTTER 20`, `MIN_TARGET 44` (a target smaller than that is not a touch target).
- Width classes: `compact` up to 1200, `standard` up to 1700, `wide` above.
- `overview` reserves an 88 px header and 56 px footer, a 96 px KPI strip, then splits the body into cards and chart (three cards beside the chart on `standard`/`wide`, stacked on `compact`).
- A body that cannot fit, a canvas that is not a screen size, or a component under its floor is refused with `layout_overflow`, `layout_too_narrow`, `layout_invalid_canvas` or `layout_empty` - never drawn overlapping.

## What `screen` does

`optix_ui { action: "screen", project, screen, pattern, blueprint, mode }`:

1. reads the start window from the running model for the canvas (`liveScreenHost`), so a designed screen matches the window it is shown in;
2. refuses a screen that does not exist (`no screen at <path>: create and mount it with optix_screen first`);
3. compiles the blueprint into `create_widget` and `set_property` operations;
4. validates the whole batch with `validate_ops strict: true` - nothing is written when one operation is refused;
5. in `mode: "apply"` (behind the write gate) dispatches one operation at a time with a health re-check, and reports `partial`/`indeterminate` honestly instead of "done".

The screen it draws into must be a real screen node. A fresh one can be created through the bridge:

```
POST /bridge/model/object?parent=UI/Screens&name=Overview&type=Screen
```

(`type=ScreenType` is not a type the bridge resolves; `type=Screen` is.)

## Colours are hex strings

`validate_ops` refuses `0xRRGGBBAA` with `Color must be #RRGGBB / #AARRGGBB hex or a UInt32 decimal` (measured on bridge 1.0.9). The kit normalises every token to `#RRGGBB` and drops alpha; a token that is not a hex colour falls back to grey rather than writing something the model refuses.

## Proved live

On `AryaOptixTemplate` (bridge 1.0.9, 1280×800 window) against a fresh `UI/Screens/UiProbe`:

- `optix_ui { action: "screen" }` → `status: "planned"`, `operations: 287`, `components: 19`, `validation: ok`;
- `mode: "apply"` → `status: "applied"`, `applied: 287`.

The visual proof (a save, a build and a screenshot of the designed screen) belongs to P7, where the whole shell is drawn in a fresh starter; until then the model evidence is: every operation validated, every created name resolved, and the apply reported per operation.

## Harness

`node test/optix-live-screen.mjs [apply] [mount]` is the manual live harness: `OPTIX_SCREEN` picks the target (default `UI/Screens/Settings`), `OPTIX_PROJECT` the project name, `OPTIX_BRIDGE_URL` the bridge. `mount` runs `optix_screen` first to create and mount a scaffold, which is the one step that changes the project beyond the blueprint.
