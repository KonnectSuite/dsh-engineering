The draft lifecycle, in the order the tools enforce it:

- l5x_draft_rung appends a replace/insert/delete operation. It refuses a malformed rung, a rung that does not drive the right rail, a wrong operand count or type, and an unresolved tag. Nothing is written at this point.
- l5x_compose_rung composes one validated rung from a structure or one of the named patterns. It also writes a ladder preview document under .l5x-preview/ so a human can see what was composed, and the project stays untouched.
- l5x_compose_batch is all-or-nothing: if one rung in the batch is invalid, none are staged.
- l5x_draft_validate checks the accumulated draft against the open project and returns the hash, the diff and the findings. It writes nothing.
- l5x_draft_apply requires a validated draft. It writes ONE new file beside the source with a new name, never the source, never an overwrite, never a controller connection.
- l5x_export_rungs writes the rung-target shape for Import Rungs: pass the applied file or any export, pick the routine and the rung numbers, and Studio's Ladder Editor can import just those rungs. Use it when only some rungs change or when the import must respect pending edits. Its result also carries each rung's Studio copy text as paste_text, which is for review only (see the paste-text page); the file is the import path.

Practical rules:

- Re-open the project after applying if you are going to validate the new file: l5x_draft_apply returns the new path, and l5x_open_project on that path is the next step of a re-edit loop.
- Drafts are per session. A process restart loses the draft; the validated hash is the only durable record.
- A draft that reports an unverified coverage item still applies, but the answer must carry the unverified item into the review, not drop it.
