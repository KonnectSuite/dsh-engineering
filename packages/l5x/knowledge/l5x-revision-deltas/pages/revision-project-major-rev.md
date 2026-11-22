The L5X export states the controller major revision in the controller's attributes (Controller MajorRev). The tools treat that value as the source of truth for instruction spelling:

- MajorRev 36 or later: the project prefers the IEC spellings (MOVE, EQ, SQRT, LIMIT, ...).
- MajorRev missing or below 36: the project is treated as pre-36, so legacy spellings (MOV, EQU, SQR, LIM, ...) are what the composer emits and what the review expects to see in existing rungs.

When you open a project, l5x_project_overview reports the controller and the structure; the export's software revision is recorded on the opened snapshot as the revision that wrote the file (observed_parse) or as untested_revision when the export declares a release this build has no measured profile for.

Why it matters for editing: the same authored instruction page answers for both revisions, but the rung you draft will use the project's preferred spelling. If you are preparing a draft that will later be pasted into Studio, take the paste text from l5x_rung_preview: it emits the spelling the target revision expects.

A frequent confusion: the controller major revision and the Studio 5000 release are not the same number. A v37 Studio installation can open projects whose Controller MajorRev is 34, and those projects keep their old spellings.
