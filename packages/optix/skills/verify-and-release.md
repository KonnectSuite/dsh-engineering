# verify-and-release

"Done" in this plugin means a person can see it working, not that a call returned 200.

## The proof ladder

| Rung | Tool | Proves |
| --- | --- | --- |
| builds | `optix_build action="check"` | the C# compiles out of tree, 0 errors |
| saved | `optix_save` | the design model on disk moved |
| loads | `optix_emulator action="status"` | the runtime serves the preview |
| renders | `optix_screenshot` + `optix_preview action="text"` | the pixels and the strings a session shows |
| behaves | click it in the preview and screenshot the result | the wiring works, not just the model |
| reviewed | `optix_ui action="review"`, `optix_design_check`, `optix_production_check` | no critical design or release finding |
| navigates | `optix_nav action="verify"` | each bar button actually changes the panel |

## Traps that make a green result meaningless

- **A new session per screenshot.** `optix_preview` and `optix_screenshot` can attach a different browser
  session, and each session has its own NetLogic instances. A click and the following screenshot can
  legitimately disagree. Prefer confirming state with `optix_preview action="text"` in the same moment.
- **`saved_after_edit` from `optix_emulator` is bookkeeping.** It stays false until `optix_status saved:true`;
  the mtime of `Nodes/**` is the real evidence, which is what `optix_save` reports.
- **The pending counter never clears itself.** It is cleared by `optix_status` with `saved:true`, not by a save.
- **A screen that was never opened has no instance.** Logic that writes to `ShellRail/<Screen>/<child>` misses
  until that screen is mounted; retry caches must tolerate that.

## Release review

`optix_production_check` names the release blockers it can see: handlers pointing at absolute design-time
paths, a screen the panel cannot reach, presentation engines left on engineering defaults, screens outside
the screens folder. `optix_ui action="review"` grades the look; `optix_design_check` the touch and contrast
rules. Fix the critical findings, re-run, then save and restart before saying it is released.
