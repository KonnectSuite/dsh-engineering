Worked cases, each with the answer the tools should give. Use them as a sanity check when a revision finding looks surprising.

Case 1 - legacy spelling in a pre-36 project.

- Project: Controller MajorRev 34, rung contains MOV.
- lookup {term: "MOV"} answers the MOVE instruction page: either spelling resolves at any revision.
- The composer emits MOV for this project, because the project prefers legacy spellings below 36.
- l5x_compare_projects does not report a spelling finding for MOV alone; the finding is a project that mixes MOV and MOVE.

Case 2 - asking the wrong help revision.

- Project: export written by v36.00.00.
- search {query: "message instruction", collection: "l5x-help-37-05"} without revision answers REVISION_REQUIRED.
- search {query: "message instruction", collection: "l5x-help-37-05", revision: "37.05.00"} answers from the v37 pages; the MSG page exists in both revisions, so this is legal but is documentation for the wrong release for this project.

Case 3 - instruction documented only after revision 36.

- Project: Controller MajorRev 36, draft contains ISNAN.
- The revision map records ISNAN for 37.05.00 only.
- The authored page (if present) read with revision "36.00.00" answers INSTRUCTION_NOT_IN_REVISION.
- Correct action: do not put ISNAN in a revision-36 project; rewrite with a comparison or raise the project revision deliberately.

Case 4 - guard artifact missing.

- knowledge/instruction-versions.json is deleted or corrupt.
- The adapter logs one warning and serves the instruction page.
- The documentation answer still works; only the revision check is skipped. This is the fail-open case and must never block an edit.

Case 5 - ASCII serial port instruction on a CompactLogix 5069.

- A draft adds ABL to a program for a 5069 controller.
- l5x_run_checks raises SERIAL_PORT_INSTRUCTION_UNSUPPORTED (critical): Studio rejects the build with RxCMP_E_AUDIT_INVALIDOPTYPE. Move the logic to a controller with a serial port, such as a 1756-L73.
- The instruction is documented in the v36 help only, so a search of l5x-help-36-00 finds it and l5x-help-37-05 does not.
