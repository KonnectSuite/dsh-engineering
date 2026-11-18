# authoring-loop

The order that keeps an authoring session honest. Every step is a tool call, and each one exists because
skipping it has a specific, repeatable failure.

## 1. Know which project and whether it is saved

```
optix_status project="<name>" project_root="<folder holding the .optix>"
```

Read `model_loaded`, `project`, `needs_save.pending`, `build_state`, and `setup`. A pending count above
zero means the bridge holds edits Studio has not written; the runtime cannot see them.

`setup` is the same question asked before anything is loaded: the ordered steps that make the project
authorable, each one owned by a tool or by the engineer. Read it whenever a call fails for want of a
bridge, and hand the human only the steps tagged `human`:

| Step | Owner | Why it is that owner |
| --- | --- | --- |
| `project` | tool | The folder is found by `optix_project`/`optix_status`; a project that was never opened is still readable. |
| `bridge_in_project` | tool | `optix_bridge_arm` writes the class and the `StudioMCPBridge` NetLogic node, backing up every file it touches. |
| `studio_open` | **human** | No tool can start Studio, open a project inside it, or activate a licence. |
| `bridge_started` | **human** | Right-click `StudioMCPBridge` → StartBridge is a Studio menu item. Nothing outside Studio can press it. |
| `save` | tool | `optix_save` raises the window and sends Ctrl+S until a file moves. |
| `build` | tool | `optix_build action build` compiles NetSolution outside Studio — after `optix_emulator action stop`, because the runtime locks the DLL. Studio documents no build keystroke; its route is the solution opened from the main toolbar's **Open .NET Solution**. |
| `runtime` | tool | `optix_emulator action start` is the only sanctioned way to run the project. |
| `preview_tools`, `browser` | **human** | `preview: true` in the Optix plugin row, and a browser to attach to, are settings this side cannot set. |
| `ocr` | tool | `optix_ocr_setup with install true` installs Tesseract; the step only appears when none is configured. |
| `licence` | **human** | Reported last with `done: null` — nothing outside Studio can observe a licence, so it is never guessed. |

`done: null` means *not observable*, and it never blocks `ready`. `next` names the first step that is
actually open, which is the sentence to give the engineer.

## 2. Author in batches, validate first

```
optix_edit dry_run=true ops=[...]
optix_edit dry_run=false ops=[...]
```

- One batch cannot reference a node another op in the same batch creates (`unresolved_parent`); split it.
- A batch cannot check a property on a node created earlier in the same batch (`unverifiable_property`).
- 30 ops per call is safe; a much larger batch is refused.
- `set_property` writes scalars, enums and colours. Arrays and structured collections are refused on
  purpose (`unsupported_array_write`) — a scalar write to an array variable has taken Studio down before.
  Structured collections go through their own routes (see `bindings-expressions`).

## 3. Save, and prove the save

```
optix_save project="<folder holding the .optix>"
```

`ok: true` means a file under `Nodes/` or `ProjectFiles/NetSolution/bin` is newer than before the first
keystroke. `foreground_refused` means another window held the foreground (a Windows Security prompt is the
usual culprit); `no_write` means Ctrl+S was delivered but Studio wrote nothing — usually a modal dialog.

## 4. Restart the runtime to see it

```
optix_emulator action="restart" project="<folder>"
```

The runtime loads the project as saved. Stop it before a save if a C# build is expected: a save while the
runtime holds `bin\AryaOptixTemplate.dll` silently skips the build.

## 5. Prove it visually

```
optix_screenshot                     # a picture
optix_preview action="text"          # every rendered string, which is decisive for "did this label render"
```

`optix_preview action="text"` is the cheapest way to catch a widget that exists, reports success and paints
nothing — the failure mode this plugin hit most often.

## 6. Never trust the model for a behaviour claim

A node created through the bridge is a `BaseObject` shell unless it is a UI node. NetLogic must come from
`optix_script`, alarm objects from C#, and a `Trend` created through the bridge draws axes and nothing else.
When a feature "should work" and renders nothing, ask first whether the node is an instance of a behaviour
type, not whether the property is set.
