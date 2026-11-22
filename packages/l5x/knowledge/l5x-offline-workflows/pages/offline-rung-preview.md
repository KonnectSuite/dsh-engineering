l5x_rung_preview returns two things for one rung: a paste_text in Studio's copy format, and a minimal L5X preview document.

The paste text is what makes the tool practical: Studio accepts rung text as space-separated mnemonics and operands, with parallel branches bracketed as BST/NXB/BND. Paste text from l5x_rung_preview into Studio's ladder editor and the rung appears as composed.

It needs neither an open project nor an L5X file when the rung is given directly; with an open project it can resolve tag names and apply the project's instruction spelling.

Limits to state when handing paste text to a human:

- the preview document is a preview, not an export: it is for viewing and pasting, not for importing as a project.
- paste text does not carry the rung comment; add the comment separately in Studio.
- the paste text uses the target revision's spelling, so do not mix paste text generated for two different revisions in one rung.
