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
| `verify` | no | opens a headless browser at the window size, clicks every `Nav_*` button (or the targets named) in the served preview, and accepts two proofs: the loader's `Panel` read back through the bridge, or the served page naming the target on a line that was not on screen before the click |

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
With no `targets` it proves the window's existing `Nav_*` buttons — a proof that only checks what the
caller already listed proves nothing.

Each click is judged by two proofs, strongest first:

- **`panel`** — the loader's `Panel` read back through the bridge names the target. This is the
  authoritative answer when the bridge can report it.
- **`page text`** — the served page shows the target's name on a line that was *not* visible before
  the click (`document.body.innerText`). The Web Presentation Engine renders real DOM text, so this is
  runtime evidence, not a guess. A navigation bar always shows its own labels, so a name that was
  already on screen is never counted: only lines that appeared after the click are checked.

Everything else is reported but never passes:

- `screen_changed` is a screenshot-hash comparison. It is counted as `repaint_only` — a hover, a
  cursor or a clock can repaint a screen, so a repaint alone is not a pass.
- `panel_read` is `false` when the bridge renders the property as `(Null)`. Bridge 1.0.9 reports a
  `NodeId` property that way, for both `Panel` and `CurrentPanel`, so on some projects the page text is
  the only runtime evidence available. That is why the second proof exists.
- `status` is `verified` only when every button is proven; `partial` when some are or a repaint was
  seen; `unverified` otherwise. `proven_by` says which proof carried the run.
- `verifyNext` names the dead buttons and points at `OPTIX-PROD-01` or at a missing Save and Build.

The loop starts with a button whose screen is *not* the one already open (the panel when the bridge
reports it, otherwise the page's first line), so the first click proves a change rather than repeating
the runtime's starting state. `screen_before`/`screen_after` are that belief, not a bridge read.

## Order of work

1. `optix_nav { action: "plan", targets: [...] }` — read the bar and learn what is missing.
2. Create the screens the targets name (`optix_screen`), then `plan` again.
3. `apply` with `allowWrites`.
4. Save and Build in Studio, then `optix_emulator action restart`.
5. `verify` — a pass means a click was followed by the target screen, not that an operation was
   acknowledged.
6. `optix_production_check` before release (navigation reachability and surviving absolute pointers).

## Tests

`test/optix-nav.spec.mjs` covers the pure half (13 tests): target resolution and its refusals, the bar
geometry and its three refusals, `planOps` creating/restating/wiring exactly once, the exact
`wire_event` shape, `panelOpens` accepting only a readable panel, `panelProperty` treating the bridge's
`(Null)` as unreadable, and `verifyNavigation` against a fake page — a proof by panel, a proof by page
text when the panel is unreadable, a bar label that was already on screen *not* counting, and the case
where screenshots change but nothing names the target, which must not pass.
