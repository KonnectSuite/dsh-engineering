# Optix navigation: the window bar and the proof that it works

Navigation is the first thing a reviewer clicks and the last thing a generator gets right. The
measured failure is not a missing operation — it is a button that exists, carries a handler, passes
the design checks, and does nothing when it is clicked. This page is about the construct that avoids
that, the tool that emits it, and the proof that closes the loop.

## Why a handler belongs beside the loader

A `PanelLoader` shows one screen. A button changes it by calling the loader's `ChangePanel` method
with the screen as `NewPanel`.

A button that sits **inside** a panel resolves its handler's target relative to the design tree. The
runtime instantiates the UI per session, so the same relative path resolves to a different object,
and the runtime answers:

```text
No behaviour or observer found that handles the method 'ChangePanel' on node
Root/Objects/<project>/UI/MainWindow/MainLoader
```

A button that sits **beside** the loader, as a child of the window, resolves the same way in both
trees. Rockwell's own
[`Optix_Template_NavigationButtons`](https://github.com/FactoryTalk-Optix/Optix_Template_NavigationButtons)
does exactly this: five nav buttons in `UI/MainWindow`, each with an `EventHandler` child whose
`ObjectPointer` holds a **relative** `DynamicLink` (`../../../../../../../PanelLoader1@NodeId`), not
an absolute design-time NodeId. That relative pointer is why the template survives a rename, and it
is the shape `optix_nav` emits.

Two consequences the tool enforces:

- The bar is placed on the window's own canvas (`Width`/`Height` read from the live model), in the
  band above the footer — not into a screen, and not at coordinates guessed from a brief.
- The bar is at most six buttons of 44 px (the touch minimum). A seventh target is a menu, not a
  narrower row, so the tool refuses instead of clipping.

## `optix_nav`

| Action | Writes | What it answers |
|---|---|---|
| `plan` | no | the bar rectangle, every button's slot, which buttons exist, which screens are missing, how many need wiring |
| `apply` | yes (`allowWrites`) | creates only the missing buttons, restates geometry and colours, wires only buttons with no handler child |
| `reconcile` | no | missing screens, buttons without a handler, `Nav_*` buttons in the window this bar does not name |
| `verify` | no | opens a headless browser at the window size, clicks each button in the served preview, reads the loader's `Panel` back through the bridge |

`targets` is an ordered array: `[{ "label": "Alarms", "screen": "UI/Screens/Alarms" }]`. A bare
`screen` name resolves under `screens_folder` (`UI/Screens` by default); the caption defaults to the
screen name; the node name defaults to `Nav_<screen>`.

The bar's geometry: `bar.top = height - FOOTER - PAD - NAV` (`FOOTER = 56`, `PAD = 24`, `NAV = 56`),
`bar.left = 24`, `bar.width = width - 48`; button width is `min(200, (bar.width - 12*(n-1))/n)` with a
120 px floor. For a 1280×800 window that is a bar at `{24, 664, 1232, 56}`.

`planOps` is idempotent by construction: it creates only names that are absent, always restates the
box and the four appearance properties, and wires only names whose `EventHandler` child is missing.
A second `apply` is a no-op rather than a second handler.

### What `apply` does beyond the batch

1. `validate_ops` with `strict: true` — the whole batch must resolve before anything is written.
2. Ops are dispatched one at a time, with a `health` re-check between them: if the serving Studio's
   project, pid or project path changes mid-batch, the answer is `indeterminate` rather than a
   half-applied bar reported as complete.
3. `clearPointerValues` clears the absolute `Value` on every `.../MethodsToCall/MethodContainer1/ObjectPointer`
   it just wrote. The runtime resolves that absolute design-time NodeId before the relative link, so
   clearing it is part of wiring, not cleanup. `optix_production_check` reports it as
   `OPTIX-PROD-01` when it survives.
4. The `next` sentence names the handoff: Save (`Ctrl+S`), Build (`Ctrl+Shift+B`),
   `optix_emulator action restart`, then `verify`. The bridge authored the model; only Studio writes
   the file the runtime loads.

### What `verify` proves, and what it refuses to claim

`verify` needs `preview` and `allowPreviewInput`, plus a running emulator for the project (it probes
the preview address and returns `blocked` with the runtime log tail when nothing answers). It opens a
headless Chromium at exactly the window's size, so a button slot's centre is a real click coordinate.

For each button it reads the loader's `Panel` before and after the click, and hashes a screenshot:

- `ok` is `true` only when the read-back panel names the button's target. A repaint is reported as
  `screen_changed` and counted as `repaint_only` — a hover, a cursor or a clock can repaint a screen,
  so a repaint is never a pass.
- `status` is `verified` only when every button opened its screen; `partial` when some did or a
  repaint was seen; `unverified` otherwise.
- `verifyNext` names the dead buttons and points at `OPTIX-PROD-01` or at a missing Save and Build.

The loop starts with a button whose screen is *not* the one already open, so the first click proves a
change rather than repeating the runtime's starting state.

## Order of work

1. `optix_nav { action: "plan", targets: [...] }` — read the bar and learn what is missing.
2. Create the screens the targets name (`optix_screen`), then `plan` again.
3. `apply` with `allowWrites`.
4. Save and Build in Studio, then `optix_emulator action restart`.
5. `verify` — a pass means the panel changed, not that an operation was acknowledged.
6. `optix_production_check` before release (navigation reachability and surviving absolute pointers).

## Tests

`test/optix-nav.spec.mjs` covers the pure half: target resolution and its refusals, the bar geometry
and its three refusals, `planOps` creating/restating/wiring exactly once, the exact `wire_event`
shape, `panelOpens` accepting only a readable panel, and `verifyNavigation` against a fake page —
including the case where screenshots change but the panel is unreadable, which must not pass.
