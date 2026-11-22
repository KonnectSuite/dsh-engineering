Every L5X tool returns the same JSON envelope on failure:

    {
      "ok": false,
      "action": "...",
      "error": {
        "code": "TAG_NOT_FOUND",
        "message": "Tag "Start" does not exist in ...",
        "fix": "Call l5x_search_logic to find the tag name, then retry.",
        "candidates": ["Start_PB", "StartPB"]
      }
    }

Rules the envelope follows:

- ok is always false on failure and true on success; a caller checks ok first.
- action names the call that failed, so a multi-call chat answer can match an error to a step.
- code is stable and machine-readable. Do not parse message text; match code.
- message states what happened in one sentence, with the names that matter.
- fix tells the caller what to do next, usually naming the tool or argument to change.
- candidates appears when a near-match exists: the closest ids, tags or instruction names. Use it instead of guessing.
- roots appears on SOURCE_NOT_INSTALLED: the filesystem roots the adapter searched.
- revisions appears when a revision conflict is reported.

Unexpected failures return code INTERNAL with the fix "Retry the call; if it fails the same way, report the message and the arguments used." An INTERNAL code is a defect in this bundle, not a caller mistake: record the arguments.
