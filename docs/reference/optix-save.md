# Saving a project: `optix_save`

Studio exposes no save API to a NetLogic bridge. `UAManagedCore` can read and write the design model,
compile NetLogic, open dialogs and query a store, but writing `Nodes/**` to disk is the IDE's own
business — which is why every round of authoring in this plugin used to end with the same handoff:
"ask the engineer for Ctrl+S, then Ctrl+Shift+B".

`optix_save` closes that loop. It performs the keystroke itself, and — the important part — it does not
report success until the design model on disk has actually moved.

## What it does

1. Finds the Studio process that owns a visible main window (`Get-Process FTOptixStudio`, non-zero
   `MainWindowHandle`) and records its handle.
2. Snapshots the newest modification time under `Nodes/` and `ProjectFiles/NetSolution/bin`.
3. Raises that window. This is the hard part: a plain `SetForegroundWindow` is refused while another
   process owns the foreground, so the script attaches to the foreground thread's input queue with
   `AttachThreadInput`, then calls `ShowWindow(SW_RESTORE)`, `BringWindowToTop`, `SetForegroundWindow`
   and `SetActiveWindow`, and detaches again.
4. Confirms the foreground really is Studio (`GetForegroundWindow() == hwnd`) **before** sending
   `[System.Windows.Forms.SendKeys]::SendWait('^s')`. A keystroke that would land in another window is
   never sent; the attempt is retried instead.
5. Waits for the write, re-snapshots, and returns as soon as a watched file is newer.

## The contract

`ok: true` means a file under `Nodes/` or `ProjectFiles/NetSolution/bin` is newer than it was before the
first keystroke. Nothing else counts — not a delivered keystroke, not a clean-looking title bar.

| Field | Meaning |
| --- | --- |
| `method` | `keystroke:ctrl+s` |
| `saved_at` | mtime of the newest file that moved |
| `attempts` | raise+keystroke rounds tried |
| `keystrokes_sent` | rounds where the foreground was confirmed and Ctrl+S went out |
| `foreground_confirmed` | rounds where Studio actually owned the foreground |
| `latency_s` | wall time from first raise to the proof |

Failure codes name the cause, so the fix is chosen instead of guessed:

| Code | Cause | Fix |
| --- | --- | --- |
| `no_project` | no project folder given | pass `project=<folder holding the .optix>` |
| `unsupported_platform` | not Windows | save in Studio by hand |
| `studio_not_running` | no Studio window | open the project in Studio |
| `foreground_refused` | another window holds the foreground every attempt (a Windows Security prompt, a browser, this GUI) | close or dismiss that window; a `PickerHost.exe` credential prompt is the usual culprit |
| `no_write` | Ctrl+S delivered, foreground was Studio, nothing under `Nodes/` changed | Studio is probably showing a modal dialog — dismiss it and retry |

## Two things it does that surprise people

- **It saves; it does not rebuild.** Measured 2026-11-18: a save that moved 29 sources under
  `ProjectFiles/NetSolution` left `bin/<Project>.dll` at its older timestamp. The build is its own step —
  `optix_build action build` with the emulator stopped, or the solution opened from Studio's main toolbar
  (**Open .NET Solution**) built there. And a *loaded* NetLogic class only picks up new code after Studio
  restarts; a newly added bridge route answers `404 unknown route` until it does.
- **It needs `allowWrites`.** The tool writes the project to disk; it starts no process and edits no file
  itself.

## Why not just call a save API

There is none. The alternatives tried in this repository are worse: an in-process `Project.Save()` does
not exist, driving Studio's menu by automation is the same keystroke with more steps, and a file channel
that rewrites `Nodes/**` by hand is refused while Studio has the project open (Studio's next save would
overwrite it). The keystroke is the vendor's own path, so this tool makes it reliable and observable
rather than avoiding it.

## Reading the logs: `optix_logs`

`optix_save` proves the write; `optix_logs` explains a screen that renders nothing. Two logs matter:

| `which` | File | What it carries |
| --- | --- | --- |
| `runtime` (default) | `%LOCALAPPDATA%\AryaCode\OptixRuntime\<Project>-<hash>.log` | the project under test: NetLogic `Log.Info` lines, binder warnings ("Missing source variable 'Source0'"), store lines, method lookups |
| `bridge` | `%LOCALAPPDATA%\Rockwell Automation\FactoryTalk Optix\FTOptixStudio\Log\FTOptixStudio.0.log` | the bridge's own `Log.Info("StudioBridge", …)` lines and the vendor error text it turned into a JSON error |

Parameters: `which`, `project` (absolute folder, so the right runtime log is chosen rather than the newest),
`lines` (1..2000, default 80) and `filter` (case-insensitive substring). Both are read-only.

Worked example: a formatted label showed nothing while `attach_formatter` answered `applied: true`. Filtering
the runtime log to the NetLogic's own name named the failure immediately, and the fix (attach the formatter
through `SetConverter` before wiring the manual dynamic link) came from that line, not from the model.
## Calling behaviour: `optix_invoke`

Some things are behaviour, not data: acknowledging an alarm, closing a dialog, asking a logger to sample,
running a NetLogic `[ExportMethod]`. `optix_invoke` posts `POST /bridge/node/invoke?path=<node>&method=<name>`
and returns the bridge's answer - and that answer is worth reading, because it distinguishes two very
different situations:

| Answer | Means |
| --- | --- |
| `{"ok":true,…}` | the node's C# class ran the method |
| `execution_failed: No behaviour or observer found that handles the method '…'` | the node is a **plain object**, not a behaviour: a node the bridge created (`create_object`, `create_variable`, a widget) has no class behind it, so its methods do not exist to call |

That second case is not a broken tool - it is the reason the playbooks keep saying *"create the behaviour in
C#"*: an alarm made by `create_object` will never acknowledge, while one made by
`InformationModel.MakeObject<FTOptix.Alarm.DigitalAlarm>` in a runtime NetLogic does.

Needs `allowInvoke`. Arguments follow the bridge's own syntax (`name=value` pairs, semicolons between them).