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

- **It rebuilds the .NET solution.** Studio's save also rebuilds `ProjectFiles/NetSolution/bin`, so a C#
  change becomes a loadable assembly here. But a *loaded* NetLogic class only picks up new code after
  Studio restarts; a newly added bridge route answers `404 unknown route` until it does.
- **It needs `allowWrites`.** The tool writes the project to disk; it starts no process and edits no file
  itself.

## Why not just call a save API

There is none. The alternatives tried in this repository are worse: an in-process `Project.Save()` does
not exist, driving Studio's menu by automation is the same keystroke with more steps, and a file channel
that rewrites `Nodes/**` by hand is refused while Studio has the project open (Studio's next save would
overwrite it). The keystroke is the vendor's own path, so this tool makes it reliable and observable
rather than avoiding it.
