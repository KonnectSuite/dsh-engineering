l5x_rung_preview returns two things for one rung: a paste_text in Studio's copy format, and a minimal L5X preview document.

The paste text is Studio's rung copy format: space-separated mnemonics and operands, with parallel branches bracketed as BST/NXB/BND. Read it as a review form and as the text Studio itself puts on the clipboard when a rung is copied; do not treat it as an insert command. In Studio 5000 v37.05 a plain-text Ctrl+V into the ladder canvas does not create a rung — with an instruction selected it edits that instruction's text, and with nothing selected it does nothing (both observed). Apply an edit through the import files instead: the routine export from l5x_draft_apply for Import Routine, or the rung export from l5x_export_rungs for Import Rungs.

It needs neither an open project nor an L5X file when the rung is given directly; with an open project it can resolve tag names and apply the project's instruction spelling.

Limits to state when handing paste text to a human:

- the preview document is a preview, not an export: it is for viewing and pasting, not for importing as a project.
- paste text does not carry the rung comment; add the comment separately in Studio.
- the paste text uses the target revision's spelling, so do not mix paste text generated for two different revisions in one rung.
- plain-text paste into the ladder canvas is not a reliable insert path in Studio 37.05; use the import routes above.
