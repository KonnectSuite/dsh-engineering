p="README.md"; s=open(p,encoding="utf-8-sig").read()
s=s.replace("| `mwi` | MotionWorks IEC session, reads, verify and guidance; optionally the edits | `edit` (off) |", "| `mwi` | MotionWorks IEC session, reads, verify and guidance; optionally the edits | `workspace` (empty), `edit` (off) |")
needle="A read-only profile should not pay for nine draft schemas or a controller surface."
add="A read-only profile should not pay for nine draft schemas or a controller surface. MotionWorks also takes a `workspace` setting: the host does not always pass the session directory, so set the folder that holds the projects (or leave the `mwi.workspace` marker in the profile) before turning edits on."
s=s.replace(needle, add)
open(p,"w",encoding="utf-8",newline="\n").write(s)
print("ok", s.count("workspace"))
