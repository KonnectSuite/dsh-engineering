# Screens and layout

A FactoryTalk Optix screen is a container tree on a 12-column grid, drawn from a design language's
tokens, inside a window that owns the header, the navigation rail, the content host and the status
strip. `optix_ui` compiles a blueprint into validated bridge operations on that grid, `optix_screen`
drafts a whole screen and mounts it in the start window, `optix_nav` plans and proves the bar,
`optix_design_check` judges the model, and `optix_render_check` judges the pixels the runtime actually
serves. This page covers the languages, the grid and its width classes, the kit and its patterns, the
shell and dialogs, and both judges — with the measured limits the repository records.

## The order that produces a screen that reads

1. Pick the design language (`optix_ui { action: "languages" }`, then `theme`).
2. Draw the shell around the start window (`optix_ui { action: "shell" }`) — header, rail, content host,
   status strip.
3. Draft each screen from a blueprint (`optix_ui { action: "screen" }`, or the simpler `optix_screen`).
4. Plan and apply the navigation bar (`optix_nav`).
5. Write the destructive-command dialog (`optix_ui { action: "dialog" }`).
6. Import and place vendor components for anything that shows live data (`optix_library`, `adapters[]`).
7. Save and Build in Studio, restart the emulator, and look.
8. Judge: `optix_design_check` per screen, `optix_render_check` on the served screen, `optix_nav verify`
   for the bar, and the release gate in [Production](./production.md).

Screens built by the kit read the same language as the shell and the rail, so the language is not a skin
painted on at the end: layout density, type scale and target sizes come from it.

## Design languages

`optix_ui { action: "languages" }` returns the catalogue without writing anything. Seven languages are
shipped; the brief picks one, and `modern` is the default when it does not.

| Language | Character | Use it for |
| --- | --- | --- |
| `modern` | **default** — light grey backdrop, white cards, navy header band, one accent for interactive state, 4/8 px radii, one soft elevation | dashboards, machine HMIs, line overviews |
| `isa101` | the ISA-101 process palette: neutral grey field, no decoration, colour reserved for state | a process HMI under an ISA-101 house standard |
| `isa101-hc` | the same discipline at high contrast | a washed-out plant floor, a projector, a bright cab |
| `modern-dark` | the `modern` structure on a dark field | control rooms, night shifts |
| `material-dark` | Material surfaces and depth on a dark field | an existing Material-flavoured house style |
| `minimal-light` | near-flat light surface, thin rules, almost no elevation | dense engineering screens |
| `kiosk` | large type and targets, few elements per screen | a wall display or a gloved-hand panel |

A language is a `StyleSheet` object: a token set (backdrop, surface, header, footer, text, muted text,
accent, accent text, border, on/off lamp colours) plus the named styles the kit's components draw with.
Every colour, radius, border and font size on a screen should come from that one place, which is what
makes switching a finished project one apply call instead of a rebuild.

### `optix_ui { action: "theme" }`

`mode: "plan"` names the sheet node, every token, every named style, and how many engine pointer writes
bind it. `mode: "apply"` validates strictly, dispatches one operation at a time, and **reads both
presentation engines back**: `engine_refs_verified` is the only claim that the runtime will draw with
this language. A theme that reports `applied_unverified` has not landed, whatever the operations said.

Two measured traps, both about how Optix stores a `NodeId`:

- **Write the pointer on the pointer node's `Value` child.** The engine's own `StyleSheet` property
  accepts a write and keeps the sheet it already had (measured on bridge 1.0.9), so naming the property
  on the engine is a no-op that reports success.
- **Spell the target project-relative** (`UI/<Sheet>`). The `/Objects/<Project>/UI/<Sheet>` spelling is
  refused by `validate_ops` with `bad_value: NodeId value must be a resolvable node path`, whether or not
  the sheet exists.

A second apply is a repair, not a duplicate: a sheet that already exists is restated.

### `optix_ui { action: "audit" }`

The audit measures the live model against the language: a screen with no theme, the two engines
disagreeing on which sheet they use, a control bypassing the sheet with a literal colour, and a token
pair whose text does not separate from its surface. Findings are `THEME-01`..`04`, each naming the node
and the fix. It judges the model; `optix_render_check` settles what is actually painted.

## The grid and its width classes

Everything the kit draws is placed on one arithmetic grid, never on guessed coordinates:

| Constant | Value | What it decides |
| --- | --- | --- |
| Columns | 12 | every card, KPI and chart spans a whole number of columns |
| `PAD` | 24 px | the screen's inner margin |
| `GUTTER` | 20 px | the gap between two placed components |
| `MIN_TARGET` | 44 px | nothing interactive is placed smaller than a touch target |

The width class comes from the canvas, and it decides how many things sit side by side:

| Width class | Canvas width | Body layout |
| --- | --- | --- |
| `compact` | up to 1200 px | cards stack; the chart goes below them |
| `standard` | up to 1700 px | three cards beside the chart |
| `wide` | above 1700 px | three cards beside the chart, more air per slot |

`overview` reserves an **88 px** header and a **56 px** footer, a **96 px** KPI strip, and splits the
rest into cards and chart: three cards beside the chart on `standard` and `wide`, stacked on `compact`.
The shell plus the kit give the geometry that is measured rather than guessed.

A blueprint is compiled into a container tree, not pinned rectangles:

```text
stretched ScaleLayout                 (the canvas)
  ColumnLayout                        (chrome)
    RowLayout                         (88 px header band)
    ColumnLayout                      (content, fill)
      RowLayout                       (one per row of cards)
        ColumnLayout                  (one per card)
        ...
    RowLayout                         (56 px footer band)
```

Every fill in that tree carries its Stretch alignment, because `layout()` derives
`HorizontalAlignment`/`VerticalAlignment` `3` from a `FILL` size — and a `-1` on its own axis renders at
the content size (measured 2026-11-17 on the first live SMT render). There is no coordinate to get
wrong: a body that cannot fit is refused (`layout_overflow`, `layout_too_narrow`) rather than drawn
overlapping.

Two refusal-shaped rules the whole kit obeys:

- A colour is a `#RRGGBB` string; `validate_ops` refuses `0xRRGGBBAA`.
- A node name a legacy scaffold already uses (`Card1`) collides — `already_exists` is reported before
  anything is written.

## The kit

`optix_ui { action: "components" }` returns the components the active language draws with, the grid, the
pattern list, the caps, the rule list under `rubric`, and the vendor `adapters`.

| Component | What it draws |
| --- | --- |
| `headerBand` | the top band: title, subtitle, up to 4 status chips, clock, language selector, user badge, alarm bell |
| `kpiTile` | one figure with its caption and unit |
| `card` | a titled surface with label/value rows and lamp rows |
| `barChart` | a bar plot with a caption, unit and optional threshold |
| `messageFeed` | a stack of recent events or alarms |
| `statusStrip` | the bottom line: communication and run state |
| `lamp` | a state square driven by a Boolean tag |
| `divider` | a rule between groups |
| `heroImage` | a drawing or an imported panel that carries the picture of the process |

### Blueprint shape

```json
{
  "name": "LineOverview",
  "title": "LAMINATOR LINE",
  "subtitle": "cutter and stack status",
  "pattern": "overview",
  "header": { "chips": ["RUN", "AUTO"], "clock": true, "language": true, "user": true, "bell": true },
  "kpis": [{ "label": "OEE", "tag": "Model/Smt/OEE", "unit": "%" }],
  "cards": [
    { "title": "CUTTER", "rows": [
      { "label": "Belt speed", "kind": "value", "tag": "Model/Smt/BeltSpeed" },
      { "label": "Cut off", "kind": "lamp", "tag": "Model/Smt/CutOff" }
    ] }
  ],
  "chart": { "title": "Throughput", "unit": "uph", "values": [180, 205, 191, 214] },
  "status": { "text": "Comm. Driver - established", "ok": true },
  "footer": "AryaCode - FactoryTalk Optix"
}
```

`chrome: "none"` skips the header and footer bands so a window shell can own them instead.

### The six patterns

| Pattern | For | Needs |
| --- | --- | --- |
| `overview` | a line or cell at a glance: KPIs, cards, a chart, a feed, a status strip | at least one card or KPI |
| `station` | the machine wall an operator scans for a red lamp | stations, each with its lamp and labels |
| `table` | row-per-thing: alarms, units, recipes, the shift log | columns and rows |
| `faceplate` | one piece of equipment with its detail under it | the equipment's values |
| `split` | the numbers beside the picture of them | a chart or drawing plus values |
| `blank` | the deliberate empty screen | nothing — it writes nothing |

A pattern given no content of its own is refused (`blueprint_pattern_content`) instead of being
answered as an empty screen.

**Density caps** — a blueprint that asks for more is sliced to the cap, so ask for what the screen can
show:

| Item | Cap |
| --- | --- |
| cards | 3 |
| KPIs | 4 |
| message-feed cards | 8 |
| stations | 6 |
| table columns × rows | 5 × 6 |
| navigation buttons | 4 |

**Operations per screen, measured on 1.8.1.27.** One station tile compiles to **87–88** operations, so
`MAX_STATIONS` is 6. A six-tile station wall is **594** operations, that wall plus the line's KPI strip is
**645**, a 6×5 table with a KPI, a feed and a status strip is **588**, and a faceplate with a chart is
**391**. `maxScreenOps` is **700** on `optix_screen`, and the cap exists because the bridge only resolves
a parent it created in the same batch: a screen cannot be split across calls. A ceiling of 400 refused a
four-tile station wall at 414, and one of 600 refused a station wall that also carried the KPI strip; 700
holds every dense screen the patterns produce, and only a fully loaded 1920×1080 `overview` (**1011**)
exceeds it, with the component to drop named.

**The station wall is laid out for the tile's shape, not the row's width.** Six machines become 3+3 at
one tile size — never 5+1 with the stranded last tile stretched across the row. The tile keeps closest
to 1.4:1: **397×294** at 1280×800, **324×247** at 1060×706, **610×434** at 1920×1080, gated by 200 px
across and 110 px down. A row band never goes below `MIN_ROW_BAND` **26 px**.

## The shell

A screen is not the application. `optix_ui { action: "shell" }` draws the four bands around the **start
window**, identical on every screen, and the navigation rail is a **native `NavigationPanel`**, not a row
of buttons: one `NavigationPanelItem` per screen under `<rail>/Panels`, each with a `Title` and a `Panel`
pointer, and the panel's `AttachedPanelLoader` pointing at the content host.

| Band | Height | What it holds |
| --- | --- | --- |
| `ShellHeader` | 64 px | brand, title, clock, who is logged in |
| navigation rail | 220 px wide | one item per screen, with icon and title |
| content host | fills | the screen the rail selects |
| `ShellFooter` | 30 px | communication status |

`optix_ui` runs four phases — `chrome`, `rail`, `attach`, `pointers` — validating each against the model
the previous one left behind, because Studio creates a panel's `Panels` collection with the panel and a
`NodeId` property has no pointer child until it is written. A refused phase names itself; nothing after
it is written. A second apply is a repair: a band or rail item that already exists is restated, not
created again.

`optix_ui` also reports the canvas, the four band rectangles with the header and footer `RowLayout`s
that arrange them, the rail targets it found under `UI/Screens`, and the phases. Options: `screens`
(defaults to every `Screen` under `UI/Screens`), `loader` (reuse an existing panel loader), `rail_width`
(clamped 160–280 px), `language`.

**The rail is the content host.** A `NavigationPanel` fills the content area and its items point at
screens, so a `PanelLoader` beside it is never driven — measured: the rail changed its active tab while
the panel stayed on the first screen. The shell draws header, rail and footer and nothing else, and the
rail's items are the only pointers to wire. The panel itself carries no background colour: a band drawn
behind it is what supplies the surface.

## Dialogs

A dialog is a `Dialog` object type opened by Studio's own `UICommands.OpenDialog` and closed by the
dialog's own `Close` method — no NetLogic, no absolute pointer in a property. `optix_ui { action:
"dialog" }` writes it in five phases:

| Phase | What it writes |
| --- | --- |
| `folder` | `UI/Dialogs` when it is missing |
| `type` | the `Dialog` object type with its title band, message text and one to three buttons |
| `content` | the surface rectangle, pushed behind the texts so they do not float over the screen |
| `wire` | the confirm and cancel buttons' commands |
| `trigger` | a button on the named screen that opens the dialog |

`kind` is `confirm` (a question with two buttons: `confirm_label` and `cancel_label`, and `destructive:
true` marks the confirm button), `message` (one acknowledgement button, default **Close**) or `faceplate`
(a parameterised dialog). Options: `name`, `title`, `message`, `parent` (default `UI/Dialogs`),
`trigger_screen`, `trigger_name`, `width`/`height` for the popup box.

Measured rules that decide whether it renders:

- `OpenDialog` takes **three** arguments — `Dialog`, `AliasNode`, `ParentItem`. The `Dialog` argument has
  to be the **`/Objects/<Project>/…`** path; that is the one place a dialog is named that way.
- The `Dialog` argument must arrive as a **project-relative path** (`UI/Dialogs/<Name>`) at the bridge
  boundary so it is written as a `NodeId`; an `/Objects/...` fragment that lands as a String is refused
  by the runtime with `is not a non-empty NodeId`.
- It closes through its **own** `Close` method (`command: "CloseDialog"` fails with
  `Method 'CloseDialog' not found on target object .../Commands/UICommands`).
- `UICommands/OpenDialog` mounts nothing unless the window has a real `PanelLoader` with a panel; a bare
  `PanelLoader` child is not a host.
- A second apply restates the wording and the boxes instead of creating a second dialog.

A destructive command without a dialog in front of it is `VIEW-DLG-01` in the rubric; the dialog's own
behaviour is proved by clicking it in the runtime, never by the operations that wrote it.

## `optix_screen`

`optix_screen` drafts a whole screen as one validated operation batch and — unless told not to —
**mounts** it, because a window shows only its own children and the templates ship `UI/MainWindow` with
nothing inside it. It is the simple lane; `optix_ui { action: "screen" }` is the designed one.

| Parameter | Meaning |
| --- | --- |
| `name`, `title`, `subtitle`, `footer` | the screen name and its bands' text |
| `width`, `height` | canvas; omitted means the start window's own size from the live model |
| `cards` | up to 4 data cards, each a title plus label/value and label/lamp rows that follow a Model path |
| `nav` | up to 4 buttons, each a label and the screen path it opens |
| `screens_folder` | where the `ScreenType` is created (default `UI/Screens`) |
| `panel_loader`, `mount`, `mount_name` | which loader mounts it; `mount: false` when something else does |
| `theme`, `library_items` | palette overrides, and shipped composites stamped onto the screen |
| `dry_run` | defaults to `true`: validate the whole batch against the live model, write nothing |
| `project` | required when it does not resolve from the workspace |

Measured behaviour worth knowing before you rely on it:

- The screen is created as a **`ScreenType`** because a bare `Screen` instance does not load at runtime.
- When the window holds no loader, the same batch creates one across the canvas and binds its `Panel`
  pointer by literal `raw_path` — a screen is an `ObjectType`, not a variable, so `source_path` is
  refused (`source_not_variable`).
- The mount link must be **project-absolute** (`/Objects/<Project>/UI/Screens/<Screen>`). A bare
  `UI/Screens/<Screen>` resolves against the loader's own parent, where no such node exists: Studio
  paints the property red, the render stays blank, and this cost the project two saved builds to find.
- A **fresh starter screenshots as one flat colour**, and that is correct: the templates ship a window
  with no screen inside it. Content appears once a screen is drawn, mounted **and saved**.
- The navigation bar is drawn in the **start window, beside the loader**. A button created inside a panel
  resolves its loader path to the design-time object, and the runtime then refuses the click. Each
  button is named for the panel it opens (`Nav_<target>`), so drafting a second screen adds its buttons to
  the shared bar instead of replacing the first screen's.
- A button that navigates to the screen being drafted **is** wired in the same batch: that path is the
  batch's own output, so it is never probed as a missing target (measured live 2026-11-14, where a
  self-navigating second screen drew a `DETAIL` button that did nothing until it was wired by hand).
- Each bar button carries its own `BackgroundColor` and `TextColor` from the palette. A `Button` with no
  fill takes the style sheet's grey, and its white label measures **1.4:1** against it — which is what
  the shell bar was rendering before the draft wrote the fill.
- A display too small for the scaffold, a body with no room under the header and footer, or a card too
  small to read are **refusals**, not warnings.

## `optix_nav`

A screen that never changes when a button is clicked is the failure this tool exists to stop: the button
exists, its handler compiles, the design checks pass, and the runtime does nothing. The cause is where
the button sits. A button **inside** a panel resolves its handler against the design tree, the runtime
instantiates the UI per session, and the click answers `No behaviour or observer found that handles the
method 'ChangePanel'`. A button **beside** the loader, as a child of the window, resolves the same way in
both trees — which is what Rockwell's own navigation template does, with a *relative* `@NodeId` pointer
rather than an absolute design-time one.

| Action | What it does |
| --- | --- |
| `plan` | reads the start window, its loader and the target screens; reports the bar rectangle, every button's slot and whether it already exists; writes nothing |
| `apply` | validates the whole batch, then creates the missing buttons, restates geometry and colours, and wires each new button through the loader's `ChangePanel` |
| `reconcile` | reports targets whose screen is missing, buttons that carry no handler, and `Nav_` buttons the window holds that this bar does not name |
| `verify` | opens a headless browser at the window's own size, clicks each button in the served preview, and reads the loader's `Panel` back through the bridge — a pass means the panel changed, not that an operation was acknowledged |

Geometry is arithmetic, never hand-placed: at most six buttons to a row, 44 px high, footer band 56 px,
outer pad 24 px, so `bar.top = height − 56 − 24 − 56`, `bar.left = 24`, `bar.width = width − 48`, and
button width `min(200, (bar.width − 12 × (n − 1)) / n)` with a 120 px floor. At 1280×800 the bar is
`{left: 24, top: 664, width: 1232, height: 56}`.

Handlers are **relative** `DynamicLink` pointers, and `apply` clears the absolute `ObjectPointer` value
the runtime would otherwise resolve first — that value is `OPTIX-PROD-01`, and leaving it is the measured
cause of a button that clicks and never switches. A second apply is a no-op, not a second handler.

`verify` accepts two runtime proofs: the loader's `Panel` read back through the bridge, or the served
page naming the target on a line that was not on screen before the click. Bridge 1.0.9 renders a
`NodeId` property as `(Null)`, so on some projects the page text is the only evidence available. A
repaint alone is reported as `repaint_only` and never counted as a pass.

Never report navigation as working from operations alone: "wired" means the model holds a handler,
"works" means a click put the target screen on the display, and only `verify` says that.

## `optix_design_check`

It reads the screen through the bridge and reports geometry a person cannot eyeball. The canvas is
resolved rather than assumed: it reads the window's mounters, resolves each `Panel` `NodeId` against the
ids the bridge reports (`ids=1`), subtracts the tab strip (`TabWidth` for a left or right strip,
`TabHeight` for a top or bottom one) and names the result in `mounted_in`. It reports the box the
mounter **declares** and does not clamp it to the window, because the runtime does not either: a rail
sized `Height 800` under a 1280×800 window with a 64 px header hands its screen 1060×800 and the window
clips the last 64 px — which the check says out loud rather than hiding behind a smaller number. A
1060×706 screen under the starter's rail (`TopMargin 64`, `Height 706`, `TabWidth 220`) is therefore
exact, and a screen that reads as a shortfall is a mounter that needs sizing.

| Rule | Severity | What it decides |
| --- | --- | --- |
| `HMI-TARGET-01` | warning | a control smaller than 44 × 44 px |
| `HMI-TARGET-02` | info | a target nearer than the minimum |
| `HMI-CONTRAST-01` | warning | text below 4.5:1 against the fill actually behind it |
| `VIEW-NAV-01` | info | no pressable control, so no way out of the screen |
| `VIEW-NAV-02` | warning | the screen cannot be left by any wired control |
| `VIEW-LAYOUT-02` | warning | the screen's size is not the box its mounter gives it |
| `VIEW-LAYOUT-03` | warning | fixed children plus gaps take the track, so a `Width`/`Height` `-1` sibling renders at zero |
| `VIEW-LAYOUT-04` | warning | a numeric size on an axis whose alignment is Stretch — the runtime discards the number |
| `VIEW-TYPE-02` | warning | text set below 11 px |
| `OPTIX-UI-01` | info | sibling screens built from the same hand-made child set |
| `OPTIX-UI-02` | warning | behaviour living inside a composition |
| `OPTIX-IMG-01` | info | an `AdvancedSVGImage` with no element property bound |
| `OPTIX-STYLE-01` | info | a literal colour outside the palette on a styled type |
| `OPTIX-LAYOUT-01` | warning | a child drawn outside its parent |
| `OPTIX-DATA-01` | info | a model number with a recorded unit and no formatter |

Geometry is absolute on the canvas, so "outside its parent" is measured against the parent's rectangle,
not a local offset. Read the result's `unchecked` list as part of the answer: a colour the bridge did not
report is not a passing colour.

Three measured layout facts behind those rules, because a layout never fixes them for you:

- **A `-1` sibling loses to fixed children.** Measured on a probe screen: a child declared 900 wide
  inside an 800 px design track rendered **1192.5 px**, and its `Width −1` sibling rendered at zero
  width, drawn past the window edge. A layout neither shrinks nor clips a child to make room for its
  neighbours, and gaps are not scaled by a parent `ScaleLayout`. On the demo's `LineStatus`, `Content` at
  `Width −1` with `LeftMargin 24` and `RightMargin 24` inside 1060 px rendered **1012 px**, and a 1050 px
  card plus a 20 px gap put its sibling at zero **58 px** past the row's edge — which is why the rule
  subtracts a container's margins before its children spend the space.
- **A size is only real if the alignment on that axis is not Stretch.** Four states of one node, each
  saved and re-measured in a fresh runtime: `Height 300` + `VerticalAlignment 3` rendered **158** (the
  leftover fill); the same 300 with alignment 0 rendered **300**; `Width 500` + `HorizontalAlignment 3`
  rendered **1012** (the whole track); the same 500 with alignment 0 rendered **500**. The model keeps
  the discarded number — `optix_read node` still reports `Height 300 (Float)` for a row drawing at 158.
  The mirror rule: a `-1` under alignment 0/1/2 renders at **content size**, which is why the demo's
  header and footer drew 204 px and 280 px instead of the 1012 px their row offered.
- **Pinning a band competes for the leftover.** Pinning a screen's two rows at 247 each would have left
  the alarm grid's row 514 − 247 − 247 − 40 = **20 px**.

## `optix_render_check`

A clean `optix_design_check` proves geometry, not legibility. `optix_render_check` captures the served
preview clipped to the window the runtime serves, measures the element boxes and computed colours, reads
the captured pixels, and asks five questions:

| Rule | What it finds |
| --- | --- |
| `VIEW-RENDER-01` | placeholder text nothing drives: `--:--`, `{TotalUnits}`, `undefined`, `TBD` |
| `VIEW-RENDER-02` | a painted surface whose text covers under 30 % of it and leaves 60 px or more empty |
| `VIEW-RENDER-03` | an element drawn outside the served window box — the runtime clips there |
| `VIEW-RENDER-04` | text under 4.5:1 against the pixels actually painted under it |
| `VIEW-RENDER-05` | text drawn in the very colour behind it — the captured box has no pixel more than 20 away |

It reads pixels because the Web presentation engine paints a fill through an untyped overlay child and
paints a `NavigationPanel`'s tabs with a gradient, so a computed background colour is not what an
operator sees. It also re-decides `HMI-TARGET-01` and `VIEW-TYPE-02` on the painted box and the computed
font, because a `ScaleLayout` fit can shrink a 12 px label below the floor or carry a 28 px heading at 28.

Two limits to state plainly: findings are located by the **rendered type chain** (`window > … >
rowlayout > rectangle`), never a project path, because the page reports none of the model's ids; and the
runtime serves the project **as saved**, so unsaved authoring is not in what it judges. Pair it with
`optix_design_check`, which reads the model and can name the node.

## Limits

- **The kit draws nine components and twelve adapters.** Anything else is a hand composition, and a
  screen built only from rectangles and labels is a mock-up: `VIEW-ADAPTER-01` says so at the release
  review, and `OPTIX-UI-01` notices when sibling screens repeat the same hand-made child set.
- **The blueprint is one batch, and the batch has a ceiling.** The bridge only resolves a parent it
  created in the same batch, so a screen cannot be split across calls; over `maxScreenOps` (700) the
  draft is refused with the component to drop named.
- **Caps are the batch, not the eye.** A blueprint above 3 cards, 4 KPIs, 8 feed cards, 6 stations or a
  5 × 6 table is sliced to the cap silently.
- **A pattern with no content is refused**, not answered as an empty screen.
- **A theme that reports `applied_unverified` has not landed**, whatever the operation count said.
- **A screenshot is of the saved build**, so it can be one save behind the model; a fresh starter is one
  flat colour because nothing is mounted yet.
- **The Studio Help cannot settle navigation**: `ChangePanel` is documented nowhere in it, which is why
  the bar is proved by `optix_nav verify` and not by a page.
- **No figure here is a promise about a screen in front of you.** The ops counts, tile sizes and pixel
  measurements were taken on Studio 1.8.1.27 with the shipped starter; the same blueprint on another
  canvas is a different screen.

Next: [Project](./project.md) for the model, saving and the emulator, [Artwork](./artwork.md) for SVG that
animates, and [Production](./production.md) for the release gate that judges the result.
