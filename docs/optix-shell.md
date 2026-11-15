# The window shell

A screen full of cards has no place to say who is logged in, which cycle is running or what the
machine is doing. Every professional Optix application puts those answers in four bands around the
content and keeps them identical on every screen, so the operator's eye does not re-find them:

```
+------------------------------------------------------+
| ShellHeader: brand, title, clock, user               |  64 px
+--------+---------------------------------------------+
| Shell  |                                             |
| Rail   | ShellContent (the panel loader)             |  the rest
| 220 px |                                             |
+--------+---------------------------------------------+
| ShellFooter: communication status                    |  30 px
+------------------------------------------------------+
```

`optix_ui { action: "shell" }` composes that shell around the project's start window. It reads the
canvas from the live window, draws the bands with the active design language's tokens, makes the rail
a native `NavigationPanel` with one item per screen, and points everything at the screens it hosts.

## Plan first, then apply

```jsonc
// 1. what would it draw?
{ "action": "shell", "project": "LineHMI", "mode": "plan" }

// 2. draw it, behind allowWrites
{ "action": "shell", "project": "LineHMI", "mode": "apply" }
```

`plan` reports the canvas, the four band rectangles, the rail targets it found under `UI/Screens`, the
phases and their operation counts, and validates the first phase only. `apply` validates each phase
against the model the previous phase left behind and dispatch operations one at a time with a health
re-check, so a refused phase names itself and nothing after it is written.

Options: `screens` (`[{ screen, title }]`, otherwise every `Screen` under `UI/Screens`), `loader` (an
existing panel loader to reuse), `rail_width` (clamped to 160–280 px), `language`.

## Why four phases

Studio creates a navigation panel's `Panels` collection with the panel, and a `NodeId` property has no
pointer child until it is written. So the plan is phased, and each phase validates against the model
the previous one leaves:

| Phase      | What it writes                                                       | Why it cannot be earlier                     |
| ---------- | -------------------------------------------------------------------- | -------------------------------------------- |
| `chrome`   | bands, rail object, content host, geometry, tokens                    | the window has to exist                      |
| `rail`     | `RailItem1..n` inside `<rail>/Panels`, with their `Title`            | `Panels` exists only after the rail does     |
| `attach`   | `<rail>` `AttachedPanelLoader` = the loader                           | materialises the pointer node (`ref` is empty until then) |
| `pointers` | `<item>/Panel`, `<loader>/Panel`, `<rail>/AttachedPanelLoader` values | the pointer nodes exist only after `attach`  |

A second `apply` is a repair, not a duplicate: a band or rail item that already exists is not created
again, its geometry and title are restated, and the pointers are rewritten.

## The measured rules it follows

- A `NodeId` is written on the pointer node's `Value` child as `UI/<Path>`. The
  `/Objects/<Project>/…` form is refused by `validate_ops` with `bad_value: NodeId value must be a
  resolvable node path`, even for a node that exists.
- The rail's `AttachedPanelLoader` is a settable `NodeId` on the panel with **no** pointer child in
  the model. Writing it materialises `<rail>/AttachedPanelLoader`; the value then goes on that child.
  Writing the property in the same batch as the value fails, which is why `attach` is its own phase.
- A literal colour is `#RRGGBB`; the `0xRRGGBBAA` spelling is refused.
- A `Panel` has no background colour (measured): bands are `Rectangle` objects, panels are containers.

## What it does not do

The shell does not draw screens, dialogs or content. It composes the frame around them, so the order is
`optix_ui { action: "theme" }` → `optix_ui { action: "shell" }` → `optix_ui { action: "screen" }` (or
`optix_screen`), then Studio's Save + Build, then the runtime.

The shell also does not prove a tab click. `optix_nav { action: "verify" }` does that by clicking each
tab in the served page and reading the panel back (through the bridge where it can, through the page's
own text where the bridge cannot read a `NodeId` — measured on bridge 1.0.9).

## Tests

`test/optix-shell.spec.mjs` covers the geometry, the phase split, item and pointer operation shapes, the
idempotent second apply, the rail clamp and the refusals. `test/optix-live-shell.mjs` is the manual
harness: `node test/optix-live-shell.mjs` plans against the running bridge, `apply` writes it.
